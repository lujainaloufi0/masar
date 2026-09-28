import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { config } from '../common/config';
import type { SessionClaims } from '../common/auth';
import { DEMO_ACCOUNTS, ORG, USERS } from '../demo/seed-data';

interface SetupClaims {
  sub: string;
  kind: 'setup';
}

/** A fixed hash to compare against when the ID is unknown, so timing does not reveal which IDs exist. */
let dummyHash: Promise<string> | null = null;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private activity: ActivityService) {}

  /** Accepts "WDA-10482", "wda-10482" or just "10482". */
  normalizeEmpId(raw: string) {
    const s = raw.trim().toUpperCase();
    return /^\d+$/.test(s) ? `${ORG.idPrefix}-${s}` : s;
  }

  /**
   * Employee ID + password. A new employee enters their one-time activation code
   * as the password and is sent on to choose a real password.
   * Every failure returns the same message, so the form does not reveal which IDs exist.
   */
  async login(rawId: string, password: string) {
    dummyHash ??= hash('masar-timing-equalizer');
    const u = await this.prisma.user.findUnique({ where: { empId: this.normalizeEmpId(rawId) } });
    const fail = () => new UnauthorizedException({ code: 'errCredentials' });
    if (!u || !u.active) {
      await verify(await dummyHash, password).catch(() => false);
      throw fail();
    }
    if (!u.passwordHash) {
      if (!u.activationCodeHash || !(await verify(u.activationCodeHash, password.trim().toUpperCase()).catch(() => false))) throw fail();
      return { status: 'setup' as const, setupToken: await this.setupToken(u.id), name: { en: u.nameEn, ar: u.nameAr } };
    }
    if (!(await verify(u.passwordHash, password).catch(() => false))) throw fail();
    return { status: 'ok' as const, userId: u.id, token: await this.sessionToken(u.id, u.tokenVersion) };
  }

  async setPassword(setupToken: string, password: string) {
    let claims: SetupClaims;
    try {
      claims = await this.jwt.verifyAsync<SetupClaims>(setupToken);
    } catch {
      throw new UnauthorizedException({ code: 'setupExpired' });
    }
    if (claims.kind !== 'setup') throw new UnauthorizedException({ code: 'setupExpired' });
    const u = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!u || !u.active || u.passwordHash) throw new UnauthorizedException({ code: 'setupExpired' });
    const updated = await this.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await hash(password), activationCodeHash: null, tokenVersion: { increment: 1 } },
    });
    await this.activity.log({ type: 'first_signin', actorId: u.id, subject: { id: u.id, deptId: u.deptId } });
    return { token: await this.sessionToken(u.id, updated.tokenVersion), userId: u.id };
  }

  /* ---------- Public demo only ---------- */

  async demoAccounts() {
    if (!config.demoMode) throw new NotFoundException();
    const empIds = DEMO_ACCOUNTS.map((d) => `${ORG.idPrefix}-${USERS.find((u) => u.key === d.key)!.num}`);
    const users = await this.prisma.user.findMany({ where: { empId: { in: empIds }, active: true }, include: { dept: true } });
    return DEMO_ACCOUNTS.flatMap((d, i) => {
      const u = users.find((x) => x.empId === empIds[i]);
      return u ? [{ empId: u.empId, name: { en: u.nameEn, ar: u.nameAr }, role: u.role, dept: { en: u.dept.nameEn, ar: u.dept.nameAr }, note: d.note ?? null, pending: !u.passwordHash }] : [];
    });
  }

  /** One-click sign-in for the fixed list of fictional demo accounts. Disabled outside demo mode. */
  async demoLogin(empId: string) {
    if (!config.demoMode) throw new NotFoundException();
    const allowed = DEMO_ACCOUNTS.map((d) => `${ORG.idPrefix}-${USERS.find((u) => u.key === d.key)!.num}`);
    if (!allowed.includes(empId)) throw new ForbiddenException({ code: 'forbidden' });
    const u = await this.prisma.user.findUnique({ where: { empId } });
    if (!u || !u.active) throw new UnauthorizedException({ code: 'errCredentials' });
    if (!u.passwordHash) return { status: 'setup' as const, setupToken: await this.setupToken(u.id), name: { en: u.nameEn, ar: u.nameAr } };
    return { status: 'ok' as const, userId: u.id, token: await this.sessionToken(u.id, u.tokenVersion) };
  }

  /* ---------- Tokens and cookie ---------- */

  sessionToken(userId: string, v: number) {
    const claims: SessionClaims = { sub: userId, v, kind: 'session' };
    return this.jwt.signAsync(claims, { expiresIn: `${config.sessionHours}h` });
  }

  setupToken(userId: string) {
    const claims: SetupClaims = { sub: userId, kind: 'setup' };
    return this.jwt.signAsync(claims, { expiresIn: '15m' });
  }

  setCookie(res: Response, token: string) {
    res.cookie(config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/',
      maxAge: config.sessionHours * 3600_000,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(config.cookieName, { path: '/' });
  }
}
