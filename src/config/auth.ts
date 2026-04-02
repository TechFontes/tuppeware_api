if (process.env.NODE_ENV !== 'test' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-me';
export const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
