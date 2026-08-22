import { describe, expect, it } from 'vitest';
import type { LegislationReference } from '../../src/contracts/legal-resource.js';
import { DipDataClient } from '../../src/providers/dip/data-client.js';
import { EulDataClient } from '../../src/providers/eul/data-client.js';
import { IcuDataClient } from '../../src/providers/icu/data-client.js';
import {
  liveEnabled,
  tolerateUpstreamRefusal,
  verifySearchAndGet,
  verifyTableOfContents,
} from './contract-assertions.js';

const LIVE = liveEnabled('GLMCP_LIVE_PUBLIC');

describe.skipIf(!LIVE)('Public provider clients against live sources', () => {

  it('DIP: search → normalized parliamentary material → document', async () => {
    const { reference } = await verifySearchAndGet(new DipDataClient(), {
      query: 'Datenschutz',
      resourceTypes: ['parliamentary-material'],
      jurisdictions: ['DE'],
      sourceIds: ['dip:bundestag'],
      limit: 1,
    }, {
      providerId: 'dip',
      sourceId: 'dip:bundestag',
      resourceType: 'parliamentary-material',
      jurisdiction: 'DE',
      minimumContentLength: 30,
    });
    expect(reference.resourceType).toBe('parliamentary-material');
    expect(reference.documentNumber?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('EU Cellar: search → normalized legislation → document', async () => {
    const { reference } = await verifySearchAndGet(new EulDataClient(), {
      query: 'personenbezogener Daten',
      resourceTypes: ['legislation'],
      jurisdictions: ['EU'],
      sourceIds: ['eul:cellar'],
      limit: 1,
    }, {
      providerId: 'eul',
      sourceId: 'eul:cellar',
      resourceType: 'legislation',
      jurisdiction: 'EU',
      minimumContentLength: 100,
    });
    expect(reference.resourceType).toBe('legislation');
    expect(reference.celex?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('InfoCuria: search → normalized case law → document', async () => {
    const { reference } = await verifySearchAndGet(new IcuDataClient(), {
      query: 'C-311/18',
      resourceTypes: ['case-law'],
      jurisdictions: ['EU'],
      sourceIds: ['icu:infocuria'],
      limit: 1,
    }, {
      providerId: 'icu',
      sourceId: 'icu:infocuria',
      resourceType: 'case-law',
      jurisdiction: 'EU',
      minimumContentLength: 100,
    });
    expect(reference.resourceType).toBe('case-law');
    expect(
      Boolean(reference.fileNumber?.trim()) || Boolean(reference.ecli?.trim()),
    ).toBe(true);
  });


});
