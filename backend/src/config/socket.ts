import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models';

let ioInstance: SocketIOServer | null = null;

export const setIO = (io: SocketIOServer | null) => {
  ioInstance = io;
};

export const getIO = (): SocketIOServer | null => {
  return ioInstance;
};

/**
 * Authenticates Socket.IO handshakes via JWT (if supplied) and assigns
 * verified users to private `user:<id>` and `role:admin` rooms.
 */
export const configureSocketAuth = (io: SocketIOServer) => {
  io.use(async (socket, next) => {
    try {
      const rawAuthToken =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.headers?.authorization === 'string'
          ? socket.handshake.headers.authorization.split(' ')[1]
          : '');

      if (!rawAuthToken || typeof rawAuthToken !== 'string') {
        return next();
      }

      const decoded: any = jwt.verify(
        rawAuthToken,
        process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026'
      );
      if (decoded?.id) {
        const user = await User.findById(decoded.id).select('_id role tokenVersion').lean();
        const userTokenVersion = typeof user?.tokenVersion === 'number' ? user.tokenVersion : 0;
        const tokenVersionMatches =
          typeof decoded.tv === 'number' && decoded.tv === userTokenVersion;
        if (user && tokenVersionMatches) {
          socket.data.userId = String(user._id);
          socket.data.role = user.role;
        }
      }
    } catch {
      // Invalid/expired token: allow connection without joining privileged rooms
    }
    return next();
  });

  io.on('connection', (socket) => {
    if (socket.data?.userId) {
      socket.join(`user:${socket.data.userId}`);
    }
    if (socket.data?.role === 'admin') {
      socket.join('role:admin');
    }
  });
};

export const disconnectUserSockets = (userId: string) => {
  if (ioInstance && userId) {
    ioInstance.in(`user:${userId}`).disconnectSockets(true);
  }
};

export const emitEvent = (event: string, data: any) => {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
};

/**
 * Emits order lifecycle events strictly to administrators and the order owner,
 * preventing PII / order data leaks to anonymous or unrelated sockets.
 */
export const emitOrderEvent = (event: string, orderPayload: any) => {
  if (!ioInstance) return;

  const rawOwner = orderPayload?.userId;
  const ownerId =
    rawOwner && typeof rawOwner === 'object' && rawOwner._id
      ? String(rawOwner._id)
      : rawOwner
        ? String(rawOwner)
        : '';

  ioInstance.to('role:admin').emit(event, orderPayload);
  if (ownerId) {
    ioInstance.to(`user:${ownerId}`).emit(event, orderPayload);
  }
};
