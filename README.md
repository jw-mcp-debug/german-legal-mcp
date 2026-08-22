<div align="center">

<img src="icon.png" alt="German Legal MCP" width="128" height="128">

# German Legal MCP Server

German &amp; EU legal research plus this institution's own published rules — legislation, case law, parliamentary materials, house documents

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) [![Node.js Version](https://img.shields.io/badge/node-%3E%3D25.0.0-brightgreen)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/) [![MCP](https://img.shields.io/badge/MCP-1.29-purple)](https://modelcontextprotocol.io/)

</div>

> **This is a fork**
>
> Forked from [metaneutrons/german-legal-mcp](https://github.com/metaneutrons/german-legal-mcp)
> to make the ten jPortal Länder portals usable at the level of a single norm.
> Nothing here is published to npm — `npx @metaneutrons/german-legal-mcp` still
> installs upstream. See [What this fork changes](#what-this-fork-changes) and
> [Running this fork](#running-this-fork).

> **Production status**
>
> Version 3.2.1 provides production-ready provider contracts, application
> components, MCP projections and public/private distributions. Case-law search
> pages through every source that supports one and reports each source's own hit
> total. Third-party portals remain external operational dependencies; scheduled
> live contracts detect availability or response-shape drift. Subscription
> sources require valid credentials, licences or institutional access.

A Model Context Protocol (MCP) server for German and EU legal research,
providing unified access to legislation, case law and parliamentary materials —
and, in this fork, to the Berliner Hochschule für Technik's own published
administrative rules alongside them.

The provider layer is also available as typed application components. Consumers
do not need to run MCP or parse tool output — they can consume normalized
federal and Länder case law directly:

```ts
import {
  CaseLawClient,
} from '@metaneutrons/german-legal-mcp/components/case-law';

const client = new CaseLawClient();
const page = await client.search({
  query: 'DSGVO Schadensersatz',
  resourceTypes: ['case-law'],
  jurisdictions: ['DE', 'DE-NW'],
  limit: 25,
});
```

Legislation uses the same application-facing model:

```ts
import {
  LegislationClient,
} from '@metaneutrons/german-legal-mcp/components/legislation';

const legislation = new LegislationClient();
const laws = await legislation.search({
  query: 'Datenschutzgesetz',
  resourceTypes: ['legislation'],
  jurisdictions: ['DE-NW'],
});
```

Shared provenance, rights, search and document types are exported from
`@metaneutrons/german-legal-mcp/contracts`. Every provider has a component entry
and a structured data client. The MCP tools use those same clients; MCP output
is only a presentation layer over the application contract.

Results are discriminated unions; narrow on `resourceType` before using
type-specific fields. House documents carry two fields no legal portal has —
how much weight the rule carries, and whether this rendering of it is the
promulgated one:

```ts
import { component as haus } from '@metaneutrons/german-legal-mcp/components/haus';

const client = haus.createDataClient();
const results = await client.search({ query: 'Wahlordnung Fristen' });
for (const result of results.results) {
  if (result.resourceType !== 'administrative-guidance') continue;
  console.log(result.normativeForce);            // 'binding' | 'guidance' | …
  console.log(result.authority);                 // 'official' | 'reading-version'
  console.log(result.asOf, result.owner);        // Stand, and who maintains it
}
```

Optional portable capabilities cover tables of contents, corpus enumeration,
authentication and operational status. The German legislation client reports a
native TOC where the source supplies one and derives it from the document
otherwise. RII is case-law-only and does not advertise a TOC capability. The
house client implements corpus enumeration natively, because its `since` bound
is a predicate on an indexed column rather than a filter applied after the
fact.

## Supported Sources

| Source | Status | Prefix | Authentication |
|--------|--------|--------|----------------|
| Bundes- & Landesrecht | ✅ Available | `legis:` | None (public) |
| [Rechtsprechung im Internet](https://www.rechtsprechung-im-internet.de) | ✅ Available | `rii:` | None (public) |
| [InfoCuria (CJEU)](https://infocuria.curia.europa.eu) | ✅ Available | `icu:` | None (public) |
| [EUR-Lex](https://eur-lex.europa.eu) | ✅ Available | `eul:` | None (public) |
| [DIP Bundestag](https://dip.bundestag.de) | ✅ Available | `dip:` | Public key included |
| [Verwaltungsvorschriften des Bundes](https://www.verwaltungsvorschriften-im-internet.de) | ✅ Available | `vwv:` | None (public) |
| BHT house documents (local index) | 🚧 In development | `haus:` | None (local SQLite index) |

### BHT sources behind `haus:`

This fork is cut for the Berliner Hochschule für Technik and indexes the
institution's own published documents. Two corpora feed one index, and which
one a hit comes from decides how much weight it carries.

| Corpus | `sourceId` | What it holds | Standing |
|---|---|---|---|
| [OPUS 4 publication server](https://opus4.kobv.de/opus4-bht/) — *Amtliche Mitteilungen* | `opus4-bht` | Grundordnung, Geschäfts- and Wahlordnungen, Zugangs- and Prüfungsordnungen, Richtlinien; 118 records under doctype `other` | **Promulgated text.** Governs. Not consolidated — amendments are separate documents |
| [www.bht-berlin.de](https://www.bht-berlin.de/ordnungen) reading versions | `bht-web` | Consolidated §-by-§ renderings of individual Ordnungen, e.g. the [Geschäftsordnung des Akademischen Senats](https://www.bht-berlin.de/589) | **Reading version.** Usable, explicitly *nichtamtlich*; the gazette governs on conflict |

Every result states which it is. A reading version additionally carries a
pointer to the promulgated text where that mapping is known.

**How the OPUS metadata is used.** The frontdoor pages declare the fields this
provider needs, so almost nothing is inferred: the *Series* gives the document
type and is the sole basis for binding force — a document carries "Amtliche
Mitteilungen" because the Gremienreferat promulgated it there, and that act is
what binds; *Contributor(s)* gives the responsible Referat; *Decision date*
gives the Stand as the Beschlussdatum rather than the upload date, which differ
by weeks to months; *Licence* gives a real SPDX identifier (CC BY-NC-ND 4.0)
where a plain web crawl would have to record `NOASSERTION`.

**Finding the reading versions.** Nothing on the website lists them — the page
that looks like an index links promulgated PDFs instead. `sitemap.xml` does list
them, along with all 1.272 German pages, so discovery is one request plus a
polite pass over the candidates rather than a crawl:

```bash
npm run build && node scripts/haus-discover.mjs --out lesefassungen.md
```

It honours `robots.txt`, keeps pages that carry three or more `§` headings, and
produces a review sheet rather than ingesting — the responsible office and the
authoritative counterpart are not on these pages and have to be supplied by a
person. Note that the sitemap's `lastmod` is unusable as a change signal: `/589`
reports 2015-10-28 for a page stating "in der Fassung vom 16.07.2026".

**Proposing the links nobody wrote down.** Neither source states which gazette
record a reading version consolidates, nor which base rule an amendment changes
when the two name it differently. `node scripts/haus-propose-links.mjs` scores
the candidates and writes a review sheet; it applies nothing, because a wrong
correspondence is a fabricated citation.

**Access, as measured.** OAI-PMH (`/oai`) and the OPUS export module both answer
`401`, there is no REST API, and the RSS feed caps at 25 items. The Solr result
pages do page cleanly (`rows/100/start/N`) to all 118 records, so ingest goes
over HTML for now. If OAI-PMH is opened, only the fetch layer changes — the
metadata mapping is unaffected, and incremental harvesting via `from=` becomes
available.

## Features

### Bundes- & Landesrecht (`legis:*` tools)

- **Federal and state legislation** — BUND (all federal laws) + 16 Länder (all states)
- **No authentication** — free public access; the client defines no explicit request limit
- **Unified interface** — one set of tools for all jurisdictions
- **Full text search** — search across state legislation (Länder only)
- **Resilient input** — BUND accepts "§ 823", "823", "Art. 1", "Paragraph 51"
- **Pandoc-compatible Markdown** — clean conversion with Turndown
- **Save to file** — `save_path` parameter to avoid context pollution
- **Available states:** BUND, BB, BW, BY, BE, HB, HE, HH, MV, NI, NW, RP, SL, SN, ST, SH, TH

### Rechtsprechung im Internet (`rii:*` tools)

- **Federal court decisions** — BVerfG, BGH, BVerwG, BFH, BAG, BSG, BPatG (from 2010)
- **Bavarian state courts** — AG, LG, OLG, VG, VGH, FG, ArbG, LAG, BayVerfGH via gesetze-bayern.de
- **NRW state courts** — decisions from the official NRWE database via `source: "NW"`
- **Lower Saxony state courts** — decisions from NI-VORIS via `source: "NI"`
- **Brandenburg state courts** — decisions from the official Brandenburg decision database via `source: "BB"`
- **Bremen state courts** — official Bremen VG archive via `source: "HB"`; the Bremen index links separate OLG/OVG/VG/LAG portals, so coverage is explicitly partial until those portals expose a common search interface
- **Saxony state courts** — ESAMOSplus WebForms search for the OLG Dresden archive via `source: "SN"`
- **jPortal state courts** — Baden-Württemberg, Berlin, Hamburg, Hessen, Mecklenburg-Vorpommern, Rheinland-Pfalz, Saarland, Sachsen-Anhalt, Schleswig-Holstein and Thüringen via their official jPortal portals
- **Shared DecisionAdapter contract** — all new state sources normalize IDs, court, date, file number, ECLI, snippets and Markdown retrieval behind the same `rii:*` tools
- **Cross-portal search** — `source: "ALL"` searches every configured decision portal in parallel, deduplicates overlapping decisions, ranks the consolidated result list and reports unavailable portals
- **No authentication** — free public access
- **Full text search** — search across all federal court decisions
- **Kurztext/Langtext** — summary or full text via `part` parameter
- **Randnummern** — formatted as `[Rn. 5]{.rn}` (pandoc spans)
- **Save to file** — `save_path` parameter to avoid context pollution

### InfoCuria — CJEU (`icu:*` tools)

- **EU Court of Justice case law** — judgments, opinions, orders from CJEU and General Court
- **No authentication** — free public access via InfoCuria API
- **Multilingual** — documents available in all EU languages (default: DE)
- **Flexible case lookup** — accepts case numbers (C-476/17), CELEX numbers, or internal IDs
- **Randnummern** — formatted as `[Rn. 5]{.rn}`
- **Partial content** — `section` parameter for Rn ranges, headings, or line ranges
- **Save to file** — `save_path` parameter to avoid context pollution

### EUR-Lex (`eul:*` tools)

- **EU legislation** — directives, regulations, decisions, treaties (TFEU, TEU)
- **No authentication** — free public access via Cellar REST API and SPARQL
- **Multilingual** — documents available in all EU languages (default: DE)
- **CELEX lookup** — retrieve by CELEX number (e.g., "32016R0679" for GDPR)
- **SPARQL search** — search by title keywords, filter by resource type
- **Partial content** — `section` parameter for articles (Art. 5), headings, or line ranges
- **Save to file** — `save_path` parameter to avoid context pollution

### DIP Bundestag (`dip:*` tools)

- **Parliamentary documents** — Bundestagsdrucksachen (Gesetzentwürfe, Beschlussempfehlungen, Anfragen)
- **Legislative processes** — Vorgänge with status tracking and linked documents
- **Debate transcripts** — full text search across Plenarprotokolle (BT and BR)
- **Full text retrieval** — extracted text including Gesetzesbegründungen, with section support
- **Public API key included** — works out of the box (key valid until end of May 2027, override via env var)
- **Save to file** — `save_path` parameter to avoid context pollution

## Install in Claude Desktop (one-click bundle)

The easiest way to use this server in [Claude Desktop](https://claude.ai/download) is the packaged **MCP Bundle (`.mcpb`)** — no Node.js, no `npx`, no config file.

1. Download **[`german-legal-mcp.mcpb`](https://github.com/metaneutrons/german-legal-mcp/releases/latest/download/german-legal-mcp.mcpb)** from the [latest release](https://github.com/metaneutrons/german-legal-mcp/releases/latest).
2. In Claude Desktop open **Settings → Extensions** and drag the `.mcpb` onto the window (or use **Install…**).
3. Optionally set the DIP key in the extension's settings — everything else works out of the box.

The bundle ships the public, no-authentication sources and is cross-platform (macOS and Windows, Apple Silicon and Intel) — Claude Desktop supplies the Node.js runtime, so a single download works everywhere.

## What this fork changes

Upstream returned a usable search and an unusable id for the ten jPortal
Länder (BW, BE, HH, HE, MV, RP, SL, SH, ST, TH). Every hit — including a hit on
a single § — was rewritten to the root document of its law before leaving the
adapter, so a search for `§ 110 BerlHG` and a search for `BerlHG` produced the
same id, and that id resolves to the framing document: Fundstelle,
Gliederungs-Nr, permalinks, no legal text. `legis:toc` reported zero entries for
every jPortal law. The norm text was in the portal all along, under the docId
the adapter discarded.

| Change | Effect |
|---|---|
| Keep the portal's docId | `legis:search "§ 110 BerlHG"` returns the norm's own id, and `legis:get` on it returns the section text |
| Read `docPart` | R3 marks the fassung in force `S` and superseded ones `s`; the in-force text is listed and the rest counted, instead of whichever came first |
| `toc()` for jPortal | Reads the law's "Nichtamtliches Inhaltsverzeichnis"; the BerlHG yields 190 entries, each carrying a `legis:get` id |
| Law-level `get` | Masthead, the law's "letzte berücksichtigte Änderung" line and its section list — 16.614 characters where the framing document gave 2.598 |
| Full-law cache | One hour per state and law, on the adapter instance; a `get` followed by a `toc` drops from two 673 KB fetches to one |
| Actionable id errors | A malformed docId raises a ValidationError naming the id, instead of "Network request failed — check your internet connection" |
| Decision permalinks | `rii:get_decision` closes with `**Source:**`, as `legis:get` always has |

Deliberately not changed: a law-level id still does not return the law's full
text — the federal adapter answers a bare slug with masthead plus sections for
the same reason, and `docPart X` is 673 KB for the BerlHG. A docId that is
well-formed but unknown still raises a transport error, because the portal
reports it identically to its own outages.

Verified against gesetze.berlin.de, gesetze-im-internet.de and
rechtsprechung-im-internet.de. `lint`, `typecheck`, `typecheck:live`, `build`,
`test:package` and `test:smoke` clean; 426 tests pass.

## Running this fork

Build from source and point your MCP client at the build:

```bash
git clone https://github.com/jw-mcp-debug/german-legal-mcp.git
cd german-legal-mcp
npm install && npm run build
```

```json
{
  "mcpServers": {
    "german-legal": {
      "command": "node",
      "args": ["/absolute/path/to/german-legal-mcp/dist/index.js"]
    }
  }
}
```

Note that `npm run build` starts with `rm -rf dist`, so the entry point is
briefly absent while a build runs. Upstream releases no longer arrive on their
own; pull and rebuild to pick them up.

## Remote deployment (HTTP)

The server speaks stdio by default. `GLMCP_HTTP=true` switches it to the MCP
Streamable HTTP transport: `POST /mcp` for MCP itself, and an unauthenticated
`GET /healthz` for a platform health check. Every request to `/mcp` must carry
`Authorization: Bearer $GLMCP_HTTP_TOKEN`; without that variable the server
refuses to start rather than exposing an open endpoint. HTTP mode is never
inferred from `PORT` alone — CI runners set that routinely, and a server that
silently stopped speaking stdio would be hard to diagnose.

Sessions are stateless, one transport per request, while the provider registry
and its caches are shared across them.

```bash
GLMCP_HTTP=true GLMCP_HTTP_TOKEN=secret node dist/index.js

curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer secret' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

[`render.yaml`](render.yaml) deploys this as a Render web service — Frankfurt,
free plan, `GLMCP_HTTP_TOKEN` generated by Render so it never enters git. It
must be deployed as a **Blueprint** (New → Blueprint), not by pointing an
existing service at the repository: a service created any other way keeps its
own build command, and this one needs `npm ci --include=dev` because Render
sets `NODE_ENV=production`, under which npm omits the devDependency that
provides `tsc`. Be
clear about what such a deployment is: a remote-control surface for everything
the server can reach, including Länder portals whose robots.txt asks automated
agents to stay away. Keep the token secret, and prefer a private service for
anything longer than a test.

## Quick Start with npx

This installs the upstream package, not this fork — see
[Running this fork](#running-this-fork) for the fork.

```bash
npx @metaneutrons/german-legal-mcp
```

or add your MCP client config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "german-legal": {
      "command": "npx",
      "args": ["-y", "@metaneutrons/german-legal-mcp"]
    }
  }
}
```

## Environment Variables

### Provider Enablement

| Variable | Default | Description |
|----------|---------|-------------|
| `GLMCP_STATE_DIR` | Platform default | Root directory for logs, sessions, caches, metrics, daemon sockets and locks. |
| `GLMCP_LOG_LEVEL` | `info` | Structured log level. |
| `GLMCP_HTTP` | `false` | Serve MCP over Streamable HTTP instead of stdio. |
| `GLMCP_HTTP_TOKEN` | — | Bearer token required on every HTTP request; mandatory when `GLMCP_HTTP` is true. |
| `GLMCP_HTTP_PORT` | `3000` | HTTP listen port, used when the platform sets no `PORT`. |
| `GLMCP_LEGIS_ENABLED` | `true` | Bundes- & Landesrecht |
| `GLMCP_RII_ENABLED` | `true` | Rechtsprechung im Internet |
| `GLMCP_VWV_ENABLED` | `true` | Verwaltungsvorschriften des Bundes |
| `GLMCP_ICU_ENABLED` | `true` | InfoCuria (CJEU) |
| `GLMCP_EUL_ENABLED` | `true` | EUR-Lex |
| `GLMCP_DIP_ENABLED` | `true` | DIP Bundestag (auto-disabled after 2027-06-01 without own key) |
| `GLMCP_DIP_API_KEY` | Public key | Override the bundled public API key |
| `GLMCP_HAUS_ENABLED` | `false` | House documents. Off unless an index has been built. |
| `GLMCP_HAUS_INDEX` | `<state dir>/haus/index.db` | Path to the house-document SQLite index. |
| `GLMCP_HAUS_STALE_MONTHS` | `24` | Age in months beyond which a document's stated Stand is flagged for review. |

## Tools

### Bundes- & Landesrecht

| Tool | Description |
|------|-------------|
| `legis:search` | Search state legislation. Parameter: `query`, `state` (e.g., "BW", "BE"), `limit`. Länder search uses official portal/catalogue data with local normalization and reranking so common abbreviations and title queries (e.g. `VwVfG NRW`, `BbgVwVfG`, `BremVwVfG`) resolve to the root law before section hits. Note: BUND does not support search. |
| `legis:get` | Retrieve a specific law/norm. BUND: `id` = "law/section" (e.g., "bgb/823"). Länder: `id` from search results. Optional `save_path`. |
| `legis:toc` | Compact table of contents for a law — section numbers and headings. Supports `from`/`to` range and `depth` filter. BUND: `id` = law abbreviation (e.g., "bgb"). |
| `legis:states` | List available jurisdictions with implementation status. |

### Rechtsprechung im Internet

| Tool | Description |
|------|-------------|
| `rii:search` | Search for court decisions. `source` supports `BUND`, `BY`, `NW`, `NI`, `BB`, `HB`, `SN`, the jPortal state codes `BW`, `BE`, `HH`, `MV`, `RP`, `SL`, `ST`, `SH`, `TH`, `HE`, or `ALL` for a parallel cross-portal search. Note `BUND` is federal-only — state Arbeits-, Verwaltungs- and Oberlandesgerichte live in the state sources, so `ALL` is the right choice for a topic survey. With `ALL`, result slots are shared across the portals that matched and each portal's own hit total is reported. `page` pages every portal at once (BUND, HB and SN expose only their first page and say so); `collapse_duplicates` folds mass-litigation runs, naming what it folded. |
| `rii:get_decision` | Retrieve full text by doc ID. `part`: K (Kurztext) or L (Langtext, default) for BUND; optional `save_path` is supported for every source. For NRW, use the URL returned by `rii:search`; for jPortal, use its `doc_id`. |

### InfoCuria — CJEU

| Tool | Description |
|------|-------------|
| `icu:search` | Search CJEU decisions and opinions. Returns case numbers, ECLI, dates, and document IDs. |
| `icu:get_document` | Retrieve full text by case number (C-476/17) or CELEX number. Supports `section` (Rn ranges, headings, line ranges) and `save_path`. |

### EUR-Lex

| Tool | Description |
|------|-------------|
| `eul:search` | Search EU legislation via SPARQL. Filter by type (directive, regulation, decision, treaty). |
| `eul:get_document` | Retrieve EU legislation by CELEX number (e.g., "32016R0679" for GDPR). Supports `section` (Art. 5, Artikel 5-10, headings, line ranges) and `save_path`. |

### DIP Bundestag

| Tool | Description |
|------|-------------|
| `dip:search` | Search Bundestagsdrucksachen by title. Filter by type (Gesetzentwurf, Anfrage, etc.), Wahlperiode, date range. |
| `dip:get` | Retrieve full text of a Drucksache by Dokumentnummer (e.g., "19/27426"). Supports `section` and `save_path`. |
| `dip:search_vorgang` | Search legislative processes (Vorgänge) with status and linked Drucksachen. |
| `dip:search_plenarprotokoll` | Full text search across parliamentary debate transcripts (BT and BR). |

### Verwaltungsvorschriften des Bundes (`vwv:*` tools)

| Tool | Description |
|------|-------------|
| `vwv:search` | Search the federal ministries' administrative regulations, by full text or by title. |
| `vwv:get` | Retrieve a regulation by document id; names the parent regulation where the document is an annex. |
| `vwv:issuers` | List the ministries covered, with the number of regulations each has. |

Administrative regulations bind the administration rather than citizens, and
carry the operational detail statutes leave open — notably the
Nebenbestimmungen governing public grants (ANBest-P, ANBest-I, BNBest), which
decide how third-party funding may be spent and accounted for. The portal
offers no API and its search returns document ids without titles, so titles are
supplied from a per-ministry listing index built once and cached for 30 days.

### House documents (`haus:*` tools)

| Tool | Description |
|------|-------------|
| `haus:search` | BM25 full-text search over the local index of this institution's published administrative documents. Filter by `source`, type, office or binding force; excludes superseded and expired documents by default. |
| `haus:get` | Retrieve one document by id or source URL, preceded by a binding-force and Stand banner. |
| `haus:coverage` | Report what the index contains, per document type and responsible office. |
| `haus:history` | Show how a rule has changed: the amendments and repeals referencing it, or — for an amendment — the rule it changes, including when that rule is not indexed. |
| `haus:legal_basis` | List the statutory and internal references a rule makes, grouped by where each is resolved — `legis:` for statutes, this index for other house rules. |
| `haus:stale` | List valid documents whose stated Stand is older than the cut-off, or that state none. |

The `haus:` provider answers *how this institution proceeds*, never *what the
law is* — its documents are Handreichungen, FAQs, Merkblätter, Prozess­beschreibungen
and published Beschlüsse, and every result states its binding force and Stand.
It reads a local SQLite (FTS5) index built by a separate ingest step; nothing is
fetched at query time and nothing leaves the machine. Each record carries the
corpus it came from and whether it is the promulgated text. The same rule
routinely exists twice: promulgated in the official gazette (Amtliche
Mitteilungen, harvested from the institution's OPUS 4 server, unconsolidated —
amendments are published as separate documents), and again as a consolidated
reading version on a web page, which is what a person can actually read but is
explicitly *nichtamtlich*. Both are indexed, both are marked, and a reading
version always carries a pointer back to the text that governs. Confidential and personal
material is refused at ingest rather than filtered at query time, so it is never
written to the index at all.

### TODO: authoritative retrieval

`haus:` retrieves relevantly; retrieving *authoritatively* is a further step,
and for a corpus of institutional rules the difference is where the wrong
answers live. The open work — amendment consolidation, ranking on standing
rather than term frequency, resolving `§ … BerlHG` citations through the
`legis:` provider — is tracked in
**[docs/AUTHORITATIVE-RETRIEVAL.md](docs/AUTHORITATIVE-RETRIEVAL.md)**.

The largest single gap: the gazette publishes amendments as standalone
documents, so an unconsolidated index can answer a question about a
Geschäftsordnung with the text of a change list. Amendments are detected today
but not yet linked to the rule they amend.

### Token-Efficient Document Retrieval

Retrieval behavior is explicit and provider-specific:

1. **Outline-first** — Nautos returns metadata and a table of contents before
   sections or full-file output are requested.
2. **Focused reads** — tools that advertise `section` accept the selectors
   documented in their tool description, such as Randnummer, heading, line or
   article ranges. Selector formats are not assumed across every provider.
3. **File output** — every tool that advertises `save_path` requires an
   absolute path. If that tool also supports `section`, it writes the requested
   section rather than the complete document.

Other retrieval tools return their documented direct response; for example,
arXiv returns metadata and the abstract by default. They are not implicitly
converted to the outline-first flow.

### Markdown Output

Documents are converted to pandoc-compatible Markdown:

- Randnummern: `[Rn. 5]{.rn}` (bracketed spans)
- Footnotes: `^[inline footnote text]` (pandoc inline footnotes)

## Development

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run verify        # Complete deterministic release gate
```

### Live provider contracts

The default suite never uses the network. Opt-in live contracts validate the
current upstream response through the same normalized data clients consumed by
applications:

```bash
npm run test:live:public
```

This runs search → normalized reference → document for the public providers and
for every configured German case-law and legislation source. TOC-capable
legislation sources are checked as well. Gesetze im Internet is the documented
exception: it has no search API, so the live contract retrieves `bgb/823`
directly and validates the BGB TOC separately.

Live output contains only source, document identifier, title, resource type and
content length. Full text is asserted in memory and is never written as a test
report or CI artifact.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced via Husky + commitlint.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

**Scopes:** `legis`, `rii`, `icu`, `eul`, `dip`, `vwv`, `haus`, `core`, `deps`, `config`

## Architecture

- **Manifest-driven providers** — startup, help, shutdown and public/private
  distribution use one checked provider manifest

- **Cheerio + Turndown** for HTML → pandoc Markdown conversion

- **Zod** for input validation
- **Axios** for HTTP requests (Legis, RII, InfoCuria, EUR-Lex, DIP); **node:sqlite** (FTS5) for the local house index
- **Structured JSON errors** — all providers return `BaseError.toJSON()` with `code`, `userMessage`, `recoveryHint`; Axios errors auto-wrapped; DNS failures fail fast
- **Conversion validation** — all HTML→Markdown providers validate output is non-empty; detects upstream layout changes early

- Tools namespaced by source (`legis:`, `rii:`, `icu:`, `eul:`, `dip:`, `vwv:`, `haus:`)

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
