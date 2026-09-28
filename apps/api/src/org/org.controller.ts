import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { OrgService } from './org.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';

const HeadBody = z.object({ userId: z.string().min(1) });
const GroupBody = z.object({ name: z.string().trim().min(1, 'errGroup').max(80) });

@Controller()
export class OrgController {
  constructor(private org: OrgService, private activity: ActivityService, private notes: NotificationsService) {}

  @Get('bootstrap')
  bootstrap(@CurrentUser() me: AuthUser) {
    return this.org.bootstrap(me);
  }

  @Get('stats')
  stats() {
    return this.org.stats();
  }

  @Get('completed')
  completed(@CurrentUser() me: AuthUser) {
    return this.org.completed(me);
  }

  @Get('activity')
  activityLog(@CurrentUser() me: AuthUser) {
    return this.activity.visibleFor(me);
  }

  @Get('notifications')
  notifications(@CurrentUser() me: AuthUser) {
    return this.notes.list(me.id);
  }

  @Post('notifications/read')
  @HttpCode(200)
  async readAll(@CurrentUser() me: AuthUser) {
    await this.notes.markRead(me.id);
    return { ok: true };
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async readOne(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.notes.markRead(me.id, id);
    return { ok: true };
  }

  @Patch('departments/:id/head')
  @Roles('admin')
  setHead(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new ZodPipe(HeadBody)) body: z.infer<typeof HeadBody>) {
    return this.org.setHead(me, id, body.userId);
  }

  @Post('departments/:id/groups')
  @Roles('admin')
  addGroup(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new ZodPipe(GroupBody)) body: z.infer<typeof GroupBody>) {
    return this.org.addGroup(me, id, body.name);
  }
}
