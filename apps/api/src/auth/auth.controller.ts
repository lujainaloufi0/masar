import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { config } from '../common/config';
import { AuthService } from './auth.service';
import { DEMO_ACTIVATION_CODE, DEMO_PASSWORD } from '../demo/seed';

const LoginBody = z.object({ empId: z.string().trim().min(1).max(40), password: z.string().min(1).max(200) });
const SetupBody = z.object({ setupToken: z.string().min(10), password: z.string().min(8, 'errPwShort').max(200) });
const DemoBody = z.object({ empId: z.string().min(1).max(40) });

/** Five attempts a minute per address for anything that checks a secret. */
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Get('config')
  cfg() {
    // The demo credentials are public on purpose: fictional accounts, reset every night.
    return config.demoMode ? { demoMode: true, demoPassword: DEMO_PASSWORD, demoCode: DEMO_ACTIVATION_CODE } : { demoMode: false };
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.empId, body.password);
    if (r.status === 'setup') return r;
    this.auth.setCookie(res, r.token);
    return { status: 'ok' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('setup-password')
  @HttpCode(200)
  async setup(@Body(new ZodPipe(SetupBody)) body: z.infer<typeof SetupBody>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.setPassword(body.setupToken, body.password);
    this.auth.setCookie(res, r.token);
    return { status: 'ok' };
  }

  @Public()
  @Get('demo-accounts')
  demoAccounts() {
    return this.auth.demoAccounts();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('demo')
  @HttpCode(200)
  async demo(@Body(new ZodPipe(DemoBody)) body: z.infer<typeof DemoBody>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.demoLogin(body.empId);
    if (r.status === 'setup') return r;
    this.auth.setCookie(res, r.token);
    return { status: 'ok' };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    this.auth.clearCookie(res);
    return { status: 'ok' };
  }
}
