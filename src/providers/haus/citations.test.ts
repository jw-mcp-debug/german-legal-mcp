import { describe, expect, it } from 'vitest';
import { abbreviationOf, extractCitations, groupCitations } from './citations.js';

const raws = (text: string, known?: Set<string>) =>
  extractCitations(text, known).map((c) => c.raw);

describe('extractCitations', () => {
  it('reads a citation with all its modifiers', () => {
    const [citation] = extractCitations('gemäß § 61 Abs. 2 Nr. 7 BerlHG erlässt');
    expect(citation).toMatchObject({
      raw: '§ 61 Abs. 2 Nr. 7 BerlHG',
      section: '61', absatz: '2', nummer: '7',
      abbreviation: 'BerlHG', scope: 'external',
    });
  });

  it('treats a citation with no named source as pointing inside the document', () => {
    expect(extractCitations('nach § 1 Abs. 3 gilt')[0]).toMatchObject({
      raw: '§ 1 Abs. 3', scope: 'self',
    });
  });

  it('calls a citation internal when the corpus announces that abbreviation', () => {
    const known = new Set(['BHT-GO']);
    expect(extractCitations('§ 9 Abs. 4 Satz 1 BHT-GO', known)[0]?.scope).toBe('internal');
    expect(extractCitations('§ 9 Abs. 4 Satz 1 BHT-GO')[0]?.scope).toBe('external');
  });

  it('does not mistake an ordinary word for a law abbreviation', () => {
    expect(extractCitations('§ 5 Der Vorsitz lädt ein')[0]).toMatchObject({ scope: 'self' });
  });

  it('shares a source across a citation list that names it once at the end', () => {
    // The Wahlordnung's opening sentence. Read strictly forwards, § 48 looks
    // like a self-reference because the statute is named after § 61.
    const text = 'gemäß § 48 Abs. 5 Satz 2 sowie § 61 Abs. 2 Nr. 7 des '
      + 'Berliner Hochschulgesetzes (BerlHG) in der Fassung';
    expect(raws(text)).toEqual(['§ 48 Abs. 5 Satz 2 BerlHG', '§ 61 Abs. 2 Nr. 7 BerlHG']);
  });

  it('does not carry a source backwards across a sentence break', () => {
    const text = 'nach § 3 ist zu verfahren. Ferner gilt § 7 Abs. 1 HWGVO.';
    const [first] = extractCitations(text);
    expect(first).toMatchObject({ raw: '§ 3', scope: 'self' });
  });

  it('folds a confusable spelling onto the form the document itself uses', () => {
    // Measured in the live Wahlordnung: "BerIHG" with a capital I, where four
    // other citations spell it BerlHG. Unfolded, legis: would not resolve it.
    const text = '§ 61 BerlHG, § 90 BerlHG, § 45 BerlHG und § 47 Abs. 1 BerIHG';
    expect(raws(text)).toEqual([
      '§ 61 BerlHG', '§ 90 BerlHG', '§ 45 BerlHG', '§ 47 Abs. 1 BerlHG',
    ]);
  });

  it('leaves a lone odd spelling alone rather than inventing a target', () => {
    expect(raws('§ 47 Abs. 1 BerIHG')).toEqual(['§ 47 Abs. 1 BerIHG']);
  });

  it('reports each distinct citation once', () => {
    expect(raws('§ 1 und § 1 und nochmals § 1')).toEqual(['§ 1']);
  });

  it('finds nothing in text without citations', () => {
    expect(extractCitations('Die Sitzung ist öffentlich.')).toEqual([]);
  });
});

describe('abbreviationOf', () => {
  it('reads the abbreviation a document announces for itself', () => {
    expect(abbreviationOf('Wahlordnung der BHT (BHT-WahlO) vom 15.01.2026')).toBe('BHT-WahlO');
    expect(abbreviationOf('Geschäftsordnung des Akademischen Senats')).toBeUndefined();
    expect(abbreviationOf('Handreichung (Stand 2024)')).toBeUndefined();
  });
});

describe('groupCitations', () => {
  it('splits by where each citation has to be resolved', () => {
    const citations = extractCitations(
      '§ 61 BerlHG und § 9 BHT-GO sowie § 2 Abs. 1',
      new Set(['BHT-GO']),
    );
    const grouped = groupCitations(citations);
    expect(grouped.external.map((c) => c.abbreviation)).toEqual(['BerlHG']);
    expect(grouped.internal.map((c) => c.abbreviation)).toEqual(['BHT-GO']);
    expect(grouped.self).toHaveLength(1);
  });
});
