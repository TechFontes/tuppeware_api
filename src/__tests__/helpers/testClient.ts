import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

export const api = request(app);

export function authHeader(userId: string, role: string, email: string): Record<string, string> {
  const token = jwt.sign(
    { id: userId, role, email },
    process.env.JWT_SECRET || 'test-secret-integration-tuppeware',
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}
