# German Legal MCP Server

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D25.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.29-purple)](https://modelcontextprotocol.io/)

> **⚠️ WARNING: Work in Progress**  
> This project is currently under active development and **not production-ready**. APIs may change without notice, and features may be incomplete or unstable. Use at your own risk.

A Model Context Protocol (MCP) server for German legal research, providing unified access to multiple legal databases.

## Supported Sources

| Source | Status | Prefix | Authentication |
|--------|--------|--------|----------------|
| Bundes- & Landesrecht | ✅ Available | `legis:` | None (public) |
| [Rechtsprechung im Internet](https://www.rechtsprechung-im-internet.de) | ✅ Available | `rii:` | None (public) |
| [RIS Österreich](https://www.ris.bka.gv.at) | ✅ Available | `ris:` | None (public OGD API) |
| [InfoCuria (CJEU)](https://infocuria.curia.europa.eu) | ✅ Available | `icu:` | None (public) |
| [EUR-Lex](https://eur-lex.europa.eu) | ✅ Available | `eul:` | None (public) |
| [DIP Bundestag](https://dip.bundestag.de) | ✅ Available | `dip:` | Public key included |
| [arXiv](https://arxiv.org) | ✅ Available | `arxiv:` | None (public) |
| [nautos.de](https://nautos.de) | ✅ Available | `nautos:` | Required (IP or credentials) |

## Features

### Bundes- & Landesrecht (`legis:*` tools)

- **Federal and state legislation** — BUND (all federal laws) + 16 Länder (all states)
- **No authentication** — free public access, no rate limits
- **Unified interface** — one set of tools for all jurisdictions
- **Full text search** — search across state legislation (Länder only)
- **Resilient input** — BUND accepts "§ 823", "823", "Art. 1", "Paragraph 51"
- **Pandoc-compatible Markdown** — clean conversion with Turndown
- **Save to file** — `save_path` parameter to avoid context pollution
- **Available states:** BUND, BB, BW, BY, BE, HB, HE, HH, MV, NI, NW, RP, SL, SN, ST, SH, TH

### Rechtsprechung im Internet (`rii:*` tools)

- **Federal court decisions** — BVerfG, BGH, BVerwG, BFH, BAG, BSG, BPatG (from 2010)
- **Bavarian state courts** — AG, LG, OLG, VG, VGH, FG, ArbG, LAG, BayVerfGH via gesetze-bayern.de
- **No authentication** — free public access
- **Full text search** — search across all federal court decisions
- **Kurztext/Langtext** — summary or full text via `part` parameter
- **Randnummern** — formatted as `[Rn. 5]{.rn}` (pandoc spans)
- **Save to file** — `save_path` parameter to avoid context pollution

### RIS Österreich (`ris:*` tools)

- **Austrian federal, state & case law** — consolidated Bundesrecht and Landesrecht (all 9 Bundesländer, or filter to one via `bundesland`; results tagged with their Bundesland), plus Judikatur (OGH/OLG/LG via Justiz; VwGH, VfGH, BVwG and others via the `court` filter)
  - **Note:** `bundesland` on `application="landesrecht"` returns that state's **consolidated law** (LrKons). Case law is a separate application — for raw state judikatur use `application="judikatur"` with the appropriate `court` (e.g. `Lvwg` for a Landesverwaltungsgericht), not `bundesland`.
- **No authentication** — free public Open Government Data REST API (`data.bka.gv.at/ris/api/v2.6`)
- **Latest-first** — `sort="date"` for the newest decisions; Judikatur Rechtssätze link their full decision text (Entscheidungstext) for `ris:get`
- **Navigate & read statutes** — `ris:toc law="ABGB"` lists the §§ with headings; `ris:get_norm law="ABGB" paragraph="1295"` returns a single §
- **Surgical retrieval** — `ris:get section=…` returns only a Randnummer (`Rn 5`), an Rn range (`Rn 5-9`), a line range (`lines:1-40`), or a heading (`Spruch`) — all token-preserving
- **Pandoc-compatible Markdown** — Randnummern as `[Rn. 5]{.rn}` spans; document HTML converted with Cheerio + Turndown
- **Structured metadata** — Geschäftszahl, Entscheidungsdatum, ECLI, issuing court/organ
- **Save to file** — `save_path` parameter to avoid context pollution
- ⚠️ **Austrian** law — for German case law use `rii:*`, for German legislation use `legis:*`

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

### arXiv (`arxiv:*` tools)

- **Preprint search** — search by keywords, author, title, abstract, or category
- **Metadata + abstract** — default response without full text fetch (token-efficient)
- **HTML full text** — Markdown conversion for papers from ~2024+ (LaTeXML HTML)
- **PDF fallback** — older papers without HTML return abstract + PDF link
- **No authentication** — free public API, no rate limits beyond ~1 req/3s
- **Save to file** — `save_path` parameter to avoid context pollution

### nautos.de (`nautos:*` tools)

- **DIN/EN/ISO standards** — search and retrieve technical standards from nautos.de
- **Two-phase document retrieval** — outline (metadata + TOC) first, then sections on demand
- **Automatic authentication** — IP-based login (auto-detected), user-based login fallback
- **Structured TOC** — hierarchical table of contents with section IDs for navigation
- **File cache** — 30-day TTL, persistent across restarts (`~/.local/share/german-legal-mcp/cache/nautos/`)
- **Save to file** — `save_path` parameter to dump full document to disk

## Install in Claude Desktop (one-click bundle)

The easiest way to use this server in [Claude Desktop](https://claude.ai/download) is the packaged **MCP Bundle (`.mcpb`)** — no Node.js, no `npx`, no config file.

1. Download **[`german-legal-mcp.mcpb`](https://github.com/metaneutrons/german-legal-mcp/releases/latest/download/german-legal-mcp.mcpb)** from the [latest release](https://github.com/metaneutrons/german-legal-mcp/releases/latest).
2. In Claude Desktop open **Settings → Extensions** and drag the `.mcpb` onto the window (or use **Install…**).
3. Optionally set the DIP key or nautos credentials in the extension's settings — everything else works out of the box.

The bundle ships the public, no-authentication sources and is cross-platform (macOS and Windows, Apple Silicon and Intel) — Claude Desktop supplies the Node.js runtime, so a single download works everywhere.

## Quick Start with npx

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
| `GLMCP_LEGIS_ENABLED` | `true` | Bundes- & Landesrecht |
| `GLMCP_RII_ENABLED` | `true` | Rechtsprechung im Internet |
| `GLMCP_RIS_ENABLED` | `true` | RIS Austria (federal law + case law) |
| `GLMCP_ICU_ENABLED` | `true` | InfoCuria (CJEU) |
| `GLMCP_EUL_ENABLED` | `true` | EUR-Lex |
| `GLMCP_DIP_ENABLED` | `true` | DIP Bundestag (auto-disabled after 2027-06-01 without own key) |
| `GLMCP_DIP_API_KEY` | Public key | Override the bundled public API key |
| `GLMCP_ARXIV_ENABLED` | `true` | arXiv preprint search |
| `GLMCP_NAUTOS_ENABLED` | Auto | nautos.de. Auto-enabled with tenant key or credentials, auto-disabled without. |


### nautos.de Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GLMCP_NAUTOS_TENANT_KEY` | For IP-based | Tenant key (e.g., `DWW`). Enables IP-based authentication. |
| `GLMCP_NAUTOS_USERNAME` | For user-based | nautos.de account username |
| `GLMCP_NAUTOS_PASSWORD` | For user-based | nautos.de account password |
| `GLMCP_NAUTOS_TENANT_ID` | No | Tenant ID (auto-detected from login response) |

**Authentication**: IP-based login is tried first (requires `GLMCP_NAUTOS_TENANT_KEY`). If it fails and credentials are set, user-based login is attempted as fallback.


## Tools

### Bundes- & Landesrecht

| Tool | Description |
|------|-------------|
| `legis:search` | Search federal and state legislation. Parameter: `query`, `state` (e.g., "BW", "BE"), `limit`. Note: BUND does not support search. |
| `legis:get` | Retrieve a specific law/norm. BUND: `id` = "law/section" (e.g., "bgb/823"). Länder: `id` from search results. Optional `save_path`. |
| `legis:toc` | Compact table of contents for a law — section numbers and headings. Supports `from`/`to` range and `depth` filter. BUND: `id` = law abbreviation (e.g., "bgb"). |
| `legis:states` | List available jurisdictions with implementation status. |

### Rechtsprechung im Internet

| Tool | Description |
|------|-------------|
| `rii:search` | Search for court decisions. Returns list with doc IDs, titles, and snippets. Use `source: "BY"` for Bavarian state courts. |
| `rii:get_decision` | Retrieve full text of a court decision by doc ID. `part`: K (Kurztext) or L (Langtext, default). Optional `save_path` to save to file. Use `source: "BY"` for gesetze-bayern.de IDs. |

### RIS Österreich

| Tool | Description |
|------|-------------|
| `ris:search` | Search the Austrian RIS. `application`: "bundesrecht"/"landesrecht" (consolidated federal/state law) or "judikatur" (case law; set `court`: Justiz/Vwgh/Vfgh/Bvwg). `sort="date"` for the **latest** decisions. Landesrecht results are tagged with their Bundesland (filter to one state's consolidated law with `bundesland`). Judikatur hits are Rechtssätze that link their full decision text (Entscheidungstext) for `ris:get`. |
| `ris:get` | Retrieve a RIS document as Markdown by `content_url` (from search) or `id` + `applikation`. `section` returns only part — `Rn 5`, `Rn 5-9`, `lines:1-40`, or a heading like `Spruch` — for token-preserving reads. Optional `save_path`. |
| `ris:get_norm` | Retrieve a single **§** of a consolidated law — `law="ABGB" paragraph="1295"`. `application`: bundesrecht (federal) or landesrecht (+ `bundesland`). The token-preserving way to read one paragraph. |
| `ris:toc` | Table of contents (Inhaltsverzeichnis) of a consolidated law — its §§ with headings — to navigate before `ris:get_norm`. `law="ABGB"` (full title if an abbreviation fails). `application` + `bundesland` as above. |

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

### arXiv

| Tool | Description |
|------|-------------|
| `arxiv:search` | Search preprints by keywords, author, title, abstract, or category. Returns metadata + abstract. |
| `arxiv:get` | Retrieve paper by arXiv ID. Default: metadata + abstract. With `section` or `save_path`: HTML full text as Markdown (~2024+, older: PDF link). |

### nautos.de

| Tool | Description |
|------|-------------|
| `nautos:search` | Search DIN/EN/ISO standards by document number. Returns acCode, title, date, type. |
| `nautos:get_document` | Retrieve standard by acCode. Returns outline (metadata + TOC) by default; use `section` for specific parts, `save_path` to save full document. |

### Two-Phase Document Retrieval

All document tools use a two-phase approach to avoid flooding the LLM context:

1. **Outline** — first call returns title, metadata, table of contents, and a preview
2. **Section** — request specific parts by Randnummer, heading, or line range (served from cache)
3. **Save to file** — write full document to disk, return metadata only

Section formats: `"Rn 5"`, `"Rn 5-12"`, `"lines:100-200"`, or any heading text (fuzzy match).

### Markdown Output

Documents are converted to pandoc-compatible Markdown:

- Randnummern: `[Rn. 5]{.rn}` (bracketed spans)
- Footnotes: `^[inline footnote text]` (pandoc inline footnotes)

## Development

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Commit Convention

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) enforced via Husky + commitlint.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

**Scopes:** `legis`, `rii`, `ris`, `icu`, `eul`, `dip`, `nautos`, `core`, `deps`, `config`

## Architecture

- **Manifest-driven providers** — startup, help, shutdown and public/private
  distribution use one checked provider manifest

- **Cheerio + Turndown** for HTML → pandoc Markdown conversion

- **Zod** for input validation
- **Axios** for HTTP requests (Legis, RII, RIS, InfoCuria, EUR-Lex, DIP, arXiv, nautos)
- **Structured JSON errors** — all providers return `BaseError.toJSON()` with `code`, `userMessage`, `recoveryHint`; Axios errors auto-wrapped; DNS failures fail fast
- **Conversion validation** — all HTML→Markdown providers validate output is non-empty; detects upstream layout changes early

- Tools namespaced by source (`legis:`, `rii:`, `ris:`, `icu:`, `eul:`, `dip:`, `arxiv:`, `nautos:`)

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
