/**
 * Minimal XML text decoding for the flat listing feeds the providers walk.
 *
 * The bulk indexes are simple enough that a full parser would cost more than
 * it returns: `rii-toc.xml` is 83.785 flat `<item>` elements and `gii-toc.xml`
 * 6.127, both with fixed child order. What they do need is correct text
 * decoding — GII carries 247 `&quot;` in its law titles, and `&amp;` is not
 * optional in any XML that has to express a literal `&`.
 *
 * Numeric references are handled because the format permits them and ignoring
 * one silently corrupts a title rather than failing loudly.
 */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    // Last, so a doubly-encoded `&amp;lt;` does not become `<`.
    .replace(/&amp;/g, '&');
}

/**
 * Compiled once per tag. A walk of RII asks for five fields across 83.785
 * items, so building the pattern per call would mean 419.000 constructions
 * for a parse that otherwise takes ~150 ms.
 */
const FIELD_PATTERNS = new Map<string, RegExp>();

function fieldPattern(tag: string): RegExp {
  const cached = FIELD_PATTERNS.get(tag);
  if (cached) return cached;
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  FIELD_PATTERNS.set(tag, pattern);
  return pattern;
}

/**
 * Pull the text of the first `<tag>` inside a fragment.
 *
 * Returns an empty string when absent, which the callers treat as "field not
 * published" rather than as an error — the RII DTD marks three of its five
 * children optional.
 */
export function xmlField(fragment: string, tag: string): string {
  return decodeXmlEntities(fragment.match(fieldPattern(tag))?.[1]?.trim() ?? '');
}

/** Iterate the `<item>` fragments of a flat listing feed. */
export function xmlItems(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1] ?? '');
}
