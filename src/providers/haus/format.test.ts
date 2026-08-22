import { describe, expect, it } from 'vitest';
import { ageInMonths, renderBanner, SCOPE_CAVEAT } from './format.js';
import type { AdministrativeGuidanceReference } from '../../contracts/legal-resource.js';

function reference(
  overrides: Partial<AdministrativeGuidanceReference> = {},
): AdministrativeGuidanceReference {
  return {
    resourceType: 'administrative-guidance',
    title: 'Handreichung Lizenzverträge',
    normativeForce: 'guidance',
    status: 'in-force',
    confidentiality: 'public',
    authority: 'official',
    documentType: 'Handreichung',
    asOf: '2024-03-01',
    owner: 'Justiziariat',
    provenance: {
      providerId: 'haus',
      sourceId: 'haus',
      providerDocumentId: 'abc',
      canonicalUrl: 'https://example.test/x',
    },
    rights: {
      access: 'public',
      fullTextStorage: 'allowed',
      redistribution: 'unknown',
      licence: 'NOASSERTION',
    },
    ...overrides,
  };
}

const NOW = new Date('2026-08-22T00:00:00.000Z');

describe('ageInMonths', () => {
  it('counts whole months and refuses to invent one', () => {
    expect(ageInMonths('2026-06-22', NOW)).toBe(2);
    expect(ageInMonths('2024-08-22', NOW)).toBe(24);
    expect(ageInMonths('nicht datiert', NOW)).toBeUndefined();
  });

  it('clamps a future Stand to zero rather than reporting negative age', () => {
    expect(ageInMonths('2027-01-01', NOW)).toBe(0);
  });
});

describe('renderBanner', () => {
  it('states type, force, status, age and office', () => {
    const banner = renderBanner(reference(), { now: NOW });
    expect(banner).toContain('Handreichung');
    expect(banner).toContain('unverbindliche Orientierung');
    expect(banner).toContain('gültig');
    expect(banner).toContain('Stand 2024-03-01');
    expect(banner).toContain('Justiziariat');
  });

  it('spells the age out in years and flags a Stand past the cut-off', () => {
    const banner = renderBanner(reference(), { now: NOW, staleAfterMonths: 24 });
    expect(banner).toContain('(2 J. alt)');
    expect(banner).toContain('Aktualität prüfen');
  });

  it('leaves a recent document unflagged and reports months', () => {
    const banner = renderBanner(reference({ asOf: '2026-05-01' }), { now: NOW });
    expect(banner).toContain('(3 Mon. alt)');
    expect(banner).not.toContain('Aktualität prüfen');
  });

  it('says so when a document carries no Stand at all', () => {
    expect(renderBanner(reference({ asOf: undefined }), { now: NOW }))
      .toContain('ohne Stand-Angabe');
  });

  it('shouts about the states a reader must not miss', () => {
    expect(renderBanner(reference({ status: 'superseded' }), { now: NOW }))
      .toContain('ERSETZT');
    expect(renderBanner(reference({ normativeForce: 'draft' }), { now: NOW }))
      .toContain('ENTWURF');
    expect(renderBanner(reference({ status: 'unknown' }), { now: NOW }))
      .toContain('Gültigkeit ungeklärt');
    expect(renderBanner(reference({ normativeForce: 'binding' }), { now: NOW }))
      .toContain('verbindlich');
    expect(renderBanner(reference({ normativeForce: 'record' }), { now: NOW }))
      .toContain('regelt nicht');
  });
});

describe('renderBanner for a reading version', () => {
  it('says the text is not the authoritative one, and where that is', () => {
    const banner = renderBanner(
      reference({
        authority: 'reading-version',
        authoritativeSource: 'Amtliche Mitteilungen 47/01',
      }),
      { now: NOW },
    );
    expect(banner).toContain('nichtamtliche Lesefassung');
    expect(banner).toContain('im Zweifel gilt der amtliche Text');
    expect(banner).toContain('Amtliche Mitteilungen 47/01');
  });

  it('still warns when no authoritative counterpart is recorded', () => {
    const banner = renderBanner(reference({ authority: 'reading-version' }), { now: NOW });
    expect(banner).toContain('nichtamtliche Lesefassung');
    expect(banner).not.toContain('Amtlich:');
  });

  it('leaves a promulgated document without the caveat', () => {
    expect(renderBanner(reference({ authority: 'official' }), { now: NOW }))
      .not.toContain('Lesefassung');
  });
});

describe('SCOPE_CAVEAT', () => {
  it('draws the line between house practice and legal position', () => {
    expect(SCOPE_CAVEAT).toContain('Rechtslage');
  });
});
