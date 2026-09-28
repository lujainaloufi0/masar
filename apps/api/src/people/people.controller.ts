import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ROLES } from '@masar/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { PeopleService } from './people.service';

const PersonBody = z.object({
  nameEn: z.string().trim().min(2, 'errName').max(120),
  nameAr: z.string().trim().min(2, 'errName').max(120),
  email: z.string().trim().email('errEmail').max(200),
  titleEn: z.string().trim().max(120).default(''),
  titleAr: z.string().trim().max(120).default(''),
  deptId: z.string().min(1),
  groupId: z.string().min(1, 'errGroup'),
  role: z.enum(ROLES),
});

@Controller('employees')
export class PeopleController {
  constructor(private people: PeopleService) {}

  @Get()
  @Roles('hr', 'admin')
  list() {
    return this.people.list();
  }

  @Post()
  @Roles('hr')
  create(@CurrentUser() me: AuthUser, @Body(new ZodPipe(PersonBody)) body: z.infer<typeof PersonBody>) {
    return this.people.create(me, body);
  }

  @Patch(':id')
  @Roles('hr')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body(new ZodPipe(PersonBody)) body: z.infer<typeof PersonBody>) {
    return this.people.update(me, id, body);
  }

  @Post(':id/deactivate')
  @Roles('hr')
  @HttpCode(200)
  deactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.people.deactivate(me, id);
  }

  @Post(':id/reactivate')
  @Roles('hr')
  @HttpCode(200)
  reactivate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.people.reactivate(me, id);
  }

  @Post(':id/activation-code')
  @Roles('hr')
  @HttpCode(200)
  code(@Param('id') id: string) {
    return this.people.newCode(id);
  }
}
