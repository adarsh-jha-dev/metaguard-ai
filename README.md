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
A real-time governance score (0–100) computed from:
- **Description coverage** — % of tables with descriptions (×0.35)
- **Column tag coverage** — % of columns with tags (×0.35)
- **Table-level tag coverage** — % of tables with at least one tagged column (×0.30)

Includes visual progress bars, metric breakdowns, and status indicators.

### 3. Natural Language Metadata Chat
Ask questions about your data in plain English:
- *"Which tables have PII columns?"*
- *"Show me all columns in the customers table"*
- *"What happens if I drop the customers table?"*

The AI agent queries OpenMetadata's APIs (tables, lineage, search, tags) and returns structured, markdown-formatted answers.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  MetaGuard AI                   │
│              Next.js + TypeScript               │
├──────────┬──────────────┬───────────────────────┤
│   PII    │  Governance  │    NL Metadata        │
│ Scanner  │  Dashboard   │    Chat               │
├──────────┴──────────────┴───────────────────────┤
│              Gemini 2.5 Flash API               │
│         (Classification + Reasoning)            │
├─────────────────────────────────────────────────┤
│           OpenMetadata REST API v1              │
│  /tables  /tags  /lineage  /search  /schemas    │
├─────────────────────────────────────────────────┤
│         OpenMetadata Server (Docker)            │
│    MySQL · Elasticsearch · Airflow              │
└─────────────────────────────────────────────────┘
```

## OpenMetadata Integration Depth

MetaGuard integrates deeply across multiple OpenMetadata API surfaces:

| API Endpoint | How MetaGuard Uses It |
|---|---|
| `GET /tables` | Lists all tables with columns, tags for dashboard + scanner |
| `GET /tables/name/{fqn}` | Fetches column-level detail for PII classification |
| `PATCH /tables/{id}` | Writes PII tags back to columns after approval |
| `GET /lineage/table/name/{fqn}` | Retrieves upstream/downstream lineage for chat queries |
| `GET /search/query` | Full-text search across tables for the chat agent |
| `PUT /services/databaseServices` | Programmatic service creation |
| `PUT /databases` | Database entity creation |
| `PUT /databaseSchemas` | Schema entity creation |
| `PUT /tables` | Table + column creation with full schema |
| `PATCH /tables/name/{fqn}` | Adds descriptions to tables |
| `GET /tags` | Reads existing tag classifications |

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, API routes, TypeScript-first |
| Language | TypeScript | Type safety across frontend + backend |
| Styling | Tailwind CSS + shadcn/ui | Fast to build, consistent, professional |
| AI Model | Gemini 2.5 Flash (free tier) | 10 RPM free, structured output support |
| Metadata | OpenMetadata 1.12 | Hackathon requirement, deep API surface |
| Markdown | react-markdown + remark-gfm | Rich formatting in chat responses |
| Deployment | Docker (OpenMetadata) | Reproducible local setup |

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

Wait 2–3 minutes for all services to be healthy. Then open `http://localhost:8585` and log in with `admin@open-metadata.org` / `admin`.

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

Set your token as an env variable and create sample tables:

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

# Create tables (customers, orders, employees, products, payments)
# See /scripts/seed.sh for the full seed script
```

### 5. Run the app

```bash
npm run dev
```

Open `http://localhost:3000` and explore:
- **/** — Landing page with live stats
- **/pii-scanner** — Scan tables for PII
- **/dashboard** — Governance health score
- **/chat** — Ask metadata questions

## Project Structure

```
metaguard-ai/
├── app/                          # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Landing page
│   │   │   ├── layout.tsx        # Root layout
│   │   │   ├── layout-nav.tsx    # Sidebar navigation
│   │   │   ├── dashboard/        # Governance dashboard
│   │   │   ├── pii-scanner/      # PII auto-tagger
│   │   │   ├── chat/             # NL metadata chat
│   │   │   └── api/
│   │   │       ├── tables/       # Tables listing endpoint
│   │   │       ├── scan/         # PII classification endpoint
│   │   │       ├── tag/          # Tag writing endpoint
│   │   │       ├── health/       # Governance score endpoint
│   │   │       └── chat/         # Chat agent endpoint
│   │   ├── components/ui/        # shadcn/ui components
│   │   └── lib/
│   │       ├── openmetadata.ts   # OpenMetadata API client
│   │       └── gemini.ts         # Gemini AI utility
│   ├── package.json
│   └── .env.local                # Environment variables (not committed)
├── openmetadata/
│   └── docker-compose.yml        # OpenMetadata Docker setup
├── .gitignore
└── README.md
```

## Demo Flow

1. **Landing page** — Show live governance score and table count
2. **PII Scanner** — Select a table → AI classifies all columns → Approve PII tags → Tags written to OpenMetadata
3. **Dashboard** — Governance score increases after tagging → Show metric breakdown
4. **Chat** — Ask "Which tables have PII but aren't fully tagged?" → AI queries OpenMetadata and answers with formatted tables

## What's Next

- [ ] Lineage anomaly detector — diff lineage snapshots to catch drift
- [ ] Per-team/domain drill-down on the dashboard
- [ ] Bulk scan all tables with progress tracking
- [ ] Historical score trends with charts
- [ ] OpenMetadata MCP server integration for deeper agent capabilities
- [ ] Slack/email alerts for governance score drops

*Built for the WeMakeDevs × OpenMetadata "Back to the Metadata" Hackathon, April 2026.*