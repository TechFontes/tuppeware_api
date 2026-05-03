import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import webSocketService from '../services/WebSocketService';

/**
 * Resolve `FRONTEND_URL` do .env como string única, lista CSV, ou `*`.
 *
 * Aceita:
 *   FRONTEND_URL=https://app.tupperwarees.com.br
 *   FRONTEND_URL=https://app.tupperwarees.com.br,http://localhost:5173
 *   FRONTEND_URL=*
 *   (vazio → '*')
 */
const resolveAllowedOrigins = (): string | string[] => {
  const raw = process.env.FRONTEND_URL?.trim();
  if (!raw || raw === '*') return '*';

  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
};

/**
 * Configura o servidor WebSocket (Socket.IO).
 * @param httpServer - Instância do servidor HTTP
 * @returns Instância do Socket.IO
 */
const setupWebSocket = (httpServer: http.Server): SocketIOServer => {
  const allowedOrigins = resolveAllowedOrigins();

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Inicializa o serviço de WebSocket com a instância do Socket.IO
  webSocketService.initialize(io);

  console.info('WebSocket configurado. Origins permitidos:', allowedOrigins);

  return io;
};

export { setupWebSocket };
