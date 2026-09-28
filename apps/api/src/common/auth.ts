import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@masar/shared';
import { PrismaService } from './prisma.service';
import { config } from './config';

export interface AuthUser {
  id: string;
  role: Role;
  deptId: string;
  empId: string;
}

export interface SessionClaims {
  sub: string;
  v: number;
  kind: 'session';
}

const PUBLIC = 'masar:public';
const ROLES = 'masar:roles';

/** Route needs no session. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route is limited to these roles (on top of being signed in). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** The signed-in employee. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === config.cookieName) return decodeURIComponent(v.join('='));
  }
  return null;
}

@Injectable()
export class SessionVerifier {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  /** Checks the token and that the account is still active and the session not revoked. */
  async verify(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    let claims: SessionClaims;
    try {
      claims = await this.jwt.verifyAsync<SessionClaims>(token);
    } catch {
      return null;
    }
    if (claims.kind !== 'session') return null;
    const u = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, role: true, deptId: true, empId: true, active: true, tokenVersion: true } });
    if (!u || !u.active || u.tokenVersion !== claims.v) return null;
    return { id: u.id, role: u.role, deptId: u.deptId, empId: u.empId };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private sessions: SessionVerifier) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = await this.sessions.verify(readSessionCookie(req.headers.cookie));
    if (!user) throw new UnauthorizedException({ code: 'signedOut' });
    req.user = user;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException({ code: 'forbidden' });
    return true;
  }
}
