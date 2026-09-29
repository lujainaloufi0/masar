import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { canAttach, canManageTask, canViewTask } from '@masar/shared';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, type AuthUser } from '../common/auth';
import { TASK_INCLUDE, taskRef, toAttachment, toTask } from '../common/mappers';
import { orgToday } from '../common/today';
import { ActivityService } from '../activity/activity.service';
import { Events } from '../realtime/events';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_TASK = 50;

/**
 * Types a browser may show inside the page. Everything else is served as a download,
 * so an uploaded HTML or SVG file can never run as part of the app.
 */
const INLINE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
  'application/pdf',
]);

const LIST_SELECT = { id: true, taskId: true, stepId: true, uploaderId: true, name: true, mime: true, size: true, createdAt: true } as const;

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private activity: ActivityService, private events: Events) {}

  private async task(me: AuthUser, taskId: string) {
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
    if (!t || !canViewTask(me, taskRef(t), orgToday())) throw new NotFoundException({ code: 'notFound' });
    return t;
  }

  private async publish(taskId: string) {
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, include: TASK_INCLUDE });
    if (t) this.events.task(toTask(t));
  }

  async list(me: AuthUser, taskId: string) {
    await this.task(me, taskId);
    const rows = await this.prisma.attachment.findMany({ where: { taskId }, select: LIST_SELECT, orderBy: { createdAt: 'desc' } });
    return rows.map(toAttachment);
  }

  async add(me: AuthUser, taskId: string, file: Express.Multer.File | undefined, stepId?: string) {
    if (!file) throw new BadRequestException({ code: 'invalid', fields: { file: 'errFileMissing' } });
    const t = await this.task(me, taskId);
    if (!canAttach(me, taskRef(t))) throw new ForbiddenException({ code: 'forbidden' });
    if (stepId && !t.steps.some((x) => x.id === stepId)) throw new BadRequestException({ code: 'invalid', fields: { stepId: 'errGeneric' } });
    if ((t._count?.attachments ?? 0) >= MAX_FILES_PER_TASK) throw new BadRequestException({ code: 'errTooManyFiles' });
    // Multer decodes names as latin1; browsers send UTF-8 (Arabic file names, for example).
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'file';
    const row = await this.prisma.attachment.create({
      data: { taskId, stepId: stepId || null, uploaderId: me.id, name, mime: (file.mimetype || 'application/octet-stream').slice(0, 100), size: file.size, data: new Uint8Array(file.buffer) },
      select: LIST_SELECT,
    });
    await this.activity.log({ type: 'attachment_added', actorId: me.id, task: { id: t.id, titleEn: t.titleEn, titleAr: t.titleAr, deptId: t.deptId } });
    await this.publish(taskId);
    return toAttachment(row);
  }

  async download(me: AuthUser, id: string, res: Response) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException({ code: 'notFound' });
    await this.task(me, a.taskId);
    const inline = INLINE.has(a.mime);
    res.setHeader('Content-Type', inline ? a.mime : 'application/octet-stream');
    res.setHeader('Content-Length', String(a.size));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.end(Buffer.from(a.data));
  }

  /** The person who uploaded a file, or anyone who manages the task, can remove it. */
  async remove(me: AuthUser, id: string) {
    const a = await this.prisma.attachment.findUnique({ where: { id }, select: { id: true, taskId: true, uploaderId: true } });
    if (!a) throw new NotFoundException({ code: 'notFound' });
    const t = await this.task(me, a.taskId);
    if (a.uploaderId !== me.id && !canManageTask(me, taskRef(t))) throw new ForbiddenException({ code: 'forbidden' });
    await this.prisma.attachment.delete({ where: { id } });
    await this.activity.log({ type: 'attachment_removed', actorId: me.id, task: { id: t.id, titleEn: t.titleEn, titleAr: t.titleAr, deptId: t.deptId } });
    await this.publish(t.id);
    return { ok: true };
  }
}

@Controller()
export class AttachmentsController {
  constructor(private files: AttachmentsService) {}

  @Get('tasks/:id/attachments')
  list(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.files.list(me, id);
  }

  @Post('tasks/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  add(@CurrentUser() me: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Body() body: { stepId?: string }) {
    return this.files.add(me, id, file, typeof body?.stepId === 'string' && body.stepId ? body.stepId : undefined);
  }

  @Get('attachments/:id')
  download(@CurrentUser() me: AuthUser, @Param('id') id: string, @Res() res: Response) {
    return this.files.download(me, id, res);
  }

  @Delete('attachments/:id')
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.files.remove(me, id);
  }
}
