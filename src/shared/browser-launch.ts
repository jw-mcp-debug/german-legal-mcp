import { getEnvironment, readStringEnv, type Environment } from '../config.js';

/** Chrome release channels the browser launcher can resolve to a locally installed browser. */
const CHROME_CHANNELS = ['chrome', 'chrome-beta', 'chrome-canary', 'chrome-dev'] as const;
type ChromeChannel = (typeof CHROME_CHANNELS)[number];

/** Launch overrides that select which browser binary the launcher uses. */
export type BrowserBinaryOverrides =
  | { executablePath: string }
  | { channel: ChromeChannel }
  | Record<string, never>;

/**
 * Resolve which browser binary the launcher should start, from the environment.
 * This lets a distributed bundle run against a browser it does NOT ship:
 *
 * - `GLMCP_BROWSER_EXECUTABLE_PATH` — an explicit Chrome/Chromium binary path.
 * - `GLMCP_BROWSER_CHANNEL` — a locally installed Chrome channel ("chrome",
 *   "chrome-beta", "chrome-canary", "chrome-dev"), so no browser needs to be
 *   bundled or downloaded.
 *
 * Neither set (or an unknown channel) → `{}`, so the launcher uses its own
 * bundled browser (the default, unchanged behaviour). An explicit `executablePath`
 * wins over `channel`. This does not affect `headless`: the caller still passes
 * `headless` separately, so a channelled Chrome runs headless just the same.
 */
export function browserBinaryOverrides(env: Environment = getEnvironment()): BrowserBinaryOverrides {
  const executablePath = readStringEnv('GLMCP_BROWSER_EXECUTABLE_PATH', env);
  if (executablePath) return { executablePath };

  const channel = readStringEnv('GLMCP_BROWSER_CHANNEL', env);
  if (channel && (CHROME_CHANNELS as readonly string[]).includes(channel)) {
    return { channel: channel as ChromeChannel };
  }
  return {};
}
