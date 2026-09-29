import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { isScheduled, type TaskDTO } from '@masar/shared';
import { orgToday } from '../common/today';
import { SessionVerifier, readSessionCookie } from '../common/auth';
import { config } from '../common/config';

export const rooms = {
  dept: (id: string) => `dept:${id}`,
  managers: (deptId: string) => `managers:${deptId}`,
  user: (id: string) => `user:${id}`,
  admins: 'admins',
  people: 'people', // HR and admins, who see every employee record
  all: 'all',
};

/**
 * Live updates. Each signed-in browser joins rooms for its department, itself,
 * and (for HR and admins) the organization-wide rooms. The server only pushes
 * to rooms whose members are allowed to see the data.
 */
// No trailing slash, so the path survives proxies (like Next.js rewrites) that normalize URLs.
@WebSocketGateway({ path: '/socket.io', addTrailingSlash: false, cors: { origin: config.webOrigin, credentials: true } })
export class EventsGateway implements OnGatewayConnection {
  private log = new Logger('Realtime');
  @WebSocketServer() server: Server;

  constructor(private sessions: SessionVerifier) {}

  async handleConnection(socket: Socket) {
    const user = await this.sessions.verify(readSessionCookie(socket.handshake.headers.cookie));
    if (!user) {
      socket.emit('auth:required');
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    const join = [rooms.all, rooms.user(user.id), rooms.dept(user.deptId)];
    if (user.role === 'admin') join.push(rooms.admins);
    if (user.role === 'manager') join.push(rooms.managers(user.deptId));
    if (user.role === 'admin' || user.role === 'hr') join.push(rooms.people);
    await socket.join(join);
    this.log.debug(`${user.empId} connected`);
  }
}

@Injectable()
export class Events {
  constructor(private gw: EventsGateway) {}

  private to(roomsList: string[]) {
    return this.gw.server?.to(roomsList);
  }

  /**
   * A task changed. Sent to its department and to administrators.
   * A scheduled task goes only to the department's managers and administrators; everyone
   * else in the department is told to drop it, in case they had it before it was rescheduled.
   */
  task(task: TaskDTO) {
    if (isScheduled(task, orgToday())) {
      this.to([rooms.dept(task.deptId)])?.emit('task:deleted', { id: task.id, deptId: task.deptId });
      this.to([rooms.managers(task.deptId), rooms.admins])?.emit('task:changed', task);
      return;
    }
    this.to([rooms.dept(task.deptId), rooms.admins])?.emit('task:changed', task);
  }

  taskDeleted(id: string, deptId: string) {
    this.to([rooms.dept(deptId), rooms.admins])?.emit('task:deleted', { id, deptId });
  }

  /** Something that changes shared lists (people, groups, departments, stats). */
  org(deptIds: string[] = []) {
    this.to([rooms.people, ...deptIds.map(rooms.dept)])?.emit('org:changed');
  }

  notify(userIds: string[]) {
    if (userIds.length) this.to(userIds.map(rooms.user))?.emit('notifications:changed');
  }

  /** A deactivated employee is signed out everywhere at once. */
  signOut(userId: string) {
    this.to([rooms.user(userId)])?.emit('auth:required');
    this.gw.server?.in(rooms.user(userId)).disconnectSockets(true);
  }

  reset() {
    this.gw.server?.emit('demo:reset');
  }
}
