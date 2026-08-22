import type { AdministrativeGuidanceReference, NormativeForce } from '../../contracts/legal-resource.js';

/**
 * The sentence that has to travel with every hit.
 *
 * A model handed a Handreichung alongside statutory text will otherwise treat
 * the two as the same kind of answer. Stating the boundary once per response
 * costs a line; leaving it out means an internal Arbeitshilfe can be quoted as
 * the legal position, which is the specific failure this provider is built to
 * avoid.
 */
export const SCOPE_CAVEAT =
  'Hausquellen sagen, wie hier verfahren wird — nicht, wie die Rechtslage ist. '
  + 'Für Rechtsgrundlagen die Gesetzes- und Rechtsprechungswerkzeuge nutzen.';

const FORCE_LABEL: Record<NormativeForce, string> = {
  binding: 'verbindlich',
  guidance: 'unverbindliche Orientierung',
  record: 'dokumentiert, regelt nicht',
  draft: 'ENTWURF — nicht vereinbart',
};

const STATUS_LABEL: Record<string, string> = {
  'in-force': 'gültig',
  draft: 'Entwurf',
  superseded: 'ERSETZT',
  expired: 'AUSGELAUFEN',
  unknown: 'Quelle nicht mehr erreichbar — Gültigkeit ungeklärt',
};

/** Whole months between an ISO date and `now`, or undefined if unparseable. */
export function ageInMonths(asOf: string, now: Date = new Date()): number | undefined {
  const then = new Date(asOf);
  if (Number.isNaN(then.getTime())) return undefined;
  const months = (now.getFullYear() - then.getFullYear()) * 12
    + (now.getMonth() - then.getMonth());
  return months < 0 ? 0 : months;
}

/**
 * One line stating what the reader is holding, before they read a word of it.
 *
 * Ordered by what changes a decision: force first, then whether it still
 * applies, then how old it is, then who to ask. The age is spelled out rather
 * than left as a date because "Stand 03/2021" reads as recent to a model and
 * "vor 4 Jahren" does not.
 */
export function renderBanner(
  reference: AdministrativeGuidanceReference,
  options: { staleAfterMonths?: number; now?: Date } = {},
): string {
  const parts: string[] = [];
  if (reference.documentType) parts.push(reference.documentType);
  parts.push(FORCE_LABEL[reference.normativeForce]);
  parts.push(STATUS_LABEL[reference.status] ?? reference.status);

  if (reference.asOf) {
    const months = ageInMonths(reference.asOf, options.now);
    const stale = months !== undefined
      && months >= (options.staleAfterMonths ?? 24);
    const age = months === undefined
      ? ''
      : months < 12
        ? ` (${months} Mon. alt)`
        : ` (${Math.floor(months / 12)} J. alt)`;
    parts.push(`Stand ${reference.asOf}${age}${stale ? ' — Aktualität prüfen' : ''}`);
  } else {
    parts.push('ohne Stand-Angabe');
  }

  if (reference.owner) parts.push(reference.owner);
  return `⚠ ${parts.join(' · ')}`;
}
