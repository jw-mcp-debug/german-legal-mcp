import { describe, expect, it } from 'vitest';
import {
  cachePath,
  getStateDir,
  lockPath,
  metricsPath,
  sessionPath,
  socketPath,
  statePath,
} from './state-paths.js';

describe('getStateDir', () => {
  it('prefers an explicit absolute state directory', () => {
    expect(getStateDir({
      env: { GLMCP_STATE_DIR: '/srv/glmcp' },
      platform: 'linux',
      homeDir: '/home/test',
    })).toBe('/srv/glmcp');
  });

  it('uses XDG_STATE_HOME when configured', () => {
    expect(getStateDir({
      env: { XDG_STATE_HOME: '/var/state' },
      platform: 'linux',
      homeDir: '/home/test',
    })).toBe('/var/state/german-legal-mcp');
  });

  it('uses LOCALAPPDATA on Windows', () => {
    expect(getStateDir({
      env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
      platform: 'win32',
      homeDir: 'C:\\Users\\test',
    })).toContain('german-legal-mcp');
  });

  it('preserves the existing Unix default for backwards compatibility', () => {
    expect(getStateDir({
      env: {},
      platform: 'linux',
      homeDir: '/home/test',
    })).toBe('/home/test/.local/share/german-legal-mcp');
  });

  it('owns every application state subpath', () => {
    expect(cachePath('a')).toBe(statePath('cache', 'a'));
    expect(sessionPath('a')).toBe(statePath('sessions', 'a'));
    expect(metricsPath('a')).toBe(statePath('metrics', 'a'));
    expect(socketPath('a')).toBe(statePath('sockets', 'a'));
    expect(lockPath('a')).toBe(statePath('locks', 'a'));
  });
});
