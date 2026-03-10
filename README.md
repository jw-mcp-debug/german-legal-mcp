# German Legal MCP Server

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-1.26-purple)](https://modelcontextprotocol.io/)

> **⚠️ WARNING: Work in Progress**  
> This project is currently under active development and **not production-ready**. APIs may change without notice, and features may be incomplete or unstable. Use at your own risk.

A Model Context Protocol (MCP) server for German legal research, providing unified access to multiple legal databases.

## Supported Sources

| Source | Status | Prefix | Authentication |
|--------|--------|--------|----------------|
| Bundes- & Landesrecht | ✅ Available | `legis:` | None (public) |
| [Rechtsprechung im Internet](https://www.rechtsprechung-im-internet.de) | ✅ Available | `rii:` | None (public) |
| [InfoCuria (CJEU)](https://infocuria.curia.europa.eu) | ✅ Available | `icu:` | None (public) |
| [EUR-Lex](https://eur-lex.europa.eu) | ✅ Available | `eul:` | None (public) |
| [DIP Bundestag](https://dip.bundestag.de) | ✅ Available | `dip:` | Public key included |

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
- **Public API key included** — works out of the box (key expires 2026-06-01, override via env var)
- **Save to file** — `save_path` parameter to avoid context pollution

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
| `GLMCP_LEGIS_ENABLED` | `true` | Bundes- & Landesrecht |
| `GLMCP_RII_ENABLED` | `true` | Rechtsprechung im Internet |
| `GLMCP_ICU_ENABLED` | `true` | InfoCuria (CJEU) |
| `GLMCP_EUL_ENABLED` | `true` | EUR-Lex |
| `GLMCP_DIP_ENABLED` | `true` | DIP Bundestag (auto-disabled after 2026-06-01 without own key) |
| `GLMCP_DIP_API_KEY` | Public key | Override the bundled public API key |


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
| `rii:search` | Search for court decisions. Returns list with doc IDs, titles, and snippets. |
| `rii:get_decision` | Retrieve full text of a court decision by doc ID. `part`: K (Kurztext) or L (Langtext, default). Optional `save_path` to save to file. |

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

### Two-Phase Document Retrieval

All document tools use a two-phase approach to avoid flooding the LLM context:

1. **Outline** — first call returns title, metadata, table of contents, and a preview
2. **Section** — request specific parts by Randnummer, heading, or line range (served from cache)
3. **Save to file** — write full document to disk, return metadata only

Section formats: `"Rn 5"`, `"Rn 5-12"`, `"lines:100-200"`, or any heading text (fuzzy match).

### Markdown Output

Documents are converted to pandoc-compatible Markdown:

- Randnummern: `[Rn. 5]{.rn}` (bracketed spans)
- Footnotes: `[^1]` references with `[^1]: text` definitions

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

**Scopes:** `legis`, `rii`, `icu`, `eul`, `dip`, `core`, `deps`, `config`

## Architecture

- **Dynamic provider loading** — providers auto-discovered from `src/providers/*/`
- **Cheerio + Turndown** for HTML → pandoc Markdown conversion
- **Zod** for input validation
- **Axios** for HTTP requests (Legis, RII, InfoCuria, EUR-Lex, DIP)
- Tools namespaced by source (`legis:`, `rii:`, `icu:`, `eul:`, `dip:`)

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
