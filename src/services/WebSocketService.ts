import jwt from 'jsonwebtoken';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { jwtSecret } from '../config/auth';

/**
 * Serviço de WebSocket para comunicação em tempo real.
 * Utiliza Socket.IO para emitir eventos de atualização de status.
 */
export class WebSocketService {
  private io: SocketIOServer | null;
  private connectedUsers: Map<string, string>;

  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  /**
   * Inicializa o serviço com a instância do Socket.IO.
   */
  initialize(io: SocketIOServer): void {
    this.io = io;

    io.on('connection', (socket: Socket) => {
      console.info(`WebSocket: cliente conectado - ${socket.id}`);

      // Registra o usuário na sala baseada no JWT — valida o token antes de entrar
      socket.on('register', (token: string) => {
        if (!token) return;

        try {
          const decoded = jwt.verify(token, jwtSecret) as { id: string };
          socket.join(`user:${decoded.id}`);
          this.connectedUsers.set(socket.id, decoded.id);
          console.info(`WebSocket: usuário ${decoded.id} registrado`);
        } catch {
          console.warn(`WebSocket: token inválido - ${socket.id}`);
          socket.emit('auth_error', { message: 'Token inválido.' });
        }
      });

      socket.on('disconnect', () => {
        const userId = this.connectedUsers.get(socket.id);

        this.connectedUsers.delete(socket.id);
        console.info(`WebSocket: cliente desconectado - ${socket.id} (user: ${userId})`);
      });
    });
  }

  /**
   * Emite um evento para um usuário específico.
   */
  emitToUser(userId: string, event: string, data: unknown): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Emite um evento para todos os clientes conectados.
   */
  emitToAll(event: string, data: unknown): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}

// Singleton
export default new WebSocketService();
