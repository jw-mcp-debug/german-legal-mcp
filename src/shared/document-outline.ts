/**
 * A map of a long document, offered instead of the document itself.
 *
 * Retrieval is where a legal MCP server spends its context. Measured against
 * this server's own sources: a full BVerfG decision costs ~19.700 tokens, a
 * Landesarbeitsgericht judgment ~12.000, a Wahlordnung ~12.300 — while the same
 * decision's Tenor, asked for by name, costs 157. A caller that fetches five
 * judgments has spent a 140.000-token conversation before the analysis starts.
 *
 * The outline closes that gap without hiding anything: it names every section
 * and says how to ask for one. The full text stays one parameter away.
 */

/**
 * Characters per token for German legal prose, calibrated against this
 * server's own sources: one BVerfG decision measured 103.441 characters and
 * 31.174 tokens, giving 3,32. The figure only has to be good enough to tell a
 * caller whether a section costs hundreds or thousands.
 */
const CHARS_PER_TOKEN = 3.3;

/** Beyond this a heading is a document title, not a signpost. */
const HEADING_DISPLAY_LIMIT = 80;

export interface OutlineEntry {
  readonly heading: string;
  readonly level: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly chars: number;
}

export interface DocumentOutline {
  readonly entries: readonly OutlineEntry[];
  readonly totalLines: number;
  readonly totalChars: number;
  readonly estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.round(text.length / CHARS_PER_TOKEN);
}

export function buildOutline(markdown: string): DocumentOutline {
  const lines = markdown.split('\n');
  const headings: { heading: string; level: number; startLine: number }[] = [];

  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line ?? '');
    if (match) {
      headings.push({
        heading: match[2]!,
        level: match[1]!.length,
        startLine: index + 1,
      });
    }
  }

  const entries: OutlineEntry[] = headings.map((entry, index) => {
    const endLine = headings[index + 1] ? headings[index + 1]!.startLine - 1 : lines.length;
    const chars = lines.slice(entry.startLine - 1, endLine).join('\n').length;
    return { ...entry, endLine, chars };
  });

  return {
    entries,
    totalLines: lines.length,
    totalChars: markdown.length,
    estimatedTokens: estimateTokens(markdown),
  };
}

export interface OutlineRenderOptions {
  /** Header block already rendered by the provider — court, date, source. */
  readonly header: string;
  /**
   * The document's own title, where its body repeats it as a heading.
   *
   * RII decisions open with their title, and BVerfG titles run past four
   * hundred characters — listed as a section it would dominate the outline and
   * point at nothing.
   */
  readonly omitHeading?: string;
  /** How the caller asks for the whole thing, e.g. "full: true". */
  readonly fullHint: string;
  /** How the caller asks for one part, e.g. `section: "Tenor"`. */
  readonly sectionHint: string;
}

/**
 * Render the map. Where a document has no headings there is nothing to name, so
 * the caller is offered line ranges instead — still better than an unannounced
 * twenty-thousand-token answer.
 */
export function renderOutline(
  markdown: string,
  options: OutlineRenderOptions,
): string {
  const outline = buildOutline(markdown);
  const lines = [
    options.header,
    '',
    `Gliederung — der Volltext umfasst ${outline.totalLines} Zeilen `
    + `(~${outline.estimatedTokens.toLocaleString('de-DE')} Tokens) und wurde `
    + 'nicht mitgeschickt.',
    '',
  ];

  const shown = outline.entries.filter(
    (entry) => entry.heading !== options.omitHeading,
  );

  if (shown.length > 0) {
    lines.push('| Abschnitt | Zeilen | ~Tokens |', '|---|---|---|');
    for (const entry of shown) {
      const heading = entry.heading.length > HEADING_DISPLAY_LIMIT
        ? `${entry.heading.slice(0, HEADING_DISPLAY_LIMIT)}…`
        : entry.heading;
      lines.push(`| ${'—'.repeat(Math.max(0, entry.level - 1))}${heading} `
        + `| ${entry.startLine}–${entry.endLine} `
        + `| ${Math.round(entry.chars / CHARS_PER_TOKEN).toLocaleString('de-DE')} |`);
    }
  } else {
    lines.push('Das Dokument hat keine Überschriften; es lässt sich nur über '
      + 'Zeilenbereiche abrufen.');
  }

  lines.push(
    '',
    `Einen Abschnitt anfordern: ${options.sectionHint}`,
    `Oder einen Zeilenbereich: \`section: "lines:1-80"\``,
    `Den vollständigen Text anfordern: ${options.fullHint}`,
  );
  return lines.join('\n');
}
