import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findBoilerplate, pagesToMarkdown, pdfToMarkdown } from './pdf.js';

const FIXTURES = join(process.cwd(), 'src/providers/haus/sources/__fixtures__');

/** A gazette layout in miniature: masthead on every page, numbered footer. */
function gazettePages(bodies: readonly string[]): string[] {
  return bodies.map((body, index) => [
    'Amtliche Mitteilung',
    '47. Jahrgang, Nr. 02/2026',
    `Wahlordnung Seite ${index + 1} von ${bodies.length}`,
    'Herausgeber*in: Präsident*in der BHT, Redaktion: Gremienreferat',
    body,
  ].join('\n'));
}

describe('findBoilerplate', () => {
  it('finds what repeats across pages, page numbers included', () => {
    const shapes = findBoilerplate(gazettePages(['A', 'B', 'C', 'D']));
    expect(shapes.has('Amtliche Mitteilung')).toBe(true);
    // Blanking the digits is what makes the per-page footer comparable at all.
    expect(shapes.has('Wahlordnung Seite # von #')).toBe(true);
    expect(shapes.has('A')).toBe(false);
  });

  it('claims nothing from a document too short to show repetition', () => {
    expect(findBoilerplate(['Amtliche Mitteilung\nText'])).toEqual(new Set());
    expect(findBoilerplate([])).toEqual(new Set());
  });
});

describe('pagesToMarkdown', () => {
  it('strips the running masthead and reports what it dropped', () => {
    const result = pagesToMarkdown(gazettePages(['Erster Satz.', 'Zweiter.', 'Dritter.', 'Vierter.']));
    expect(result.markdown).not.toContain('Amtliche Mitteilung');
    expect(result.markdown).not.toContain('Gremienreferat');
    expect(result.markdown).toContain('Erster Satz.');
    expect(result.droppedBoilerplate.length).toBeGreaterThan(0);
    expect(result.pageCount).toBe(4);
  });

  it('promotes provision headings', () => {
    const result = pagesToMarkdown(['§ 12 Wahlvorstand\nDer Wahlvorstand besteht aus …']);
    expect(result.markdown).toContain('### § 12 Wahlvorstand');
  });

  it('leaves a quoted provision as prose, so an amendment cannot pose as the rule', () => {
    // Amendment documents quote the text they replace. Turned into headings,
    // the amendment would look like it contains § 7 of the Geschäftsordnung.
    const result = pagesToMarkdown([
      '§ 1 Änderungen\n§ 7 (4) Der Vorsitz muss alle nach Absatz 2 gewählten Mitglieder laden.',
    ]);
    expect(result.markdown).toContain('### § 1 Änderungen');
    expect(result.markdown).not.toContain('### § 7');
    expect(result.markdown).toContain('§ 7 (4) Der Vorsitz');
  });

  it('does not turn a long quoted paragraph into a heading', () => {
    const long = `§ 9 ${'Wort '.repeat(40)}`.trim();
    expect(pagesToMarkdown([long]).markdown).not.toContain('### § 9');
  });

  it('drops table-of-contents leader lines', () => {
    const result = pagesToMarkdown([
      '§ 29 Inkrafttreten ..................................18\nEchter Text.',
    ]);
    expect(result.markdown).not.toContain('..........');
    expect(result.markdown).toContain('Echter Text.');
  });

  it('collapses the blank runs that page joins produce', () => {
    expect(pagesToMarkdown(['A\n\n\n\n\nB']).markdown).toBe('A\n\nB');
  });
});

describe('pdfToMarkdown', () => {
  it('reads a real gazette PDF down to its own two sections', async () => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'opus4-aenderung.pdf')));
    const result = await pdfToMarkdown(bytes);

    expect(result.pageCount).toBe(3);
    expect(result.markdown).toContain('Geschäftsordnung des Akademischen Senats');
    expect(result.markdown).toContain('BerlHG');

    // Its own sections, not the ones it amends.
    const headings = result.markdown.match(/^### .*/gm) ?? [];
    expect(headings).toEqual(['### § 1 Änderungen', '### § 2 Inkrafttreten']);

    expect(result.markdown).not.toContain('Luxemburger Straße');
    expect(result.droppedBoilerplate).toContain('Amtliche Mitteilung');
  });
});
