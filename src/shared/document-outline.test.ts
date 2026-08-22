import { describe, expect, it } from 'vitest';
import { buildOutline, estimateTokens, renderOutline } from './document-outline.js';

const DECISION = [
  '# Erfolglose Verfassungsbeschwerde gegen Regelungen des rbb-Staatsvertrags',
  '',
  '## Leitsatz',
  'Bei der Ausgestaltung hat der Gesetzgeber den Anforderungen zu genügen.',
  '',
  '## Tenor',
  'Die Verfassungsbeschwerde wird zurückgewiesen.',
  '',
  '## Gründe',
  'A'.repeat(3000),
].join('\n');

describe('buildOutline', () => {
  it('gives every heading its line range and size', () => {
    const outline = buildOutline(DECISION);
    expect(outline.entries.map((e) => e.heading))
      .toEqual([
        'Erfolglose Verfassungsbeschwerde gegen Regelungen des rbb-Staatsvertrags',
        'Leitsatz', 'Tenor', 'Gründe',
      ]);
    expect(outline.entries[2]?.level).toBe(2);
    expect(outline.entries[3]?.startLine).toBe(9);
    expect(outline.entries[3]?.endLine).toBe(10);
    // The last section runs to the end of the document, not to nowhere.
    expect(outline.entries[3]!.chars).toBeGreaterThan(3000);
  });

  it('reports a document with no headings without inventing structure', () => {
    const outline = buildOutline('Nur Fließtext.\nZweite Zeile.');
    expect(outline.entries).toEqual([]);
    expect(outline.totalLines).toBe(2);
  });
});

describe('estimateTokens', () => {
  it('is calibrated against measured German legal prose', () => {
    // 3,27 characters per token, measured on a BVerfG decision of 101.869
    // characters and 31.174 tokens. The figure only has to separate hundreds
    // from thousands.
    expect(estimateTokens('x'.repeat(101_869))).toBeGreaterThan(28_000);
    expect(estimateTokens('x'.repeat(101_869))).toBeLessThan(34_000);
  });
});

describe('renderOutline', () => {
  const rendered = renderOutline(DECISION, {
    header: '# Kopf',
    sectionHint: '`section: "Tenor"`',
    fullHint: '`full: true`',
  });

  it('names the sections with their cost, so a caller can choose', () => {
    expect(rendered).toContain('Leitsatz');
    expect(rendered).toContain('Tenor');
    expect(rendered).toContain('nicht mitgeschickt');
    expect(rendered).toMatch(/\| \d+–\d+ \|/);
  });

  it('states how to ask for a part and how to ask for everything', () => {
    expect(rendered).toContain('`section: "Tenor"`');
    expect(rendered).toContain('lines:1-80');
    expect(rendered).toContain('`full: true`');
  });

  it('drops the document title, which is a heading but not a section', () => {
    // RII decisions repeat their title as the first heading, and BVerfG titles
    // run past four hundred characters — listed, it would dominate the outline.
    const withTitle = renderOutline(DECISION, {
      header: '# Kopf',
      omitHeading: 'Erfolglose Verfassungsbeschwerde gegen Regelungen des rbb-Staatsvertrags',
      sectionHint: 'x',
      fullHint: 'y',
    });
    expect(withTitle).not.toContain('rbb-Staatsvertrags |');
    expect(withTitle).toContain('Leitsatz');
  });

  it('truncates a heading too long to serve as a signpost', () => {
    const long = `## ${'W'.repeat(200)}\nText`;
    expect(renderOutline(long, { header: '', sectionHint: 'x', fullHint: 'y' }))
      .toContain('…');
  });

  it('offers line ranges when a document has no headings at all', () => {
    const flat = renderOutline('Nur Fließtext.', {
      header: '# Kopf', sectionHint: 'x', fullHint: 'y',
    });
    expect(flat).toContain('keine Überschriften');
    expect(flat).toContain('lines:1-80');
  });
});
