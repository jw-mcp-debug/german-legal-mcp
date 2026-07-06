import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(tmpdir(), 'german-legal-mcp-npm-cache'),
    },
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  process.stderr.write(`Could not parse npm pack output:\n${result.stdout}`);
  process.exit(1);
}

const files = report[0]?.files?.map((entry) => entry.path) ?? [];
const forbidden = files.filter((path) =>
  path.endsWith('.test.js')
  || path.includes('/tests/')
  || path.includes('/fixtures/')
  || path.startsWith('coverage/')
);
const required = ['dist/index.js', 'LICENSE', 'README.md'];
const missing = required.filter((path) => !files.includes(path));

if (forbidden.length > 0 || missing.length > 0) {
  if (forbidden.length > 0) {
    process.stderr.write(`Forbidden package artifacts:\n${forbidden.join('\n')}\n`);
  }
  if (missing.length > 0) {
    process.stderr.write(`Missing package artifacts:\n${missing.join('\n')}\n`);
  }
  process.exit(1);
}

console.log(`Package content verified (${files.length} files).`);
