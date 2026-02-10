import { Server as SocketIOServer, Socket } from 'socket.io';

/**
 * Serviço de WebSocket para comunicação em tempo real.
 * Utiliza Socket.IO para emitir eventos de atualização de status.
 */
class WebSocketService {
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

      // Registra o usuário na sala baseada no seu ID
      socket.on('register', (userId: string) => {
        if (userId) {
          socket.join(`user:${userId}`);
          this.connectedUsers.set(socket.id, userId);
          console.info(`WebSocket: usuário ${userId} registrado`);
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
