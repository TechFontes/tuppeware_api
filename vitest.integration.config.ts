import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv('test', process.cwd(), '');

  return {
    test: {
      globals: true,
      environment: 'node',
      include: ['src/__tests__/integration/**/*.test.ts'],
      timeout: 30000,
      hookTimeout: 30000,
      pool: 'forks',
      singleFork: true,
      fileParallelism: false,
      env: {
        ...env,
        NODE_ENV: 'test',
      },
    },
  };
});
