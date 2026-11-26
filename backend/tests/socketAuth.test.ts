import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { connectTestDB, clearTestDB, disconnectTestDB } from './dbHelper';
import { User } from '../src/models';
import { getJwtSecret } from '../src/config/env';
import {
  configureSocketAuth,
  disconnectUserSockets,
  emitEvent,
  emitOrderEvent,
  getIO,
  setIO,
} from '../src/config/socket';

function createMockIo() {
  let middlewareFn: ((socket: any, next: () => void) => Promise<void> | void) | null = null;
  let connectionHandler: ((socket: any) => void) | null = null;
  const roomEmits: Array<{ room: string; event: string; payload: any }> = [];
  const globalEmits: Array<{ event: string; payload: any }> = [];
  const disconnectedRooms: string[] = [];

  const io: any = {
    use(fn: any) {
      middlewareFn = fn;
    },
    on(event: string, fn: any) {
      if (event === 'connection') connectionHandler = fn;
    },
    emit(event: string, payload: any) {
      globalEmits.push({ event, payload });
    },
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          roomEmits.push({ room, event, payload });
        },
      };
    },
    in(room: string) {
      return {
        disconnectSockets(_close: boolean) {
          disconnectedRooms.push(room);
        },
      };
    },
  };

  return {
    io,
    roomEmits,
    globalEmits,
    disconnectedRooms,
    async simulateConnect(handshake: any) {
      const joinedRooms: string[] = [];
      const socket: any = {
        handshake,
        data: {},
        join: vi.fn((room: string) => joinedRooms.push(room)),
      };
      const next = vi.fn();
      await middlewareFn!(socket, next);
      expect(next).toHaveBeenCalledTimes(1);
      connectionHandler!(socket);
      return { socket, joinedRooms };
    },
  };
}

describe('socket auth, room scoping, and order event delivery', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterEach(async () => {
    setIO(null);
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it('assigns authenticated customer/admin sockets to scoped rooms and ignores invalid or revoked tokens', async () => {
    const customer = await User.create({
      name: 'Socket Customer',
      email: 'sock.customer@uconext.test',
      password: 'hashed_password',
      role: 'customer',
      tokenVersion: 2,
    });
    const admin = await User.create({
      name: 'Socket Admin',
      email: 'sock.admin@uconext.test',
      password: 'hashed_password',
      role: 'admin',
      tokenVersion: 0,
    });

    const mock = createMockIo();
    configureSocketAuth(mock.io);

    // 1. Anonymous connection joins no private rooms
    const anon = await mock.simulateConnect({ auth: {}, headers: {} });
    expect(anon.joinedRooms).toEqual([]);

    // 2. Valid customer JWT via auth.token joins only user:<id>
    const customerToken = jwt.sign(
      { id: customer._id.toString(), role: 'customer', tv: 2 },
      getJwtSecret(),
      { expiresIn: '1h' }
    );
    const custConn = await mock.simulateConnect({ auth: { token: customerToken }, headers: {} });
    expect(custConn.joinedRooms).toEqual([`user:${customer._id.toString()}`]);

    // 3. Valid admin JWT via Authorization header joins both user:<id> and role:admin
    const adminToken = jwt.sign(
      { id: admin._id.toString(), role: 'admin', tv: 0 },
      getJwtSecret(),
      { expiresIn: '1h' }
    );
    const adminConn = await mock.simulateConnect({
      auth: {},
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminConn.joinedRooms).toEqual([`user:${admin._id.toString()}`, 'role:admin']);

    // 4. Stale tokenVersion (revoked session) is rejected from joining private rooms
    const revokedToken = jwt.sign(
      { id: customer._id.toString(), role: 'customer', tv: 1 },
      getJwtSecret(),
      { expiresIn: '1h' }
    );
    const revokedConn = await mock.simulateConnect({ auth: { token: revokedToken }, headers: {} });
    expect(revokedConn.joinedRooms).toEqual([]);

    // 5. Malformed JWT does not throw and joins no rooms
    const badConn = await mock.simulateConnect({ auth: { token: 'not.a.jwt' }, headers: {} });
    expect(badConn.joinedRooms).toEqual([]);
  });

  it('scopes emitOrderEvent to role:admin and owner room and disconnects revoked users', () => {
    // No-op safely when IO is null
    expect(getIO()).toBeNull();
    emitOrderEvent('order:created', { userId: 'abc' });
    emitEvent('catalog:refresh', { ok: true });
    disconnectUserSockets('abc');

    const mock = createMockIo();
    setIO(mock.io);
    expect(getIO()).toBe(mock.io);

    emitOrderEvent('order:created', { id: 'o1', userId: 'user-123' });
    emitOrderEvent('order:updated', { id: 'o2', userId: { _id: 'user-456' } });
    emitEvent('announcement', { msg: 'hi' });
    disconnectUserSockets('user-123');

    expect(mock.roomEmits).toEqual([
      { room: 'role:admin', event: 'order:created', payload: { id: 'o1', userId: 'user-123' } },
      { room: 'user:user-123', event: 'order:created', payload: { id: 'o1', userId: 'user-123' } },
      { room: 'role:admin', event: 'order:updated', payload: { id: 'o2', userId: { _id: 'user-456' } } },
      { room: 'user:user-456', event: 'order:updated', payload: { id: 'o2', userId: { _id: 'user-456' } } },
    ]);
    expect(mock.globalEmits).toEqual([{ event: 'announcement', payload: { msg: 'hi' } }]);
    expect(mock.disconnectedRooms).toEqual(['user:user-123']);
  });
});
