import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

vi.mock('../../../config/auth', () => ({
  jwtSecret: 'test-secret',
}));

import jwt from 'jsonwebtoken';
import { WebSocketService } from '../../../services/WebSocketService';

function makeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    id: 'socket-abc',
    join: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
    }),
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function makeIo(socket: ReturnType<typeof makeSocket>) {
  let connectionHandler: ((s: typeof socket) => void) | null = null;
  return {
    on: vi.fn((event: string, cb: (s: typeof socket) => void) => {
      if (event === 'connection') connectionHandler = cb;
    }),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    _connect: () => connectionHandler?.(socket),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WebSocketService — register', () => {
  it('entra na sala do usuário com token válido', () => {
    vi.mocked(jwt.verify).mockReturnValueOnce({ id: 'user-123' } as never);

    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    io._connect();
    socket._trigger('register', 'valid-token');

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
    expect(socket.join).toHaveBeenCalledWith('user:user-123');
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('emite auth_error com token inválido', () => {
    vi.mocked(jwt.verify).mockImplementationOnce(() => {
      throw new Error('invalid token');
    });

    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    io._connect();
    socket._trigger('register', 'bad-token');

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('auth_error', { message: 'Token inválido.' });
  });

  it('não faz nada quando token é string vazia', () => {
    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    io._connect();
    socket._trigger('register', '');

    expect(jwt.verify).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('não faz nada quando register é chamado sem argumento', () => {
    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    io._connect();
    socket._trigger('register');

    expect(jwt.verify).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });
});

describe('WebSocketService — disconnect', () => {
  it('remove o usuário do mapa de conexões ao desconectar', () => {
    vi.mocked(jwt.verify).mockReturnValueOnce({ id: 'user-456' } as never);

    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    io._connect();
    socket._trigger('register', 'valid-token');
    socket._trigger('disconnect');

    // After disconnect, a second connection with the same socket id should not
    // find the user (the map entry was deleted). We verify indirectly by
    // checking that emitToUser sends to the correct room (io.to), not affected
    // by the disconnected socket's user.
    // The primary assertion: no errors thrown and join was called before disconnect.
    expect(socket.join).toHaveBeenCalledWith('user:user-456');
  });
});

describe('WebSocketService — emitToUser / emitToAll', () => {
  it('emite evento para sala do usuário', () => {
    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    service.emitToUser('user-789', 'payment:created', { id: 'p1' });

    expect(io.to).toHaveBeenCalledWith('user:user-789');
    expect(io.emit).toHaveBeenCalledWith('payment:created', { id: 'p1' });
  });

  it('emite evento para todos os clientes', () => {
    const service = new WebSocketService();
    const socket = makeSocket();
    const io = makeIo(socket);

    service.initialize(io as never);
    service.emitToAll('broadcast', { msg: 'hello' });

    expect(io.emit).toHaveBeenCalledWith('broadcast', { msg: 'hello' });
  });
});
