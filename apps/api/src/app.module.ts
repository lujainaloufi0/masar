import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule, PrismaService } from './common/prisma.service';
import { AuthGuard, Public, SessionVerifier } from './common/auth';
import { config } from './common/config';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { PeopleController } from './people/people.controller';
import { PeopleService } from './people/people.service';
import { OrgController } from './org/org.controller';
import { OrgService } from './org/org.service';
import { ActivityService } from './activity/activity.service';
import { NotificationsService } from './notifications/notifications.service';
import { Events, EventsGateway } from './realtime/events';
import { Scheduler } from './demo/demo.scheduler';
import { AttachmentsController, AttachmentsService } from './attachments/attachments';
import { AssistantController } from './assistant/assistant.controller';
import { AssistantService } from './assistant/assistant.service';
import { CHAT_MODEL, modelFromEnv } from './assistant/llm';

@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}
  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: config.jwtSecret }),
    ScheduleModule.forRoot(),
    // General limit for every route; login and password routes set a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [HealthController, AuthController, TasksController, PeopleController, OrgController, AttachmentsController, AssistantController],
  providers: [
    SessionVerifier,
    AuthService,
    TasksService,
    PeopleService,
    OrgService,
    ActivityService,
    NotificationsService,
    EventsGateway,
    Events,
    Scheduler,
    AttachmentsService,
    AssistantService,
    // Switched off (null) when no AI_API_KEY is set.
    { provide: CHAT_MODEL, useFactory: () => modelFromEnv() },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
