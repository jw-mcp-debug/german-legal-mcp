import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../../config.js';
import { readHausConfig } from './config.js';

describe('readHausConfig', () => {
  it('is off by default, so an unconfigured deployment is unchanged', () => {
    expect(readHausConfig({}).enabled).toBe(false);
  });

  it('reads enablement, index path and the staleness cut-off', () => {
    const config = readHausConfig({
      GLMCP_HAUS_ENABLED: 'true',
      GLMCP_HAUS_INDEX: '/tmp/haus.db',
      GLMCP_HAUS_STALE_MONTHS: '12',
    });
    expect(config).toEqual({
      enabled: true,
      indexPath: '/tmp/haus.db',
      staleAfterMonths: 12,
    });
  });

  it('defaults the index into the state directory', () => {
    expect(readHausConfig({}).indexPath).toMatch(/haus[/\\]index\.db$/);
  });

  it('rejects a nonsensical cut-off rather than silently using a default', () => {
    expect(() => readHausConfig({ GLMCP_HAUS_STALE_MONTHS: '0' })).toThrow(ConfigurationError);
    expect(() => readHausConfig({ GLMCP_HAUS_ENABLED: 'yes' })).toThrow(ConfigurationError);
  });
});
