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
| Metadata Platform | OpenMetadata 1.12 |
| Markdown | react-markdown + remark-gfm |
| Deployment | Docker (OpenMetadata) |

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Docker Desktop** with 6GB+ RAM allocated
- **Gemini API key** — free at [aistudio.google.com](https://aistudio.google.com)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/metaguard-ai.git
cd metaguard-ai
```

### 2. Start OpenMetadata

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

Create `.env.local` in the `app/` directory:

```
OPENMETADATA_URL=http://localhost:8585/api/v1
OPENMETADATA_TOKEN=your-jwt-token-here
GEMINI_API_KEY=your-gemini-api-key
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
│       │       └── chat/             # Chat agent
│       ├── components/ui/            # shadcn/ui components
│       └── lib/
│           ├── openmetadata.ts       # OpenMetadata API client
│           └── gemini.ts             # Gemini AI utilities
├── openmetadata/
│   └── docker-compose.yml
└── README.md
```

## Demo Flow

1. **Dashboard** — Live governance score, catalog counts (tables, dashboards, pipelines, topics, ML models), and data quality summary
2. **PII Scanner** — Select a table → Gemini classifies columns → Approve → Tags written back to OpenMetadata
3. **Data Quality** — View test suite pass rates → Analyze failing tests → Get AI root-cause and fix suggestions
4. **Lineage Explorer** — Enter a table FQN → See full upstream/downstream graph
5. **Glossary AI** — Select a table → Gemini suggests glossary terms per column → Link with one click
6. **Activity Feed** — View recent conversations and tasks → AI summarizes governance-relevant changes
7. **Chat** — Ask "Which tables have PII but aren't fully tagged?" → AI queries OpenMetadata and answers

*Built for the WeMakeDevs × OpenMetadata "Back to the Metadata" Hackathon, April 2026.*
