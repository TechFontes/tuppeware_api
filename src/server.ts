import http from 'http';
import app from './app';
import { setupWebSocket } from './config/websocket';
import prisma from './config/database';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Configuração do WebSocket
setupWebSocket(server);

server.listen(PORT, () => {
  console.info(`Servidor rodando na porta ${PORT}`);
  console.info(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.info(`Documentação: http://localhost:${PORT}/api/docs`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  console.info(`${signal} recebido. Encerrando servidor...`);

  server.close(() => {
    prisma.$disconnect().then(() => {
      console.info('Servidor encerrado.');
      process.exit(0);
    });
  });

  // Forçar encerramento após 10 segundos
  setTimeout(() => {
    console.error('Forçando encerramento...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
