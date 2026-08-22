# TODO: making `haus:` answer authoritatively

The house index currently retrieves *relevantly*. Relevance and authority are
not the same thing, and for a corpus of institutional rules the gap between
them is where the wrong answers live. This is the list of what closes it,
ordered by how much damage each gap does today.

Status legend: **[ ]** open · **[~]** partially in place · **[x]** done

---

## 1. Consolidation — the one that produces confidently wrong answers

**[~] Link amendments to the rule they amend.**
`haus:history` parses the relation out of the title — three amendment shapes and
a repeal shape, all four present in the live corpus — and reports it in both
directions. Measured on the 121 indexed documents: 35 relations, of which only
**6 find their base rule**. The other 29 point at rules the digital gazette does
not reach back to. `haus:coverage` now states that count, because it bounds what
the corpus can honestly answer.

Matching is exact on the normalised title, with the stated date breaking ties
between versions. A fuzzy match was rejected: the corpus holds dozens of
Prüfungsordnungen differing by one degree programme, and attaching an amendment
to the wrong one would report a rule as amended when it was not.

Still open: the reading versions do not link to their amendments, because the
website titles a rule differently from the gazette ("Geschäftsordnung des
Akademischen Senats (nichtamtliche Lesefassung)" against "… der Berliner
Hochschule für Technik (GO-AS)"). This is the same missing correspondence as
§ 3 below, and the same answer applies: propose the mapping, have a person
confirm it.

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

`scripts/haus-propose-links.mjs` produces that list. Scoring is inverse document
frequency over title words — "der Berliner Hochschule für Technik" ends nearly
every title and must not drive a match, while "Senats" or "Geodäsie" decides
one — with two gates that keep a best-match scorer from always returning
something: the word identifying the shorter title must be among the shared ones,
and at least one shared word must appear in no more than 30 % of titles.
Confidence is `clear` only when the match also clears the runner-up by a margin,
because dozens of Prüfungsordnungen differ by a single programme.

Nothing is applied. The sheet has a confirmation column, and the runner-up score
beside each row so a reviewer sees how close the field was.

## 4. Citations into higher-ranking law

**[x] Extract statutory references and resolve them through `legis:`.**
`haus:legal_basis` reads a rule's citations and groups them by where each has
to be resolved: statutes and regulations through `legis:`, other house rules
through this index, unattributed ones inside the document itself. What counts
as internal is whatever an indexed document announces as its own abbreviation,
so the classification corrects itself as the corpus grows — `BHT-GO` moved from
external to internal the moment the Grundordnung was indexed.

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
- **[x] PDF full text from OPUS.** Extracted with `unpdf`, running masthead
  removed by frequency across pages, provision headings promoted only where the
  text after the § is capitalised and short — so an amendment's quoted
  provisions stay prose instead of posing as its own sections.
- **[x] Incremental output from long discovery runs.** Results stream to a
  `.jsonl` checkpoint as they land, and unreachable pages are named in the
  report rather than only counted.
- **[ ] Re-check the pages a sweep could not fetch.** The first full run over
  1.272 pages found 4 reading versions — the four already known — and failed to
  fetch 56 (4,4 %). Those are unaccounted for and could hide a rule. The report
  now names them, so a targeted second pass is cheap; it has not been run.
- **[ ] OAI-PMH once opened.** Gives real deltas via `from=` and deleted-record
  semantics. Only the fetch layer changes; the mapping is already written.
- **[ ] Re-crawl and staleness loop.** `haus:stale` reports age. Nothing yet
  detects that a source URL changed content or stopped answering, which is what
  `status: 'unknown'` was built to record.
