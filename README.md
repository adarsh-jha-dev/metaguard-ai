# MetaGuard AI

**AI-powered data governance copilot that watches, warns, and auto-fixes metadata issues — built on OpenMetadata.**

> Built for the [WeMakeDevs × OpenMetadata "Back to the Metadata" Hackathon](https://www.wemakedevs.org/hackathons/openmetadata)

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![OpenMetadata](https://img.shields.io/badge/OpenMetadata-1.12-teal)
![Gemini](https://img.shields.io/badge/Gemini_AI-2.5_Flash-orange?logo=google)

---

## The Problem

Most data teams manage hundreds of tables where **60%+ have no descriptions**, **40% have no owners**, and **nobody knows which columns contain PII**. This metadata debt grows silently — until a compliance audit or a broken dashboard forces an expensive fire drill.

The work of maintaining metadata is repetitive, boring, and easy to skip. MetaGuard AI automates the boring parts.

## Two ways to use it

**Bring your own database.** Paste a PostgreSQL or MySQL connection string and MetaGuard analyses your real schema on the spot — no signup, no account, nothing stored. Works with Supabase, Neon, Railway, PlanetScale, RDS, Aiven, or anything else reachable over the public internet. See [Connect your own database](#connect-your-own-database).

**Or run it on OpenMetadata.** Point it at an OpenMetadata instance and it works across the full catalog — tables, dashboards, pipelines, glossaries, test suites and activity feeds — writing tags back through the API.

Every page falls back to a built-in sample catalog, so the deployed demo is explorable without connecting anything.

## What MetaGuard Does

### 1. PII Auto-Scanner
An AI agent scans column names, types, and descriptions to classify each column as **PII Sensitive**, **PII Non-Sensitive**, or **Not PII**. Approve classifications with one click — the tag is written directly back to OpenMetadata via PATCH API.

### 2. Governance Health Dashboard
A real-time governance score (0–100) computed from description coverage, column tag coverage, and table-level tag coverage — plus a full catalog overview showing counts across tables, dashboards, pipelines, topics, and ML models. Quick-action cards link directly to each governance tool.

### 3. Data Quality Center
Live test suite health pulled from OpenMetadata's test framework. See pass/fail rates across all suites, drill into individual results, and trigger **AI failure analysis** — Gemini explains the likely root cause and suggests a fix for every failing test, ranked by severity.

### 4. Lineage Explorer
Pick any entity (table, dashboard, pipeline, topic) and explore its full upstream/downstream dependency graph. The visual flow shows exactly where data comes from and what depends on it, down to 3 hops in each direction.

### 5. Glossary AI Manager
Browse all business glossaries and their terms from OpenMetadata. Select any table and Gemini AI analyses its columns to suggest the most relevant glossary terms to link — then apply them with a single click.

### 6. Activity Feed
Real-time conversations, tasks, and announcements from your OpenMetadata instance. Click **Summarize Activity** to get an AI-generated prose overview of recent governance-relevant changes.

### 7. Natural Language Metadata Chat
Ask questions about your data in plain English:
- *"Which tables have PII columns?"*
- *"Show me all columns in the customers table"*
- *"What happens if I drop the customers table?"*

The AI agent queries OpenMetadata's APIs (tables, lineage, search, tags) and returns structured, markdown-formatted answers.

## Connect your own database

The deployed instance is useful to a stranger only if they can point it at their own data. So the connect flow is built around a constraint: **there is no authentication system, and no credential is ever stored anywhere.**

### How that works

| Concern | How it is handled |
|---|---|
| **Storage** | There is no user database. Credentials arrive in one request body, open one connection, and are discarded when the request returns. Nothing is written to disk, logged, or cached. |
| **Browser** | Credentials live in `sessionStorage` — scoped to one tab, wiped when it closes. Not `localStorage`, which would survive a browser restart. "Disconnect & forget" clears it immediately. |
| **Write access** | Every session opens with `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` (Postgres) / `SET SESSION TRANSACTION READ ONLY` (MySQL). `INSERT`, `UPDATE`, `DELETE` and DDL are rejected by the server, not merely avoided by the client. |
| **Raw SQL** | The API never accepts SQL from the browser. Table and schema names arrive as *bound parameters* to a catalog query; the identifiers interpolated into profiling SQL come back from the database's own catalog. |
| **Row data** | Profiling issues aggregate queries only — `COUNT`, `COUNT(DISTINCT …)`, and `SUM(CASE WHEN <col> ~ '<regex>' …)`. No cell value is ever selected, returned to the browser, or sent to the AI model. Gemini sees column *names*, types and comments — never values. |
| **SSRF** | The server refuses to dial any host resolving to a loopback, RFC1918, link-local (including `169.254.169.254`), or CGNAT address. Hostnames are resolved first and the vetted IP is dialled directly, which also closes the DNS-rebinding window. Set `ALLOW_PRIVATE_DB_HOSTS=true` to allow localhost in development. |
| **Abuse** | Per-IP rate limiting (30 requests/minute) on `/api/connect/*`, since those routes open outbound connections on a caller's behalf. In-process state, so on serverless it raises the cost of abuse rather than eliminating it. |
| **Caching** | All `/api/connect/*` responses are `Cache-Control: no-store` — they describe someone's private schema. |
| **Timeouts** | 10s connect, 20s statement, with the pool torn down in a `finally` block so nothing outlives a request. |

Use a read-only role if you have one: MetaGuard only ever needs `SELECT` and catalog access.

### What you get on a live database

A raw database has no tags, owners, or test suites to read — so each feature is re-derived from what a database *can* tell you:

- **PII Scanner** combines three independent signals: a name heuristic, Gemini's read of the schema, and **value evidence** — the share of sampled values matching an email / SSN / card / IBAN / IP pattern. Value evidence outranks the others, because it's the only signal that catches personal data in a column named `field_7` or `notes`. Results export as CSV, JSON, or — for Postgres — `COMMENT ON COLUMN` statements you can review and run yourself.
- **Governance score** is computed from table comments, column comments, primary key coverage, and declared relationships, with a ranked list of what's dragging it down.
- **Data Quality** profiles your tables and generates the completeness, uniqueness and cardinality checks you'd otherwise write by hand. Foreign-key columns are exempt from uniqueness checks.
- **Lineage** is built from foreign keys: what a table depends on, and what breaks if you drop it.
- **Chat** answers questions against your real schema, structure only.

Glossary and Activity remain OpenMetadata-only; those pages say so when a database is connected.

### Supported engines

PostgreSQL 12+ and MySQL 5.7+ / 8+ / MariaDB, over TLS by default (with `prefer` and `disable` modes, and an option to allow self-signed certificates).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MetaGuard AI                            │
│                     Next.js + TypeScript                        │
├───────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│   PII     │  Govern- │ Quality  │ Lineage  │ Glossary │Activity │
│ Scanner   │  ance    │ Center   │ Explorer │   AI     │  Feed   │
│           │ Dashboard│          │          │ Manager  │         │
├───────────┴──────────┴──────────┴──────────┴──────────┴─────────┤
│                     Gemini 2.5 Flash API                        │
│    Classification · Failure Analysis · Term Suggestions ·       │
│                  Activity Summaries · Chat                      │
├─────────────────────────────────────────────────────────────────┤
│                  OpenMetadata REST API v1                        │
│  /tables  /testSuites  /testCases  /glossaries  /glossaryTerms  │
│  /lineage  /feed  /dashboards  /pipelines  /topics  /mlmodels   │
│  /search  /tags  /classifications  /containers                  │
├─────────────────────────────────────────────────────────────────┤
│              OpenMetadata Server (Docker)                       │
│         MySQL · Elasticsearch · Airflow                         │
└─────────────────────────────────────────────────────────────────┘
```

## OpenMetadata Integration Depth

MetaGuard integrates across 18+ OpenMetadata API surfaces:

| API Endpoint | Feature |
|---|---|
| `GET /tables` | PII Scanner, Dashboard, Governance score |
| `GET /tables/name/{fqn}` | Column-level detail for scanning & glossary suggest |
| `PATCH /tables/{id}` | Writes PII tags and glossary terms back to columns |
| `GET /lineage/{type}/name/{fqn}` | Lineage Explorer (tables, dashboards, pipelines, topics) |
| `GET /search/query` | Full-text search across all entity types |
| `GET /testSuites` | Data Quality Center — suite list + pass/fail aggregation |
| `GET /testCases` | Data Quality Center — per-test results and status |
| `GET /glossaries` | Glossary AI Manager — browse all glossaries |
| `GET /glossaryTerms` | Glossary AI Manager — browse & AI-suggest terms |
| `GET /feed` | Activity Feed — conversations, tasks, announcements |
| `GET /dashboards` | Catalog overview entity counts |
| `GET /pipelines` | Catalog overview entity counts |
| `GET /topics` | Catalog overview entity counts |
| `GET /mlmodels` | Catalog overview entity counts |
| `GET /containers` | Catalog overview entity counts |
| `GET /classifications` | Tag classification browser |
| `GET /tags` | Tag listing by classification |
| `PUT /services`, `/databases`, `/databaseSchemas`, `/tables` | Sample data seeding |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS + shadcn/ui |
| AI Model | Gemini 2.5 Flash |
| Metadata Platform | OpenMetadata 1.12 (optional) |
| Live databases | PostgreSQL (`pg`) · MySQL / MariaDB (`mysql2`) |
| Markdown | react-markdown + remark-gfm |
| Deployment | Docker (OpenMetadata) |

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Gemini API key** — free at [aistudio.google.com](https://aistudio.google.com). Optional: without it, PII classification falls back to name heuristics plus value evidence, and Chat is disabled.
- **Docker Desktop** with 6GB+ RAM — only if you want the OpenMetadata half. To analyse your own database, or to explore the sample catalog, you don't need it.

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/metaguard-ai.git
cd metaguard-ai
```

### 2. Start OpenMetadata *(optional)*

Skip this if you only want to connect your own database or explore the sample catalog.


```bash
cd openmetadata
docker compose up --detach
```

Wait 2–3 minutes for all services to be healthy. Open `http://localhost:8585` and log in with `admin@open-metadata.org` / `admin`.

Get your JWT token: **Settings → Bots → Ingestion Bot → copy the token**.

### 3. Set up the Next.js app

```bash
cd ../app
npm install
```

Create `.env.local` in the `app/` directory — every variable is optional:

```
GEMINI_API_KEY=your-gemini-api-key

# Only needed for the OpenMetadata half
OPENMETADATA_URL=http://localhost:8585/api/v1
OPENMETADATA_TOKEN=your-jwt-token-here

# Allows connecting to localhost / private-network databases.
# Leave this unset in any public deployment — it disables the SSRF guard.
ALLOW_PRIVATE_DB_HOSTS=true
```

### 4. Seed sample data

```bash
export TOKEN="your-jwt-token"

# Create service, database, schema
curl -X PUT "http://localhost:8585/api/v1/services/databaseServices" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"sample_data","serviceType":"CustomDatabase","connection":{"config":{"type":"CustomDatabase","sourcePythonClass":"sample_data"}}}'

curl -X PUT "http://localhost:8585/api/v1/databases" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ecommerce_db","service":"sample_data"}'

curl -X PUT "http://localhost:8585/api/v1/databaseSchemas" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"shopify","database":"sample_data.ecommerce_db"}'

# See /scripts/seed.sh for the full table seed script
```

### 5. Run the app

```bash
npm run dev
```

Open `http://localhost:3000` — the sidebar gives you access to all features.

## Project Structure

```
metaguard-ai/
├── app/
│   └── src/
│       ├── app/
│       │   ├── page.tsx              # Landing page
│       │   ├── layout-nav.tsx        # Sidebar navigation
│       │   ├── dashboard/            # Governance dashboard
│       │   ├── pii-scanner/          # PII auto-tagger
│       │   ├── quality/              # Data Quality Center
│       │   ├── lineage/              # Lineage Explorer
│       │   ├── glossary/             # Glossary AI Manager
│       │   ├── activity/             # Activity Feed
│       │   ├── chat/                 # NL metadata chat
│       │   ├── connect/              # Bring-your-own-database connect flow
│       │   └── api/
│       │       ├── tables/           # Tables listing
│       │       ├── scan/             # PII classification
│       │       ├── tag/              # Tag writing
│       │       ├── health/           # Governance score
│       │       ├── quality/          # Test suite aggregation
│       │       ├── quality/analyze/  # AI failure analysis
│       │       ├── glossary/         # Glossary fetch
│       │       ├── glossary/suggest/ # AI term suggestions
│       │       ├── lineage/          # Lineage graph
│       │       ├── activity/         # Activity feed + AI summary
│       │       ├── entities/         # Multi-entity counts
│       │       ├── chat/             # Chat agent
│       │       └── connect/          # Live-database routes (credentials never stored)
│       │           ├── test/         # Validate credentials, list schemas
│       │           ├── catalog/      # Schema introspection + governance score
│       │           ├── scan/         # PII scan with value profiling
│       │           ├── quality/      # Generated data quality checks
│       │           ├── lineage/      # Foreign-key lineage graph
│       │           └── chat/         # Q&A over the live schema
│       ├── components/ui/            # shadcn/ui components
│       └── lib/
│           ├── openmetadata.ts       # OpenMetadata API client
│           ├── gemini.ts             # Gemini AI utilities
│           ├── connection-context.tsx# sessionStorage-backed connection state
│           ├── report.ts             # CSV / JSON / COMMENT ON exports
│           └── db/
│               ├── connect.ts        # Read-only connections + SSRF guard
│               ├── introspect.ts     # Postgres + MySQL schema reading
│               ├── profile.ts        # Aggregate-only column profiling
│               ├── classify.ts       # Name + value + AI signal merging
│               ├── insights.ts       # Governance score, quality checks
│               └── rate-limit.ts     # Per-IP limiting on connect routes
├── openmetadata/
│   └── docker-compose.yml
└── README.md
```

## Demo Flow

1. **Connect** — Paste a Postgres/MySQL connection string → test → pick a schema. Credentials stay in the browser tab; nothing is stored server-side
2. **Dashboard** — Governance score with a ranked list of what's dragging it down. On OpenMetadata it also shows catalog counts across dashboards, pipelines, topics and ML models
3. **PII Scanner** — Select a table → name, value and AI signals combine → export CSV / JSON / `COMMENT ON` SQL. On OpenMetadata, approve a classification and the tag is written back through the API
4. **Data Quality** — On a live database, profile tables to generate completeness, uniqueness and cardinality checks. On OpenMetadata, read existing test suite pass rates. Either way, AI failure analysis explains the failures
5. **Lineage** — On a live database, the foreign-key dependency graph and what breaks if you drop a table. On OpenMetadata, the full upstream/downstream entity graph
6. **Glossary AI** — Select a table → Gemini suggests glossary terms per column → Link with one click
7. **Activity Feed** — View recent conversations and tasks → AI summarizes governance-relevant changes
8. **Chat** — Ask "Which tables have no primary key, and which columns look like personal data?" → answered against your live schema (structure only, never row data) or the OpenMetadata catalog

*Built for the WeMakeDevs × OpenMetadata "Back to the Metadata" Hackathon, April 2026.*
