/**
 * Reading the citations a house rule makes, so the chain can be followed.
 *
 * The Ordnungen cite constantly and precisely — the Wahlordnung opens "gemäß
 * § 48 Abs. 5 Satz 2 sowie § 61 Abs. 2 Nr. 7 des Berliner Hochschulgesetzes
 * (BerlHG)" — and those references are the difference between a corpus that
 * says what the house does and one that can show on what authority.
 *
 * Three kinds, resolved in three different places:
 *
 * - **external** — a statute or regulation. `legis:` resolves it.
 * - **internal** — another house rule. This index resolves it.
 * - **self** — no source named, so it points inside the document it appears in.
 *
 * Which is which is not decided by a hardcoded list of abbreviations. The
 * corpus decides: an abbreviation that some indexed document announces as its
 * own is internal, and anything else naming a source is external. That keeps
 * the classification correct as the corpus grows, and wrong only in the
 * direction of sending a caller to `legis:` for something it will not find —
 * a visible failure rather than a silent misattribution.
 */

export type CitationScope = 'external' | 'internal' | 'self';

export interface Citation {
  /** The citation as written, e.g. "§ 61 Abs. 2 Nr. 7 BerlHG". */
  readonly raw: string;
  readonly section: string;
  readonly absatz?: string;
  readonly satz?: string;
  readonly nummer?: string;
  /** The source's abbreviation where the text names one. */
  readonly abbreviation?: string;
  readonly scope: CitationScope;
}

const CITATION = new RegExp(
  '§{1,2}\\s*(\\d+[a-z]?)'
  + '((?:\\s+(?:Abs\\.|Absatz|Satz|S\\.|Nr\\.|Nummer|Halbsatz|Alt\\.)\\s*\\d+)*)',
  'gu',
);

/**
 * A law abbreviation, as opposed to the ordinary word that follows many
 * citations. Two capitals or a hyphenated compound: `BerlHG`, `HWGVO`,
 * `BHT-WahlO` qualify; `Der`, `Absatz`, `Satz` do not.
 */
const ABBREVIATION = /^(?=(?:[^A-ZÄÖÜ]*[A-ZÄÖÜ]){2})[A-ZÄÖÜ][\wÄÖÜäöüß]*(?:-[\wÄÖÜäöüß]+)*$/u;

/**
 * How far past a citation to look for the source it belongs to.
 *
 * Enough to cross "des Berliner Hochschulgesetzes (BerlHG)", not enough to
 * reach the next sentence and borrow its statute. A citation whose source lies
 * further away is reported without one rather than attributed to a guess.
 */
const ATTRIBUTION_WINDOW = 90;

function part(modifiers: string, label: string): string | undefined {
  return new RegExp(`(?:${label})\\s*(\\d+)`).exec(modifiers)?.[1];
}

function findAbbreviation(text: string, from: number): string | undefined {
  const window = text.slice(from, from + ATTRIBUTION_WINDOW).split(/[.;]\s|\n/)[0] ?? '';
  const parenthesised = /\(([^)]{2,20})\)/.exec(window)?.[1];
  if (parenthesised && ABBREVIATION.test(parenthesised)) return parenthesised;
  for (const token of window.split(/[\s,]+/)) {
    const cleaned = token.replace(/[(),.;:]/g, '');
    if (cleaned === '') continue;
    if (ABBREVIATION.test(cleaned)) return cleaned;
    // Stop at the first ordinary word: a source named further along belongs to
    // whatever comes after, not to this citation.
    if (/^[a-zäöüß]/.test(cleaned) && !/^(?:des|der|dieser|dieses|dem|und|sowie|i|in|dem)$/.test(cleaned)) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Fold the characters a PDF text layer confuses.
 *
 * Measured in the Wahlordnung: `§ 47 Abs. 1 BerIHG` — capital I where the
 * abbreviation has a lowercase l. Four other citations in the same document
 * spell it `BerlHG`. A reader does not notice; `legis:` would answer "unknown
 * law", which is the citation silently failing to be followable.
 *
 * Folded only against abbreviations the same document already uses, and only
 * where the skeletons match exactly. That cannot invent a law: the target must
 * already appear, spelled unambiguously, a few lines away.
 */
function skeleton(abbreviation: string): string {
  return abbreviation.toLowerCase().replace(/[il1|]/g, 'i').replace(/[o0]/g, 'o');
}

function foldConfusables(abbreviations: readonly string[]): Map<string, string> {
  const bySkeleton = new Map<string, Map<string, number>>();
  for (const abbreviation of abbreviations) {
    const key = skeleton(abbreviation);
    const counts = bySkeleton.get(key) ?? new Map<string, number>();
    counts.set(abbreviation, (counts.get(abbreviation) ?? 0) + 1);
    bySkeleton.set(key, counts);
  }

  const canonical = new Map<string, string>();
  for (const counts of bySkeleton.values()) {
    if (counts.size < 2) continue;
    const [dominant] = [...counts].sort((a, b) => b[1] - a[1]);
    for (const [variant] of counts) canonical.set(variant, dominant![0]);
  }
  return canonical;
}

export function extractCitations(
  text: string,
  knownAbbreviations: ReadonlySet<string> = new Set(),
): Citation[] {
  const matches = [...text.matchAll(CITATION)];
  const raw = matches.map((match) => ({
    match,
    abbreviation: findAbbreviation(text, (match.index ?? 0) + match[0].length),
  }));

  const canonical = foldConfusables(
    raw.map((entry) => entry.abbreviation).filter((a): a is string => a !== undefined),
  );

  // "§ 48 Abs. 5 Satz 2 sowie § 61 Abs. 2 Nr. 7 des Berliner Hochschulgesetzes
  // (BerlHG)" names its source once, after the last citation in the list. Read
  // strictly forwards, the first citation looks like a self-reference. So an
  // unattributed citation inherits from the next attributed one when only a
  // conjunction separates them.
  for (let i = raw.length - 1; i > 0; i--) {
    const current = raw[i]!;
    const previous = raw[i - 1]!;
    if (current.abbreviation === undefined || previous.abbreviation !== undefined) continue;
    const between = text.slice(
      (previous.match.index ?? 0) + previous.match[0].length,
      current.match.index ?? 0,
    );
    if (/^[\s,]*(?:sowie|und|i\.?\s?V\.?\s?m\.?|,)?[\s,]*$/i.test(between)) {
      previous.abbreviation = current.abbreviation;
    }
  }

  const found = new Map<string, Citation>();

  for (const entry of raw) {
    const { match } = entry;
    const [, section, modifiers = ''] = match;
    const abbreviation = entry.abbreviation === undefined
      ? undefined
      : canonical.get(entry.abbreviation) ?? entry.abbreviation;
    const scope: CitationScope = abbreviation === undefined
      ? 'self'
      : knownAbbreviations.has(abbreviation) ? 'internal' : 'external';

    const absatz = part(modifiers, 'Abs\\.|Absatz');
    const satz = part(modifiers, 'Satz|S\\.');
    const nummer = part(modifiers, 'Nr\\.|Nummer');
    const raw = `§ ${section}${modifiers.replace(/\s+/g, ' ')}`
      + (abbreviation ? ` ${abbreviation}` : '');

    // De-duplicated: a Wahlordnung cites its own § 1 dozens of times, and a
    // list that repeats them says nothing a count does not.
    if (!found.has(raw)) {
      found.set(raw, {
        raw,
        section: section!,
        scope,
        ...(absatz ? { absatz } : {}),
        ...(satz ? { satz } : {}),
        ...(nummer ? { nummer } : {}),
        ...(abbreviation ? { abbreviation } : {}),
      });
    }
  }

  return [...found.values()];
}

/**
 * The abbreviation a document announces for itself: "Wahlordnung der Berliner
 * Hochschule für Technik (BHT-WahlO)". This is what makes a citation to
 * BHT-WahlO resolvable inside the corpus rather than a trip to `legis:`.
 */
export function abbreviationOf(title: string): string | undefined {
  for (const match of title.matchAll(/\(([^)]{2,20})\)/g)) {
    if (ABBREVIATION.test(match[1]!)) return match[1];
  }
  return undefined;
}

export interface CitationSummary {
  readonly external: readonly Citation[];
  readonly internal: readonly Citation[];
  readonly self: readonly Citation[];
}

export function groupCitations(citations: readonly Citation[]): CitationSummary {
  return {
    external: citations.filter((c) => c.scope === 'external'),
    internal: citations.filter((c) => c.scope === 'internal'),
    self: citations.filter((c) => c.scope === 'self'),
  };
}
