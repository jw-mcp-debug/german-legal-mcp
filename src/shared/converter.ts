import TurndownService from 'turndown';

/**
 * Base Turndown service for legal HTML → Markdown conversion.
 * Providers extend this with their own rules.
 */
export function createBaseTurndownService(): TurndownService {
  return new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
}

/**
 * Post-process Markdown: clean up artifacts, normalize whitespace.
 */
export function postProcessMarkdown(body: string): string {
  let processed = body;
  processed = processed.replace(/(^|\n)\[(\d+)\]/g, '$1[Rn. $2]{.rn}');
  processed = processed.replace(/\n{3,}/g, '\n\n');
  processed = processed.replace(/\[\]\(null\)/g, '');
  return processed.trim();
}
