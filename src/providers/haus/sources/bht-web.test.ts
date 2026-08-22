import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WEB_SOURCE_ID,
  parseReadingVersion,
  toIngestInput,
} from './bht-web.js';

const FIXTURES = join(process.cwd(), 'src/providers/haus/sources/__fixtures__');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

const GO_AS_URL = 'https://www.bht-berlin.de/589';
const BENUTZUNG_URL = 'https://www.bht-berlin.de/1004';

describe('parseReadingVersion', () => {
  it('extracts the Ordnung and leaves the site navigation out of it', () => {
    const page = parseReadingVersion(fixture('bht-web-go-as.html'), GO_AS_URL);
    expect(page.title).toContain('Geschäftsordnung des Akademischen Senats');
    expect(page.sectionCount).toBeGreaterThan(20);
    expect(page.markdown).toContain('§ 1');
    expect(page.markdown).toContain('Akademischen Senat');
    expect(page.markdown).not.toContain('Direkt zur Hauptnavigation');
    expect(page.markdown).not.toContain('Studiengänge');
  });

  it('reads the consolidation date off "in der Fassung vom"', () => {
    expect(parseReadingVersion(fixture('bht-web-go-as.html'), GO_AS_URL).asOf)
      .toBe('2026-07-16');
  });

  it('notes when a page calls itself a reading version', () => {
    expect(parseReadingVersion(fixture('bht-web-go-as.html'), GO_AS_URL).declaresReadingVersion)
      .toBe(true);
    expect(parseReadingVersion(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG_URL).declaresReadingVersion)
      .toBe(false);
  });

  it('takes the title from the page heading when the content opens with § 1', () => {
    // The Benutzungsordnung has no title heading inside the content area; its
    // name lives in the page h1. Taking headings[0] regardless yielded
    // "§ 1 - Geltungsbereich" — a provision, not the Ordnung.
    const page = parseReadingVersion(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG_URL);
    expect(page.title).toBe('Benutzungsordnung');
    expect(page.title.startsWith('§')).toBe(false);
  });

  it('handles a page that carries no Fassung line and a different § style', () => {
    const page = parseReadingVersion(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG_URL);
    expect(page.sectionCount).toBeGreaterThan(5);
    expect(page.asOf).toBeUndefined();
    expect(page.markdown.length).toBeGreaterThan(500);
  });

  it('converts headings to Markdown rather than emitting raw HTML', () => {
    const markdown = parseReadingVersion(fixture('bht-web-go-as.html'), GO_AS_URL).markdown;
    expect(markdown).toMatch(/^#{1,6}\s/m);
    expect(markdown).not.toContain('<div');
  });

  it('falls back to main when the content frames are absent', () => {
    const page = parseReadingVersion(
      '<html><body><main><h1>Kurz</h1><h2>Titel</h2><p>Text.</p></main></body></html>',
      GO_AS_URL,
    );
    expect(page.title).toBe('Titel');
    expect(page.sectionCount).toBe(0);
    expect(page.markdown).toContain('Text.');
  });
});

describe('toIngestInput', () => {
  it('binds the rule but never the rendering', () => {
    const page = parseReadingVersion(fixture('bht-web-go-as.html'), GO_AS_URL);
    const input = toIngestInput(page, {
      url: GO_AS_URL,
      owner: 'Gremienreferat',
      documentType: 'Geschäftsordnung',
      authoritativeSource: 'Amtliche Mitteilungen 47/01',
    });
    expect(input.sourceId).toBe(WEB_SOURCE_ID);
    expect(input.normativeForce).toBe('binding');
    expect(input.authority).toBe('reading-version');
    expect(input.authoritativeSource).toBe('Amtliche Mitteilungen 47/01');
    expect(input.asOf).toBe('2026-07-16');
    expect(input.owner).toBe('Gremienreferat');
  });

  it('claims no licence for a page that states none', () => {
    const page = parseReadingVersion(fixture('bht-web-benutzungsordnung.html'), BENUTZUNG_URL);
    const input = toIngestInput(page, { url: BENUTZUNG_URL });
    expect(input.licence).toBe('NOASSERTION');
    expect(input.redistribution).toBe('unknown');
    expect(input.authority).toBe('reading-version');
    expect(input.owner).toBeUndefined();
  });
});
