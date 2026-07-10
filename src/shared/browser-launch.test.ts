import { describe, it, expect } from 'vitest';
import { browserBinaryOverrides } from './browser-launch.js';

describe('browserBinaryOverrides', () => {
  it('returns {} by default so the launcher uses its bundled browser', () => {
    expect(browserBinaryOverrides({})).toEqual({});
  });

  it('selects a locally installed Chrome via GLMCP_BROWSER_CHANNEL', () => {
    expect(browserBinaryOverrides({ GLMCP_BROWSER_CHANNEL: 'chrome' })).toEqual({ channel: 'chrome' });
    expect(browserBinaryOverrides({ GLMCP_BROWSER_CHANNEL: 'chrome-beta' })).toEqual({ channel: 'chrome-beta' });
  });

  it('ignores an unknown channel (falls back to bundled Chromium)', () => {
    expect(browserBinaryOverrides({ GLMCP_BROWSER_CHANNEL: 'firefox' })).toEqual({});
  });

  it('honours an explicit executable path', () => {
    expect(browserBinaryOverrides({ GLMCP_BROWSER_EXECUTABLE_PATH: '/usr/bin/chromium' })).toEqual({
      executablePath: '/usr/bin/chromium',
    });
  });

  it('prefers executablePath over channel when both are set', () => {
    expect(
      browserBinaryOverrides({
        GLMCP_BROWSER_EXECUTABLE_PATH: '/opt/chrome',
        GLMCP_BROWSER_CHANNEL: 'chrome',
      }),
    ).toEqual({ executablePath: '/opt/chrome' });
  });

  it('treats empty / whitespace values as unset', () => {
    expect(browserBinaryOverrides({ GLMCP_BROWSER_CHANNEL: '   ' })).toEqual({});
    expect(browserBinaryOverrides({ GLMCP_BROWSER_EXECUTABLE_PATH: '' })).toEqual({});
  });
});
