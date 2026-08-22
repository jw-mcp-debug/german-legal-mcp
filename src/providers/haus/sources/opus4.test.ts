import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OPUS4_SOURCE_ID,
  looksLikeAmendment,
  parseFrontdoor,
  parseSearchResultIds,
  toIngestInput,
  toIsoDate,
  toSpdx,
} from './opus4.js';

const FIXTURES = join(process.cwd(), 'src/providers/haus/sources/__fixtures__');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

const AENDERUNG_URL = 'https://opus4.kobv.de/opus4-bht/frontdoor/index/index/docId/197';
const PROMO_URL = 'https://opus4.kobv.de/opus4-bht/frontdoor/index/index/docId/179';

describe('toIsoDate', () => {
  it('reads both date shapes OPUS uses, and refuses anything else', () => {
    expect(toIsoDate('15.01.2026')).toBe('2026-01-15');
    expect(toIsoDate('2026/01/21')).toBe('2026-01-21');
    expect(toIsoDate('2026-01-21')).toBe('2026-01-21');
    expect(toIsoDate('im Januar')).toBeUndefined();
    expect(toIsoDate(undefined)).toBeUndefined();
  });
});

describe('toSpdx', () => {
  it('maps the German CC prose this repository actually serves', () => {
    expect(toSpdx('Creative Commons - CC BY-NC-ND - Namensnennung - Nicht kommerziell - Keine Bearbeitungen 4.0 International'))
      .toBe('CC-BY-NC-ND-4.0');
    expect(toSpdx('Creative Commons - CC BY - Namensnennung 4.0 International')).toBe('CC-BY-4.0');
    expect(toSpdx('CC BY-SA 4.0')).toBe('CC-BY-SA-4.0');
  });

  it('leaves an unrecognised licence unread rather than approximating it', () => {
    expect(toSpdx('Alle Rechte vorbehalten')).toBe('NOASSERTION');
    expect(toSpdx(undefined)).toBe('NOASSERTION');
  });
});

describe('looksLikeAmendment', () => {
  it('recognises the gazette\'s amendment titles', () => {
    expect(looksLikeAmendment('Vierte Änderung der Geschäftsordnung des Akademischen Senats')).toBe(true);
    expect(looksLikeAmendment('Erste Änderung der Richtlinien zum Verfahren')).toBe(true);
    expect(looksLikeAmendment('1. Änderungsordnung der Zugangsordnung')).toBe(true);
  });

  it('leaves a standalone Ordnung alone', () => {
    expect(looksLikeAmendment('Wahlordnung der Berliner Hochschule für Technik (BHT-WahlO) vom 15.01.2026')).toBe(false);
    expect(looksLikeAmendment('Grundordnung der Berliner Hochschule für Technik')).toBe(false);
  });
});

describe('parseSearchResultIds', () => {
  it('lists the docIds a result page links to, without duplicates', () => {
    const ids = parseSearchResultIds(fixture('opus4-searchpage.html'));
    expect(ids.length).toBeGreaterThan(5);
    expect(ids[0]).toBe('197');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns nothing for a page with no results', () => {
    expect(parseSearchResultIds('<html><body>keine Treffer</body></html>')).toEqual([]);
  });
});

describe('parseFrontdoor', () => {
  it('reads the declared metadata off a gazette record', () => {
    const record = parseFrontdoor(fixture('opus4-frontdoor-aenderung.html'), AENDERUNG_URL);
    expect(record.docId).toBe('197');
    expect(record.title).toContain('Geschäftsordnung des Akademischen Senats');
    expect(record.series).toBe('Amtliche Mitteilungen');
    expect(record.seriesNumber).toBe('47/01');
    expect(record.owner).toBe('Gremienreferat');
    expect(record.editor).toContain('Präsident');
    expect(record.licence).toBe('CC-BY-NC-ND-4.0');
    expect(record.fulltextUrl)
      .toBe('https://opus4.kobv.de/opus4-bht/files/197/01-2026_4.AE_GO-AS.pdf');
  });

  it('prefers the Beschlussdatum over the upload date, and keeps both', () => {
    const record = parseFrontdoor(fixture('opus4-frontdoor-aenderung.html'), AENDERUNG_URL);
    expect(record.decisionDate).toBe('2026-01-15');
    expect(record.publishedDate).toBe('2026-01-21');
  });

  it('treats publication in the gazette as what makes a document binding', () => {
    expect(parseFrontdoor(fixture('opus4-frontdoor-promo.html'), PROMO_URL).normativeForce)
      .toBe('binding');
  });

  it('falls back to guidance for a series that is not the gazette', () => {
    const html = fixture('opus4-frontdoor-promo.html')
      .replace('Amtliche Mitteilungen', 'Arbeitspapiere');
    expect(parseFrontdoor(html, PROMO_URL).normativeForce).toBe('guidance');
  });

  it('survives a page that carries none of the optional fields', () => {
    const record = parseFrontdoor('<html><body><h2>Nackt</h2></body></html>', AENDERUNG_URL);
    expect(record.title).toBe('Nackt');
    expect(record.licence).toBe('NOASSERTION');
    expect(record.normativeForce).toBe('guidance');
    expect(record.owner).toBeUndefined();
    expect(record.fulltextUrl).toBeUndefined();
  });
});

describe('toIngestInput', () => {
  it('carries the gazette record into an ingestible document', () => {
    const record = parseFrontdoor(fixture('opus4-frontdoor-aenderung.html'), AENDERUNG_URL);
    const input = toIngestInput(record, '# Vierte Änderung\n\nText.');
    expect(input.sourceId).toBe(OPUS4_SOURCE_ID);
    expect(input.normativeForce).toBe('binding');
    expect(input.confidentiality).toBe('public');
    expect(input.asOf).toBe('2026-01-15');
    expect(input.owner).toBe('Gremienreferat');
    expect(input.documentType).toBe('Amtliche Mitteilungen');
    expect(input.licence).toBe('CC-BY-NC-ND-4.0');
    expect(input.redistribution).toBe('allowed');
  });

  it('never claims redistribution on a licence it could not read', () => {
    const record = parseFrontdoor('<html><body><h2>Ohne Lizenz</h2></body></html>', AENDERUNG_URL);
    const input = toIngestInput(record, 'Text.');
    expect(input.licence).toBe('NOASSERTION');
    expect(input.redistribution).toBe('unknown');
  });
});
