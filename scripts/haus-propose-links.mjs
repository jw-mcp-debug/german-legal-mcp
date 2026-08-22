#!/usr/bin/env node
/**
 * Propose the two correspondences nobody wrote down, for review.
 *
 *   node scripts/haus-propose-links.mjs --out zuordnungen.md
 *
 * 1. Which gazette record each website reading version consolidates
 *    (`authoritativeSource`).
 * 2. Which base rule an amendment changes, where exact title matching missed.
 *
 * Nothing is written to the index. The output is a sheet for a person to
 * confirm — a wrong correspondence is a fabricated citation.
 */
import { writeFileSync } from 'node:fs';
import { HausIndexStore } from '../dist/providers/haus/store.js';
import { statePath } from '../dist/shared/state-paths.js';
import { proposeCorrespondences, renderProposals } from '../dist/providers/haus/matching.js';
import { matchParent, parseRuleRelation } from '../dist/providers/haus/relations.js';

const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const store = new HausIndexStore(
  flag('index') ?? process.env.GLMCP_HAUS_INDEX ?? statePath('haus', 'index.db'),
);
const docs = store.enumerate(undefined, 10_000, 0);
const titled = docs.map((d) => ({ id: d.id, title: d.title, asOf: d.asOf }));
const bySource = (id) => docs.filter((d) => d.sourceId === id)
  .map((d) => ({ id: d.id, title: d.title, asOf: d.asOf }));

// 1. Reading versions → the promulgated text they consolidate.
const readingVersions = bySource('bht-web');
const gazette = bySource('opus4-bht');
// Amendments are not what a reading version consolidates; it consolidates the
// rule. Offering an amendment as the authoritative counterpart would point a
// reader at a change list.
const baseRules = gazette.filter((d) => parseRuleRelation(d.title) === null);
const authoritative = proposeCorrespondences(readingVersions, baseRules, { corpus: titled });

// 2. Amendments whose base rule exact matching did not find.
const orphans = titled.filter((d) => {
  const relation = parseRuleRelation(d.title);
  return relation !== null
    && matchParent(relation, titled.filter((c) => c.id !== d.id)) === null;
});
const parents = proposeCorrespondences(
  orphans.map((d) => ({ ...d, title: parseRuleRelation(d.title).parentTitle })),
  baseRules,
  { corpus: titled },
);

// 3. Reading versions → the amendments that apply to the rule they consolidate.
// Amendments are matched through the rule they name, not their own title.
const amendmentsByParent = titled
  .map((d) => ({ d, relation: parseRuleRelation(d.title) }))
  .filter(({ relation }) => relation !== null)
  .map(({ d, relation }) => ({ id: d.id, title: relation.parentTitle, asOf: d.asOf }));
const applicable = proposeCorrespondences(readingVersions, amendmentsByParent, {
  corpus: titled,
  allowMultiple: true,
});

const out = [
  '# Zuordnungsvorschläge',
  '',
  `Bestand: ${docs.length} Dokumente — ${readingVersions.length} Lesefassungen, `
  + `${gazette.length} amtliche Datensätze, davon ${baseRules.length} Stammvorschriften.`,
  '',
  renderProposals(authoritative, 'Lesefassung → amtliche Fundstelle'),
  '',
  renderProposals(parents, `Änderung → Stammvorschrift (${orphans.length} ohne Zuordnung)`),
  '',
  renderProposals(applicable,
    'Lesefassung → Änderungen, die auf dieselbe Vorschrift ergangen sind'),
].join('\n');

const outPath = flag('out');
if (outPath) { writeFileSync(outPath, `${out}\n`); console.error(`geschrieben: ${outPath}`); }
else console.log(out);
store.close();
