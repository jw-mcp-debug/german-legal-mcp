import { normalizeTitle } from './relations.js';

/**
 * Proposing the correspondences nobody wrote down.
 *
 * Two links are missing from this corpus and neither source states them: which
 * gazette record a website reading version consolidates, and which base rule an
 * amendment changes when the two name it differently. Both are needed before
 * the index can answer "and where does that officially say so".
 *
 * Proposed, never applied. A wrong correspondence is a fabricated citation —
 * the one failure a legal corpus must not produce quietly — so this ranks
 * candidates, shows what each match rests on, and stops.
 *
 * Scoring is by inverse document frequency over title words, which is what
 * makes it usable here at all. Nearly every title in the corpus ends "der
 * Berliner Hochschule für Technik"; those words carry almost no weight, while
 * "Kuratoriums" or "Geodäsie" appears a handful of times and decides the match.
 * A plain word-overlap score would rank every pair of Ordnungen as a near-hit.
 */

export interface TitledDocument {
  readonly id: string;
  readonly title: string;
  readonly asOf?: string;
}

export type ProposalConfidence = 'clear' | 'review';

export interface Proposal {
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly targetId: string;
  readonly targetTitle: string;
  readonly score: number;
  readonly confidence: ProposalConfidence;
  /** The distinctive words the match rests on, heaviest first. */
  readonly evidence: readonly string[];
  /** The next-best score, so a reviewer sees how close the field was. */
  readonly runnerUp?: number;
}

/** Below this, the shared wording is boilerplate and the pair is not proposed. */
const MINIMUM_SCORE = 0.5;

/** At or above this, and clear of the runner-up, a match needs only a glance. */
const CLEAR_SCORE = 0.75;

/**
 * How far ahead of the next candidate a match must be to count as clear.
 *
 * The corpus holds dozens of Prüfungsordnungen differing by one degree
 * programme, so a high score means little on its own — what distinguishes a
 * real match is that nothing else comes close.
 */
const CLEAR_MARGIN = 0.15;

function tokenize(title: string): string[] {
  return normalizeTitle(title).split(' ').filter((word) => word.length > 2);
}

export interface TitleWeights {
  weightOf(word: string): number;
  /**
   * Whether a word is specific enough to carry a match on its own.
   *
   * Judged by document frequency rather than by comparing weights to their
   * mean. In a corpus of 121 titles most vocabulary appears exactly once, so
   * the mean weight sits near the maximum and "Senats" — five occurrences, and
   * the word that distinguishes the Akademischer Senat from the Akademische
   * Versammlung — falls below it. Document frequency asks the question
   * directly: does this word appear in so many titles that sharing it says
   * nothing?
   */
  isDistinctive(word: string): boolean;
}

/** Above this share of titles, a word is institutional wording, not a subject. */
const UBIQUITY_LIMIT = 0.3;

/** log(N / documents containing the word) — rare words weigh most. */
function inverseDocumentFrequency(corpus: readonly TitledDocument[]): TitleWeights {
  const documentCount = new Map<string, number>();
  for (const document of corpus) {
    for (const word of new Set(tokenize(document.title))) {
      documentCount.set(word, (documentCount.get(word) ?? 0) + 1);
    }
  }
  const weights = new Map<string, number>();
  for (const [word, count] of documentCount) {
    weights.set(word, Math.log(Math.max(corpus.length, 1) / count) + 1);
  }

  // A word the corpus has never seen is maximally rare, so it must weigh what a
  // once-seen word weighs. Defaulting it to 1 — below every common word —
  // inverted the ranking exactly where it matters: "Rektorats" in a corpus that
  // holds no Rektorat scored under "Geschäftsordnung", and the identifying-word
  // gate then let a wrong pair through.
  const unseen = Math.log(Math.max(corpus.length, 1)) + 1;
  const total = Math.max(corpus.length, 1);

  return {
    weightOf: (word) => weights.get(word) ?? unseen,
    isDistinctive: (word) => (documentCount.get(word) ?? 0) / total <= UBIQUITY_LIMIT,
  };
}

function weigh(words: Iterable<string>, weights: TitleWeights): number {
  let total = 0;
  for (const word of words) total += weights.weightOf(word);
  return total;
}

/**
 * Weighted overlap against the lighter of the two titles.
 *
 * Against the lighter one on purpose: an amendment's title is its parent's plus
 * an ordinal and two dates, and a reading version's is its gazette record's
 * minus the institutional suffix. Dividing by the longer would penalise exactly
 * the asymmetry that is normal here.
 */
export function similarity(
  a: string,
  b: string,
  weights: TitleWeights,
): { score: number; shared: string[] } {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  const shared = [...wordsA].filter((word) => wordsB.has(word));
  const floor = Math.min(weigh(wordsA, weights), weigh(wordsB, weights));
  if (floor === 0) return { score: 0, shared: [] };

  // The word that identifies the shorter title must be one of the shared ones.
  //
  // Without this gate, "Geschäftsordnung der Akademischen Versammlung" scored
  // 0,63 against "Geschäftsordnung des Akademischen Senats" — three of four
  // words match and the one that names the body does not. A best-match scorer
  // always returns something, so a rule whose true counterpart is absent gets
  // proposed against its nearest neighbour. This is what stops that: the
  // distinguishing word carries the most weight precisely because it is rare,
  // and a match that misses it is a different rule.
  const lighter = weigh(wordsA, weights) <= weigh(wordsB, weights) ? wordsA : wordsB;
  const byWeight = (x: string, y: string) => weights.weightOf(y) - weights.weightOf(x);
  const identifying = [...lighter].sort(byWeight)[0];
  if (identifying === undefined || !shared.includes(identifying)) {
    return { score: 0, shared: [] };
  }

  // And the word the match rests on has to carry information. A title made
  // entirely of the institutional suffix every rule shares matches everything
  // perfectly and means nothing.
  if (!shared.some((word) => weights.isDistinctive(word))) {
    return { score: 0, shared: [] };
  }

  return {
    score: weigh(shared, weights) / floor,
    shared: shared.sort((x, y) => weights.weightOf(y) - weights.weightOf(x)),
  };
}

export interface ProposalOptions {
  /** Weighted by the whole corpus, not just the two sides being matched. */
  readonly corpus?: readonly TitledDocument[];
  readonly minimumScore?: number;
  /**
   * Keep every target that ties with the best, rather than one per source.
   *
   * A consolidated Geschäftsordnung genuinely corresponds to all four of its
   * amendments; forcing a single answer there would hide three of them.
   */
  readonly allowMultiple?: boolean;
}

/**
 * For each source document, the best target and how safe it looks.
 *
 * One proposal per source at most: offering a reviewer three candidates for the
 * same rule invites them to pick the plausible one, which is the judgement this
 * is supposed to be making explicit rather than delegating.
 */
export function proposeCorrespondences(
  sources: readonly TitledDocument[],
  targets: readonly TitledDocument[],
  options: ProposalOptions = {},
): Proposal[] {
  const corpus = options.corpus ?? [...sources, ...targets];
  const weights = inverseDocumentFrequency(corpus);
  const minimum = options.minimumScore ?? MINIMUM_SCORE;
  const proposals: Proposal[] = [];

  for (const source of sources) {
    const scored = targets
      .filter((target) => target.id !== source.id)
      .map((target) => ({ target, ...similarity(source.title, target.title, weights) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < minimum) continue;
    const runnerUp = scored[1]?.score;
    const clear = best.score >= CLEAR_SCORE
      && (runnerUp === undefined || best.score - runnerUp >= CLEAR_MARGIN);

    const kept = options.allowMultiple
      ? scored.filter((entry) => best.score - entry.score < 1e-9)
      : [best];

    for (const entry of kept) {
      proposals.push({
        sourceId: source.id,
        sourceTitle: source.title,
        targetId: entry.target.id,
        targetTitle: entry.target.title,
        score: Number(entry.score.toFixed(3)),
        confidence: options.allowMultiple
          ? (best.score >= CLEAR_SCORE ? 'clear' : 'review')
          : (clear ? 'clear' : 'review'),
        evidence: entry.shared.slice(0, 5),
        ...(runnerUp !== undefined && !options.allowMultiple
          ? { runnerUp: Number(runnerUp.toFixed(3)) }
          : {}),
      });
    }
  }

  return proposals.sort((a, b) => b.score - a.score);
}

/** A review sheet: proposal, what it rests on, and how close the field was. */
export function renderProposals(proposals: readonly Proposal[], heading: string): string {
  if (proposals.length === 0) {
    return `## ${heading}\n\nKeine Zuordnung vorgeschlagen.`;
  }
  const clear = proposals.filter((p) => p.confidence === 'clear').length;
  return [
    `## ${heading}`,
    '',
    `${proposals.length} Vorschlag/Vorschläge, davon ${clear} eindeutig.`,
    '',
    '| Bestätigt? | Dokument | Zuordnung zu | Wert | Nächstbester | Belegwörter |',
    '|---|---|---|---|---|---|',
    ...proposals.map((p) =>
      `| ${p.confidence === 'clear' ? '[ ] ✓ eindeutig' : '[ ] ⚠ prüfen'} `
      + `| ${p.sourceTitle.slice(0, 60)} \`${p.sourceId}\` `
      + `| ${p.targetTitle.slice(0, 60)} \`${p.targetId}\` `
      + `| ${p.score} | ${p.runnerUp ?? '—'} | ${p.evidence.join(', ')} |`),
    '',
    '> Nichts hiervon ist übernommen. Eine falsche Zuordnung erzeugt eine',
    '> erfundene Fundstelle — deshalb entscheidet hier ein Mensch, nicht der Wert',
    '> in der Spalte. "Nächstbester" zeigt, wie knapp das Feld war.',
  ].join('\n');
}
