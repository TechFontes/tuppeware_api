import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import webSocketService from '../services/WebSocketService';

/**
 * Configura o servidor WebSocket (Socket.IO).
 * @param httpServer - Instância do servidor HTTP
 * @returns Instância do Socket.IO
 */
const setupWebSocket = (httpServer: http.Server): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  // Inicializa o serviço de WebSocket com a instância do Socket.IO
  webSocketService.initialize(io);

  console.info('WebSocket configurado com sucesso.');

  return io;
};

export { setupWebSocket };
