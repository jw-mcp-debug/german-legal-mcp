/**
 * Binding an amendment to the rule it changes.
 *
 * The gazette promulgates changes as standalone documents — 29 of the 121
 * indexed here, very nearly a quarter — and consolidates nothing. Left
 * unlinked, "Vierte Änderung der Geschäftsordnung des Akademischen Senats"
 * competes on equal terms with the Geschäftsordnung itself, and a question
 * about what the rule says can be answered with a list of changes to it. That
 * is the failure this module exists to prevent: not a missing feature, a
 * confidently wrong answer.
 *
 * Titles carry the link in regular form, in three shapes that all appear in the
 * live corpus, plus repeals, which are a different act and are modelled as one.
 */

export type RelationKind = 'amends' | 'repeals';

export interface RuleRelation {
  readonly kind: RelationKind;
  /** "Vierte" → 4, where the title states one. */
  readonly ordinal?: number;
  /** The referenced rule's title, as written, without its date suffix. */
  readonly parentTitle: string;
  /** The referenced rule's own date, ISO, where the title states one. */
  readonly parentDate?: string;
}

const ORDINALS: Readonly<Record<string, number>> = {
  erste: 1, zweite: 2, dritte: 3, vierte: 4, fünfte: 5, sechste: 6,
  siebte: 7, siebente: 7, achte: 8, neunte: 9, zehnte: 10, elfte: 11, zwölfte: 12,
};

/**
 * The three amendment shapes and the repeal shape, in the order they must be
 * tried: the repeal pattern first, because "Ordnung zur Aufhebung der X" also
 * matches nothing else, and the "Ordnung zur Änderung" form before the bare
 * "Änderung" form, which would otherwise capture "Ordnung zur" as part of it.
 */
const PATTERNS: ReadonlyArray<{ kind: RelationKind; pattern: RegExp }> = [
  { kind: 'repeals', pattern: /^(?:(\w+)\s+)?Ordnung\s+zur\s+Aufhebung\s+der\s+(.+)$/iu },
  { kind: 'amends', pattern: /^(?:(\w+)\s+)?Ordnung\s+zur\s+Änderung\s+der\s+(.+)$/iu },
  { kind: 'amends', pattern: /^(?:(\w+\.?)\s+)?Änderung(?:sordnung)?\s+der\s+(.+)$/iu },
];

function toOrdinal(word: string | undefined): number | undefined {
  if (!word) return undefined;
  const numeric = /^(\d+)\.?$/.exec(word);
  if (numeric) return Number(numeric[1]);
  return ORDINALS[word.toLowerCase()];
}

function toIso(date: string): string | undefined {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(date);
  return match
    ? `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
    : undefined;
}

/**
 * Split "… der Geschäftsordnung … (GO-AS) vom 05.12.2013 vom 15.01.2026" into
 * the parent's title and the parent's date.
 *
 * Two dates, and which is which matters: the last is the amendment's own date,
 * the one before it belongs to the rule being amended. Reading them the other
 * way round would look for a parent that never existed.
 */
function splitParent(rest: string): { title: string; date?: string } {
  const dates = [...rest.matchAll(/\bvom\s+(\d{1,2}\.\d{1,2}\.\d{4})/gu)];
  if (dates.length === 0) return { title: rest.trim() };

  // With two or more, the parent's date is the second to last; with one, the
  // title carries only the parent's date and the amendment's is elsewhere.
  const parentMatch = dates.length >= 2 ? dates[dates.length - 2]! : dates[0]!;
  const title = rest.slice(0, parentMatch.index).trim();
  const date = toIso(parentMatch[1]!);
  return { title, ...(date ? { date } : {}) };
}

export function parseRuleRelation(title: string): RuleRelation | null {
  for (const { kind, pattern } of PATTERNS) {
    const match = pattern.exec(title.trim());
    if (!match) continue;
    const { title: parentTitle, date } = splitParent(match[2]!);
    if (parentTitle === '') return null;
    const ordinal = toOrdinal(match[1]);
    return {
      kind,
      parentTitle,
      ...(ordinal !== undefined ? { ordinal } : {}),
      ...(date ? { parentDate: date } : {}),
    };
  }
  return null;
}

/**
 * Reduce a title to what two references to the same rule share.
 *
 * Dates, bracketed abbreviations and punctuation vary between how a rule names
 * itself and how an amendment names it, and none of that variation is
 * information. What survives is the wording, which is stable because both are
 * written by the same office from the same template.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/\bvom\s+\d{1,2}\.\d{1,2}\.\d{4}/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

export interface RuleCandidate {
  readonly id: string;
  readonly title: string;
  readonly asOf?: string;
}

/**
 * Find the rule an amendment refers to.
 *
 * Exact normalised equality only. A fuzzy match here would silently attach an
 * amendment to the wrong Prüfungsordnung — this corpus holds dozens that differ
 * by one degree programme — and a wrong parent is worse than no parent: it
 * would report a rule as amended when it was not.
 */
export function matchParent(
  relation: RuleRelation,
  candidates: readonly RuleCandidate[],
): RuleCandidate | null {
  const wanted = normalizeTitle(relation.parentTitle);
  if (wanted === '') return null;
  const matches = candidates.filter(
    (candidate) => normalizeTitle(candidate.title) === wanted,
  );
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) return null;
  // Several rules share a title across versions; the parent's stated date
  // decides. Without one, refuse rather than pick.
  return matches.find((candidate) => candidate.asOf === relation.parentDate) ?? null;
}
