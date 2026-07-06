import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { getEnvironment, readStringEnv, type Environment } from '../config.js';

const APP_DIR_NAME = 'german-legal-mcp';

export interface StatePathEnvironment extends Environment {
  XDG_STATE_HOME?: string;
  LOCALAPPDATA?: string;
}

export interface StatePathOptions {
  env?: StatePathEnvironment;
  platform?: typeof process.platform;
  homeDir?: string;
}

export function getStateDir(options: StatePathOptions = {}): string {
  const env = options.env ?? getEnvironment();
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? homedir();
  const configured = readStringEnv('GLMCP_STATE_DIR', env);

  if (configured) {
    return isAbsolute(configured) ? configured : resolve(configured);
  }
  if (env.XDG_STATE_HOME?.trim()) {
    return join(env.XDG_STATE_HOME, APP_DIR_NAME);
  }
  if (platform === 'win32') {
    return join(env.LOCALAPPDATA?.trim() || join(homeDir, 'AppData', 'Local'), APP_DIR_NAME);
  }
  return join(homeDir, '.local', 'share', APP_DIR_NAME);
}

export const STATE_DIR = getStateDir();
export const CACHE_DIR = join(STATE_DIR, 'cache');
export const LOG_DIR = join(STATE_DIR, 'logs');
export const SESSION_DIR = join(STATE_DIR, 'sessions');
export const METRICS_DIR = join(STATE_DIR, 'metrics');
export const SOCKET_DIR = join(STATE_DIR, 'sockets');
export const LOCK_DIR = join(STATE_DIR, 'locks');

/** Pre-Phase-2 locations retained only for one-way state migration. */

export function statePath(...segments: string[]): string {
  return join(STATE_DIR, ...segments);
}

export function cachePath(...segments: string[]): string {
  return join(CACHE_DIR, ...segments);
}

export function sessionPath(...segments: string[]): string {
  return join(SESSION_DIR, ...segments);
}

export function metricsPath(...segments: string[]): string {
  return join(METRICS_DIR, ...segments);
}

export function socketPath(...segments: string[]): string {
  return join(SOCKET_DIR, ...segments);
}

export function lockPath(...segments: string[]): string {
  return join(LOCK_DIR, ...segments);
}
