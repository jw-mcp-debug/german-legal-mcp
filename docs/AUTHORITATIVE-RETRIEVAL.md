# TODO: making `haus:` answer authoritatively

The house index currently retrieves *relevantly*. Relevance and authority are
not the same thing, and for a corpus of institutional rules the gap between
them is where the wrong answers live. This is the list of what closes it,
ordered by how much damage each gap does today.

Status legend: **[ ]** open · **[~]** partially in place · **[x]** done

---

## 1. Consolidation — the one that produces confidently wrong answers

**[ ] Link amendments to the rule they amend.**

The gazette publishes amendments as standalone documents:

> *Vierte Änderung der Geschäftsordnung des Akademischen Senats … vom 05.12.2013 vom 15.01.2026*

Nothing in the index says this text is a delta rather than a rule. Ask "what
does the GO-AS say about Beschlussfähigkeit" and an amendment can win on BM25
alone — returning a change list as if it were the provision. `looksLikeAmendment()`
flags these; nothing yet acts on the flag.

The title carries the link in a regular form — `<ordinal> Änderung der <parent
title> vom <parent date>` — so the parent can be resolved by matching that
trailing title-and-date against the corpus. Where the parent is present, an
amendment should never be returned as a standalone answer: it belongs *attached*
to the parent, as "amended on 2026-01-15".

**[ ] Return the consolidated version when one exists.**

Where a `bht-web` reading version covers the same rule, that is the text a
person wants and the gazette record is the citation for it. The answer shape
should be: consolidated text, its Stand, and any amendments promulgated *after*
that Stand — which is exactly the case where the convenient copy is out of date
and the reader must be told.

## 2. Authority-aware ranking

**[ ] Rank on standing, not only on term frequency.**

BM25 is authority-blind: an FAQ that repeats a term often outranks the Ordnung
that governs it. The fields to rank on are already indexed and unused —
`authority` (official before reading-version), `normativeForce` (binding before
guidance before record), `status`, and `asOf` recency.

Deliberately a re-rank over BM25 rather than a filter: a Handreichung *is* often
the better answer to "how do I actually do this", and suppressing it would trade
one wrong answer for another. What must not happen is a binding rule losing to
advisory material on term frequency alone.

## 3. The missing `authoritativeSource` mapping

**[~] Field exists and the banner renders it; nothing populates it.**

Neither OPUS nor the website states which gazette issue a given reading version
consolidates. Without it the banner warns that the official text governs but
cannot say where it is.

Proposed: match reading-version titles against gazette records by normalised
title plus decision date, emit the correspondence as a reviewable list, and have
a person confirm it once. Auto-matching without review would fabricate exactly
the kind of citation this provider exists to keep honest.

## 4. Citations into higher-ranking law

**[ ] Extract statutory references and resolve them through `legis:`.**

The Ordnungen cite the Berlin higher-education act constantly and precisely —
`§ 61 Abs. 2 Nr. 7 BerlHG`, `§ 48 Abs. 5 Satz 2 BerlHG`. Extracting those and
resolving them against the `legis:` provider already in this server turns a
house rule into a chain a reader can follow to the statute that authorises it.

This is the single feature that would let `haus:` answer "on what legal basis"
rather than only "what do we do" — the boundary the tool descriptions currently
tell the model not to cross. Worth doing precisely because it crosses it
*correctly*, with a real citation rather than an inference.

## 5. Temporal validity

**[ ] Record when a rule took effect, not only when it was decided.**

`asOf` carries the Beschlussdatum. "Which version applied in March 2025" needs
an in-force interval, and the Inkrafttreten clause usually states it in the text
rather than the metadata. Until this exists, the honest position is that the
index answers "what applies now" and refuses questions about past states — which
it does not currently say out loud.

## 6. Completeness a caller can rely on

**[~] `haus:coverage` reports what is indexed; it cannot report what is missing.**

Counts per type and office exist. What is absent is a statement of scope: which
bodies of rules are covered *completely* as of when. Without it "no hits" stays
ambiguous between "not regulated" and "not indexed", and only the first is ever
a safe conclusion.

## 7. Ingest gaps

- **[x] Discovery for reading versions.** No crawl was needed: `sitemap.xml`
  lists all 1.272 German pages and contains every known reading version, so one
  request replaces a breadth-first walk. `scripts/haus-discover.mjs` walks it,
  honours `robots.txt`, and keeps pages carrying three or more `§` headings.
  It reports for review rather than ingesting, because `owner` and
  `authoritativeSource` are not on these pages.
- **[ ] Change detection for web pages.** The sitemap's `lastmod` cannot serve:
  TYPO3 dates the page record, not its content. `/589` reports `2015-10-28`
  while the page states "in der Fassung vom 16.07.2026". Re-fetch and compare
  the content hash the index already stores; `lastmod` is recorded only so the
  discrepancy stays visible.
- **[ ] PDF full text from OPUS.** Frontdoor metadata is parsed; the linked PDFs
  are not yet converted, so gazette records currently index without their text.
- **[ ] OAI-PMH once opened.** Gives real deltas via `from=` and deleted-record
  semantics. Only the fetch layer changes; the mapping is already written.
- **[ ] Re-crawl and staleness loop.** `haus:stale` reports age. Nothing yet
  detects that a source URL changed content or stopped answering, which is what
  `status: 'unknown'` was built to record.
