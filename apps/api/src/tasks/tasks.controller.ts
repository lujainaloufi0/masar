import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { TasksService } from './tasks.service';

const TaskBody = z.object({
  groupId: z.string().min(1),
  title: z.string().trim().min(1, 'errTitle').max(200),
  desc: z.string().max(4000).default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errStart').optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'errDue'),
  assigneeIds: z.array(z.string()).min(1, 'errAssignee').max(50),
  steps: z.array(z.object({ id: z.string().nullish(), text: z.string().max(300) })).min(1, 'errSteps').max(60),
  lang: z.enum(['en', 'ar']).default('en'),
});
const ToggleBody = z.object({ done: z.boolean().optional() });
const AssignBody = z.object({ userId: z.string().min(1) });

@Controller('tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.tasks.list(me);
  }

  @Get(':id')
  get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.tasks.get(me, id);
  }

  @Post()
  create(@CurrentUser() me: AuthUser, @Body(new ZodPipe(TaskBody)) body: z.infer<typeof TaskBody>) {
    return this.tasks.create(me, body);
  }

  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new ZodPipe(TaskBody)) body: z.infer<typeof TaskBody>) {
    return this.tasks.update(me, id, body);
  }

  @Post(':id/steps/:stepId/toggle')
  @HttpCode(200)
  toggle(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('stepId') stepId: string, @Body(new ZodPipe(ToggleBody)) body: z.infer<typeof ToggleBody>) {
    return this.tasks.toggleStep(me, id, stepId, body.done);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.tasks.cancel(me, id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.tasks.restore(me, id);
  }

  @Delete(':id')
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.tasks.remove(me, id);
  }

  @Post(':id/assignees')
  @HttpCode(200)
  assign(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new ZodPipe(AssignBody)) body: z.infer<typeof AssignBody>) {
    return this.tasks.addAssignee(me, id, body.userId);
  }

  @Delete(':id/assignees/:userId')
  unassign(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.tasks.removeAssignee(me, id, userId);
  }
}
