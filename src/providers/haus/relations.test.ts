import { describe, expect, it } from 'vitest';
import { matchParent, normalizeTitle, parseRuleRelation } from './relations.js';

/** Titles taken verbatim from the indexed corpus. */
const VIERTE = 'Vierte Änderung der Geschäftsordnung des Akademischen Senats der '
  + 'Berliner Hochschule für Technik (GO-AS) vom 05.12.2013 vom 15.01.2026';
const ZWEITE_ORDNUNG = 'Zweite Ordnung zur Änderung der Studien- und Prüfungsordnung '
  + 'für den Bachelorstudiengang Facility Management';
const AUFHEBUNG = 'Ordnung zur Aufhebung der Studien- und Prüfungsordnung für den '
  + 'Bachelorstudiengang Geoinformation (Geoinformation) des Fachbereichs III der '
  + 'Berliner Hochschule für Technik vom 13.11.2013 (1. Änderung vom 17.06.2015) vom 13.11.2024';

describe('parseRuleRelation', () => {
  it('reads the ordinal, the amended rule and its own date apart', () => {
    // Two dates: the last is the amendment's, the one before it the parent's.
    // Read the other way round, the lookup would seek a rule that never existed.
    expect(parseRuleRelation(VIERTE)).toMatchObject({
      kind: 'amends',
      ordinal: 4,
      parentDate: '2013-12-05',
    });
    expect(parseRuleRelation(VIERTE)?.parentTitle)
      .toContain('Geschäftsordnung des Akademischen Senats');
  });

  it('reads the "Ordnung zur Änderung" form, which carries no dates', () => {
    expect(parseRuleRelation(ZWEITE_ORDNUNG)).toMatchObject({ kind: 'amends', ordinal: 2 });
    expect(parseRuleRelation(ZWEITE_ORDNUNG)?.parentDate).toBeUndefined();
  });

  it('distinguishes a repeal from an amendment', () => {
    // A repeal ends a rule; an amendment changes it. Same title template.
    expect(parseRuleRelation(AUFHEBUNG)?.kind).toBe('repeals');
  });

  it('accepts numeric ordinals as well as written ones', () => {
    expect(parseRuleRelation('1. Änderungsordnung der Zugangsordnung X')?.ordinal).toBe(1);
    expect(parseRuleRelation('Erste Änderung der Zugangsordnung X')?.ordinal).toBe(1);
  });

  it('leaves a rule that is not a change alone', () => {
    expect(parseRuleRelation('Wahlordnung der BHT (BHT-WahlO) vom 15.01.2026')).toBeNull();
    expect(parseRuleRelation('Änderung der')).toBeNull();
  });
});

describe('normalizeTitle', () => {
  it('drops the variation between how a rule and its amendment name it', () => {
    expect(normalizeTitle('Wahlordnung der BHT (BHT-WahlO) vom 15.01.2026'))
      .toBe(normalizeTitle('Wahlordnung der BHT'));
  });
});

describe('matchParent', () => {
  const relation = parseRuleRelation('Erste Änderung der Prüfungsordnung Geodäsie '
    + 'vom 13.11.2024 vom 21.01.2026')!;

  it('finds the rule the amendment names', () => {
    expect(matchParent(relation, [
      { id: 'a', title: 'Prüfungsordnung Geodäsie vom 13.11.2024', asOf: '2024-11-13' },
      { id: 'b', title: 'Prüfungsordnung Bauingenieurwesen', asOf: '2024-11-13' },
    ])?.id).toBe('a');
  });

  it('uses the stated date to choose between versions of the same title', () => {
    expect(matchParent(relation, [
      { id: 'alt', title: 'Prüfungsordnung Geodäsie', asOf: '2016-01-20' },
      { id: 'neu', title: 'Prüfungsordnung Geodäsie', asOf: '2024-11-13' },
    ])?.id).toBe('neu');
  });

  it('refuses a near miss rather than attaching the amendment to the wrong rule', () => {
    // The corpus holds dozens of Prüfungsordnungen differing by one programme.
    // A wrong parent is worse than none: it reports a rule as amended when it
    // was not.
    expect(matchParent(relation, [
      { id: 'x', title: 'Prüfungsordnung Geodäsie und Geoinformatik', asOf: '2024-11-13' },
    ])).toBeNull();
  });

  it('returns nothing when the amended rule is simply absent', () => {
    // The common case in this corpus: the digital gazette does not reach back
    // to the base rules that the recent amendments change.
    expect(matchParent(relation, [])).toBeNull();
  });
});
