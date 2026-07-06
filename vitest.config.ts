import { defineConfig } from 'vitest/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      GLMCP_STATE_DIR: process.env.GLMCP_STATE_DIR
        ?? join(tmpdir(), `german-legal-mcp-vitest-${process.pid}`),
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        // Trivial provider-enablement factories (`createProvider`: config gate +
        // `new XProvider()`). Roadmap 6.2 permits excluding trivial provider
        // wiring through documented configuration; the providers themselves are
        // tested. NOTE: beck/juris/legis index.ts hold real logic and are NOT here.
        'src/providers/arxiv/index.ts',
        'src/providers/dip/index.ts',
        'src/providers/eul/index.ts',
        'src/providers/icu/index.ts',
        'src/providers/nautos/index.ts',
        'src/providers/rii/index.ts',
      ],
      // Ratchet: raised as coverage improves, kept just under the current level
      // so CI blocks regressions without flaking on minor fluctuations.
      // Final Phase 6 target: lines 85 / branches 80 / critical modules ≥95.
      thresholds: {
        lines: 81,
        statements: 79,
        functions: 76,
        branches: 64,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    alias: {
      // Map .js imports to .ts source files for vitest
      './converter.js': './converter.ts',
      '../src/converter.js': '../src/converter.ts',
    },
  },
});
