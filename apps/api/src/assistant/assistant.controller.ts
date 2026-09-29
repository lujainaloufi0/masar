import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { AssistantService } from './assistant.service';

const AskBody = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(12)
    .default([]),
  lang: z.enum(['en', 'ar']).default('en'),
});

@Controller('assistant')
export class AssistantController {
  constructor(private assistant: AssistantService) {}

  @Get('status')
  status() {
    return { enabled: this.assistant.enabled };
  }

  @Post('ask')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ask(@CurrentUser() me: AuthUser, @Body(new ZodPipe(AskBody)) body: z.infer<typeof AskBody>) {
    return this.assistant.ask(me, body.question, body.history, body.lang);
  }
}
