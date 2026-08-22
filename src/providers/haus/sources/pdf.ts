import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Turning a gazette PDF into text the index can actually search.
 *
 * The Amtliche Mitteilungen are laid out for print: every page repeats a
 * five-line masthead — publisher, address, editorial contact, "Seite n von m" —
 * and long documents open with a dotted table of contents. Fed to BM25 as-is,
 * an 18-page Wahlordnung contains "Gremienreferat" and "Berliner Hochschule für
 * Technik" eighteen times each, and those terms then match every query about
 * anything.
 *
 * So the running furniture is removed before indexing, structurally rather than
 * by pattern: whatever repeats across most pages is furniture, whoever printed
 * it and whatever it says.
 */

/** Repeated on at least this share of pages to count as running furniture. */
const BOILERPLATE_PAGE_SHARE = 0.6;

/** Below this, "repeats on most pages" is not evidence of anything. */
const BOILERPLATE_MIN_PAGES = 3;

export interface PdfExtraction {
  readonly markdown: string;
  readonly pageCount: number;
  /** The lines dropped as running furniture, for inspection. */
  readonly droppedBoilerplate: readonly string[];
}

/**
 * Compare lines with their numbers blanked.
 *
 * "Wahlordnung Seite 3 von 18" is the same furniture as "… Seite 4 von 18" and
 * differs in exactly the part that changes per page. Without this the page
 * number alone defeats frequency counting, and the single noisiest line in the
 * document survives.
 */
function shapeOf(line: string): string {
  return line.replace(/\d+/g, '#').trim();
}

/** Lines that repeat across most pages — masthead, footer, running title. */
export function findBoilerplate(pages: readonly string[]): Set<string> {
  if (pages.length < BOILERPLATE_MIN_PAGES) return new Set();

  const pagesContaining = new Map<string, number>();
  for (const page of pages) {
    const shapes = new Set(
      page.split('\n').map(shapeOf).filter((shape) => shape.length > 0),
    );
    for (const shape of shapes) {
      pagesContaining.set(shape, (pagesContaining.get(shape) ?? 0) + 1);
    }
  }

  const threshold = pages.length * BOILERPLATE_PAGE_SHARE;
  return new Set(
    [...pagesContaining]
      .filter(([, count]) => count >= threshold)
      .map(([shape]) => shape),
  );
}

/**
 * A table-of-contents line: text, dot leaders, page number.
 *
 * Dropped rather than kept, because the leaders tokenize into noise and the
 * headings they point at are in the document anyway — where they carry their
 * text instead of a page reference.
 */
const TOC_LINE = /\.{3,}\s*\d+\s*$/;

/**
 * A provision heading: "§ 12 Wahlvorstand", at the start of its own line.
 *
 * The remainder must begin with a letter, which is what separates a heading
 * from a quoted provision. Amendment documents consist largely of the latter —
 * "§ 7 (4) Der Vorsitz muss alle nach …" is the Geschäftsordnung's text being
 * quoted so it can be replaced, not a section of the amendment. Promoting those
 * to headings makes an amendment look like it *contains* § 7 of the rule it
 * changes, which is precisely the confusion between a change list and a
 * provision that this corpus has to avoid.
 *
 * The length bound catches the rest: headings name a provision in a few words,
 * while a quoted paragraph runs on.
 */
const SECTION_HEADING = /^(§+\s*\d+[a-z]?)\s+(\p{Lu}[^\n]*)$/u;
const SECTION_HEADING_MAX_LENGTH = 120;

export function pagesToMarkdown(pages: readonly string[]): PdfExtraction {
  const boilerplate = findBoilerplate(pages);
  const dropped = new Set<string>();
  const out: string[] = [];

  for (const page of pages) {
    for (const rawLine of page.split('\n')) {
      const line = rawLine.trim();
      if (line === '') { out.push(''); continue; }

      if (boilerplate.has(shapeOf(line))) { dropped.add(line); continue; }
      if (TOC_LINE.test(line)) { dropped.add(line); continue; }

      const heading = line.length <= SECTION_HEADING_MAX_LENGTH
        ? SECTION_HEADING.exec(line)
        : null;
      if (heading) {
        // Blank line before a heading, so the § starts its own block and
        // `extract-section` can find it by heading text.
        out.push('', `### ${heading[1]} ${heading[2]}`, '');
        continue;
      }
      out.push(line);
    }
  }

  const markdown = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    markdown,
    pageCount: pages.length,
    droppedBoilerplate: [...dropped],
  };
}

/** Read a PDF's pages as plain text, in order. */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

export async function pdfToMarkdown(bytes: Uint8Array): Promise<PdfExtraction> {
  return pagesToMarkdown(await extractPdfPages(bytes));
}
