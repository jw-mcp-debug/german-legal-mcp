import { describe, expect, it } from 'vitest';
import { proposeCorrespondences, renderProposals, similarity } from './matching.js';
import type { TitledDocument } from './matching.js';

/** A miniature of the corpus: shared institutional wording, distinct subjects. */
const CORPUS: TitledDocument[] = [
  { id: 'go-as', title: 'Geschäftsordnung des Akademischen Senats der Berliner Hochschule für Technik' },
  { id: 'go-av', title: 'Geschäftsordnung der Akademischen Versammlung der Berliner Hochschule für Technik' },
  { id: 'go-ku', title: 'Geschäftsordnung des Kuratoriums der Berliner Hochschule für Technik' },
  { id: 'po-geo', title: 'Prüfungsordnung Geodäsie der Berliner Hochschule für Technik', asOf: '2024-11-13' },
  { id: 'po-bau', title: 'Prüfungsordnung Bauingenieurwesen der Berliner Hochschule für Technik' },
];

/** Unrelated rules, so word frequencies resemble a real index rather than a toy. */
const FILLER: TitledDocument[] = Array.from({ length: 20 }, (_, i) => ({
  id: `f${i}`,
  title: `Studien- und Prüfungsordnung für den Studiengang Fach${i} `
    + 'der Berliner Hochschule für Technik',
}));

describe('proposeCorrespondences', () => {
  it('matches a reading version to the rule it consolidates', () => {
    const [proposal] = proposeCorrespondences(
      [{ id: 'web', title: 'Geschäftsordnung des Akademischen Senats (nichtamtliche Lesefassung)' }],
      CORPUS,
      { corpus: CORPUS },
    );
    expect(proposal?.targetId).toBe('go-as');
    expect(proposal?.confidence).toBe('clear');
    expect(proposal?.evidence).toContain('senats');
  });

  it('refuses a near neighbour when the identifying word is missing', () => {
    // Three of four words match "…des Akademischen Senats"; the one naming the
    // body does not. A best-match scorer always returns something, so a rule
    // whose counterpart is absent would otherwise be proposed against its
    // nearest neighbour.
    expect(proposeCorrespondences(
      [{ id: 'web', title: 'Geschäftsordnung des Rektorats der Berliner Hochschule für Technik' }],
      CORPUS.filter((d) => d.id !== 'go-as'),
      { corpus: CORPUS },
    )).toEqual([]);
  });

  it('weighs the words that distinguish, not the ones every title carries', () => {
    // "der Berliner Hochschule für Technik" is in every title and must not
    // drive a match on its own.
    expect(proposeCorrespondences(
      [{ id: 'x', title: 'der Berliner Hochschule für Technik' }],
      CORPUS,
      { corpus: CORPUS },
    )).toEqual([]);
  });

  it('flags a tie for review instead of picking one', () => {
    const twins: TitledDocument[] = [
      { id: 'a', title: 'Festsetzung von Höchstzahlen Sommersemester 2025' },
      { id: 'b', title: 'Festsetzung von Höchstzahlen Sommersemester 2025' },
    ];
    const [proposal] = proposeCorrespondences(
      [{ id: 's', title: 'Festsetzung von Höchstzahlen Sommersemester 2025' }],
      twins,
      { corpus: [...CORPUS, ...twins] },
    );
    expect(proposal?.confidence).toBe('review');
    expect(proposal?.runnerUp).toBe(proposal?.score);
  });

  it('keeps every tied target when a source legitimately has several', () => {
    // A consolidated Geschäftsordnung corresponds to all of its amendments.
    const amendments: TitledDocument[] = [
      { id: 'ae3', title: 'Geschäftsordnung des Akademischen Senats der Berliner Hochschule für Technik' },
      { id: 'ae4', title: 'Geschäftsordnung des Akademischen Senats der Berliner Hochschule für Technik' },
    ];
    // Weighted against a corpus of realistic size. Distinctiveness is a share
    // of the whole index, and in a seven-document world three titles about the
    // Akademischer Senat make "Senats" ordinary — correctly so. The live index
    // holds 121 titles, where it appears in a handful.
    const proposals = proposeCorrespondences(
      [{ id: 'web', title: 'Geschäftsordnung des Akademischen Senats (nichtamtliche Lesefassung)' }],
      amendments,
      { corpus: [...CORPUS, ...amendments, ...FILLER], allowMultiple: true },
    );
    expect(proposals.map((p) => p.targetId).sort()).toEqual(['ae3', 'ae4']);
  });

  it('never proposes a document against itself', () => {
    expect(proposeCorrespondences(
      [CORPUS[0]!], CORPUS, { corpus: CORPUS },
    ).every((p) => p.targetId !== p.sourceId)).toBe(true);
  });
});

describe('similarity', () => {
  it('scores nothing when the titles share no words', () => {
    const weights = { weightOf: () => 2, isDistinctive: () => true };
    expect(similarity('aaa', 'bbb', weights).score).toBe(0);
  });

  it('treats a word the corpus has never seen as maximally rare', () => {
    // Not as weight 1, which would rank it below every common word and let the
    // identifying-word gate pass a pair that shares only boilerplate.
    const [proposal] = proposeCorrespondences(
      [{ id: 'q', title: 'Prüfungsordnung Verfahrenstechnik der Berliner Hochschule für Technik' }],
      CORPUS,
      { corpus: CORPUS },
    );
    expect(proposal).toBeUndefined();
  });
});

describe('renderProposals', () => {
  it('renders a review sheet that says a person decides', () => {
    const proposals = proposeCorrespondences(
      [{ id: 'web', title: 'Geschäftsordnung des Akademischen Senats (Lesefassung)' }],
      CORPUS,
      { corpus: CORPUS },
    );
    const rendered = renderProposals(proposals, 'Test');
    expect(rendered).toContain('[ ]');
    expect(rendered).toContain('erfundene Fundstelle');
    expect(rendered).toContain('Nichts hiervon ist übernommen');
  });

  it('says so when nothing could be proposed', () => {
    expect(renderProposals([], 'Test')).toContain('Keine Zuordnung');
  });
});
