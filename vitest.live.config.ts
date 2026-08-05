import { defineConfig } from 'vitest/config';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/live/**/*.live.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    retry: process.env.CI ? 1 : 0,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      GLMCP_STATE_DIR: process.env.GLMCP_STATE_DIR
        ?? join(tmpdir(), `german-legal-mcp-live-${process.pid}`),
    },
  },
});
