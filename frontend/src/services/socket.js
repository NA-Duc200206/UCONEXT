import { io } from 'socket.io-client';

let socket = null;
let lastAuthToken = null;

export const getSocket = () => {
  const currentToken = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';

  if (socket && lastAuthToken !== currentToken) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    lastAuthToken = currentToken;
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: (cb) => {
        const latestToken = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
        cb({ token: latestToken });
      },
    });
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastAuthToken = null;
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('uconext:auth-expired', disconnectSocket);
}

export const subscribeToEvent = (event, callback) => {
  const s = getSocket();
  s.on(event, callback);
  return () => {
    s.off(event, callback);
  };
};
