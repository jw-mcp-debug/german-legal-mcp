#!/usr/bin/env node
/**
 * Startup smoke test for the published entrypoint. Validates that the built
 * `dist/index.js` actually loads and runs — catching broken imports, a config
 * module that throws, or a packaging mistake that `npm run build` alone would
 * not surface. Two checks:
 *
 *   1. `--version` prints the package version and exits 0 (entrypoint + config
 *      parse without starting the server).
 *   2. Plain start boots the MCP server, connects the stdio transport and logs
 *      readiness within a timeout, then is terminated.
 *
 * Runs as part of `npm run verify`, after the package contents are checked.
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'dist', 'index.js');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version;

function fail(msg) {
  console.error(`Startup smoke FAILED: ${msg}`);
  process.exit(1);
}

function run(args, { timeoutMs, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { ...process.env, ...env },
      // Keep stdin open so server mode does not see EOF and exit immediately.
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });

    let timer;
    if (timeoutMs) {
      timer = setTimeout(() => {
        // Server mode never exits on its own — terminate and report what we saw.
        child.kill('SIGTERM');
        resolve({ timedOut: true, stdout, stderr, code: null });
      }, timeoutMs);
    }
    child.on('exit', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ timedOut: false, stdout, stderr, code });
    });
  });
}

// --- Check 1: --version
const v = await run(['--version'], { timeoutMs: 15_000 });
if (v.code !== 0) fail(`--version exited with code ${v.code}\n${v.stderr}`);
if (!v.stdout.includes(pkgVersion)) {
  fail(`--version printed "${v.stdout.trim()}", expected to contain "${pkgVersion}"`);
}
console.log(`✓ --version → ${pkgVersion}`);

// --- Check 2: server boots and reports readiness
const stateDir = mkdtempSync(join(tmpdir(), 'glmcp-smoke-'));
const s = await run([], { timeoutMs: 8_000, env: { GLMCP_STATE_DIR: stateDir, GLMCP_LOG_LEVEL: 'info' } });
// Success is the readiness log. The server may keep running (timed out, then
// terminated) or exit 0 if its stdin closes — both are fine; a non-zero exit
// before readiness is not.
if (!s.stderr.includes('MCP server connected and ready')) {
  fail(`server did not report readiness\n${s.stderr}`);
}
if (!s.timedOut && s.code !== 0) {
  fail(`server exited with code ${s.code}\n${s.stderr}`);
}
console.log('✓ server booted and reported readiness');

console.log('Startup smoke passed.');
