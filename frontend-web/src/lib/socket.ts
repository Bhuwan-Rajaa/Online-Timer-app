import { io, Socket } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export const socket: Socket = io(socketUrl, {
  autoConnect: false, // We'll connect manually once authenticated
  reconnection: true,
  reconnectionAttempts: Infinity, // Keep trying forever — Render free-tier can cold-start
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000, // Cap backoff at 10 seconds
});
