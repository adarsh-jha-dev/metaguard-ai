import type { Client } from "./connect";

/**
 * An activity feed for a connected database.
 *
 * A raw database has no conversations or announcements, but it does record what
 * has been happening to it: rows written, tables vacuumed, indexes ignored,
 * tables created. Postgres keeps that in `pg_stat_user_tables`; MySQL exposes a
 * thinner version through `information_schema.TABLES`. Both are read-only
 * catalog views — no table contents are touched.
 */

export type ActivityEvent = {
  id: string;
  entityType: "table";
  /** Fully qualified name, kept so the UI can link a row back to a table. */
  entityName: string;
  displayName: string;
  /** Short label shown as a badge: "Writes", "Bloat", "Never analysed", … */
  type: string;
  severity: "info" | "warning";
  detail: string;
  /** Epoch ms, or null for counters that have no timestamp attached. */
  timestamp: number | null;
  metrics: { label: string; value: string }[];
};

export type ActivityReport = {
  events: ActivityEvent[];
  total: number;
  source: {
    kind: "pg_stat" | "information_schema";
    view: string;
    note: string;
  };
  /** When Postgres last reset its counters — without it the numbers mean nothing. */
  statsResetAt: number | null;
  totals: {
    tables: number;
    inserts: number;
    updates: number;
    deletes: number;
    liveRows: number;
    deadRows: number;
  };
  /** False when the stats views exist but this account cannot read them. */
  available: boolean;
  unavailableReason?: string;
};

const MAX_EVENTS = 60;

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const ts = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  // EXTRACT(EPOCH …) returns a fractional second count; epoch ms are whole.
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function bytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const PG_STATS_SQL = `
SELECT
  s.schemaname                                   AS schema_name,
  s.relname                                      AS table_name,
  s.n_tup_ins                                    AS inserts,
  s.n_tup_upd                                    AS updates,
  s.n_tup_del                                    AS deletes,
  s.n_live_tup                                   AS live_rows,
  s.n_dead_tup                                   AS dead_rows,
  s.seq_scan                                     AS seq_scans,
  COALESCE(s.idx_scan, 0)                        AS idx_scans,
  EXTRACT(EPOCH FROM s.last_vacuum) * 1000       AS last_vacuum,
  EXTRACT(EPOCH FROM s.last_autovacuum) * 1000   AS last_autovacuum,
  EXTRACT(EPOCH FROM s.last_analyze) * 1000      AS last_analyze,
  EXTRACT(EPOCH FROM s.last_autoanalyze) * 1000  AS last_autoanalyze
FROM pg_stat_user_tables s
WHERE ($1::text IS NULL OR s.schemaname = $1::text)
`;

const PG_DB_SQL = `
SELECT EXTRACT(EPOCH FROM stats_reset) * 1000 AS stats_reset
FROM pg_stat_database
WHERE datname = current_database()
`;

const MYSQL_STATS_SQL = `
SELECT
  TABLE_SCHEMA                            AS schema_name,
  TABLE_NAME                              AS table_name,
  COALESCE(TABLE_ROWS, 0)                 AS live_rows,
  COALESCE(DATA_LENGTH, 0)                AS data_length,
  COALESCE(INDEX_LENGTH, 0)               AS index_length,
  COALESCE(DATA_FREE, 0)                  AS data_free,
  UNIX_TIMESTAMP(CREATE_TIME) * 1000      AS created_at,
  UNIX_TIMESTAMP(UPDATE_TIME) * 1000      AS updated_at,
  AUTO_INCREMENT                          AS auto_increment
FROM information_schema.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
  AND (? IS NULL OR TABLE_SCHEMA = ?)
`;

/** Reads whatever activity the dialect exposes and turns it into a single feed. */
export async function readActivity(
  client: Client,
  database: string,
  schema?: string
): Promise<ActivityReport> {
  return client.dialect === "postgres"
    ? readPostgresActivity(client, database, schema)
    : readMysqlActivity(client, database, schema);
}

async function readPostgresActivity(
  client: Client,
  database: string,
  schema?: string
): Promise<ActivityReport> {
  const source = {
    kind: "pg_stat" as const,
    view: "pg_stat_user_tables",
    note: "Counters accumulate until the statistics are reset, so these are totals for the current stats window rather than a timeline.",
  };

  let rows: Record<string, unknown>[];
  try {
    rows = await client.query(PG_STATS_SQL, [schema ?? null]);
  } catch (e) {
    return {
      events: [],
      total: 0,
      source,
      statsResetAt: null,
      totals: { tables: 0, inserts: 0, updates: 0, deletes: 0, liveRows: 0, deadRows: 0 },
      available: false,
      unavailableReason:
        e instanceof Error
          ? `Could not read pg_stat_user_tables: ${e.message}`
          : "Could not read pg_stat_user_tables.",
    };
  }

  let statsResetAt: number | null = null;
  try {
    const dbRows = await client.query<{ stats_reset: unknown }>(PG_DB_SQL);
    statsResetAt = ts(dbRows[0]?.stats_reset);
  } catch {
    // pg_stat_database is restricted on some managed providers; the feed still works.
  }

  const events: ActivityEvent[] = [];
  const totals = { tables: rows.length, inserts: 0, updates: 0, deletes: 0, liveRows: 0, deadRows: 0 };

  for (const row of rows) {
    const schemaName = String(row.schema_name);
    const tableName = String(row.table_name);
    const fqn = `${database}.${schemaName}.${tableName}`;

    const inserts = num(row.inserts);
    const updates = num(row.updates);
    const deletes = num(row.deletes);
    const liveRows = num(row.live_rows);
    const deadRows = num(row.dead_rows);
    const seqScans = num(row.seq_scans);
    const idxScans = num(row.idx_scans);
    const writes = inserts + updates + deletes;

    totals.inserts += inserts;
    totals.updates += updates;
    totals.deletes += deletes;
    totals.liveRows += liveRows;
    totals.deadRows += deadRows;

    if (writes > 0) {
      events.push({
        id: `${fqn}::writes`,
        entityType: "table",
        entityName: fqn,
        displayName: `${schemaName}.${tableName}`,
        type: "Writes",
        severity: "info",
        detail: `${compact(inserts)} inserted, ${compact(updates)} updated, ${compact(
          deletes
        )} deleted since the counters were last reset.`,
        timestamp: null,
        metrics: [
          { label: "inserts", value: compact(inserts) },
          { label: "updates", value: compact(updates) },
          { label: "deletes", value: compact(deletes) },
          { label: "live rows", value: compact(liveRows) },
        ],
      });
    }

    // Dead rows are space the table is still holding but nothing can read.
    const churn = deadRows / Math.max(liveRows + deadRows, 1);
    if (deadRows > 1_000 && churn > 0.2) {
      events.push({
        id: `${fqn}::bloat`,
        entityType: "table",
        entityName: fqn,
        displayName: `${schemaName}.${tableName}`,
        type: "Bloat",
        severity: "warning",
        detail: `${Math.round(churn * 100)}% of this table's tuples are dead (${compact(
          deadRows
        )} of ${compact(liveRows + deadRows)}). Autovacuum may be falling behind.`,
        timestamp: null,
        metrics: [
          { label: "dead rows", value: compact(deadRows) },
          { label: "live rows", value: compact(liveRows) },
        ],
      });
    }

    if (seqScans > 50 && idxScans === 0 && liveRows > 10_000) {
      events.push({
        id: `${fqn}::seqscan`,
        entityType: "table",
        entityName: fqn,
        displayName: `${schemaName}.${tableName}`,
        type: "Full scans",
        severity: "warning",
        detail: `${compact(seqScans)} sequential scans and no index scans on ${compact(
          liveRows
        )} rows — every query here reads the whole table.`,
        timestamp: null,
        metrics: [
          { label: "seq scans", value: compact(seqScans) },
          { label: "index scans", value: "0" },
        ],
      });
    }

    const lastVacuum = Math.max(ts(row.last_vacuum) ?? 0, ts(row.last_autovacuum) ?? 0) || null;
    const lastAnalyze = Math.max(ts(row.last_analyze) ?? 0, ts(row.last_autoanalyze) ?? 0) || null;
    const lastMaintenance = Math.max(lastVacuum ?? 0, lastAnalyze ?? 0) || null;

    if (lastMaintenance) {
      events.push({
        id: `${fqn}::maintenance`,
        entityType: "table",
        entityName: fqn,
        displayName: `${schemaName}.${tableName}`,
        type: "Maintenance",
        severity: "info",
        detail: [
          lastVacuum ? "vacuumed" : null,
          lastAnalyze ? "analysed" : null,
        ]
          .filter(Boolean)
          .join(" and ")
          .replace(/^./, (c) => c.toUpperCase()) + ".",
        timestamp: lastMaintenance,
        metrics: [
          { label: "last vacuum", value: lastVacuum ? new Date(lastVacuum).toISOString().slice(0, 16).replace("T", " ") : "never" },
          { label: "last analyse", value: lastAnalyze ? new Date(lastAnalyze).toISOString().slice(0, 16).replace("T", " ") : "never" },
        ],
      });
    } else if (liveRows > 10_000) {
      events.push({
        id: `${fqn}::never-analysed`,
        entityType: "table",
        entityName: fqn,
        displayName: `${schemaName}.${tableName}`,
        type: "Never analysed",
        severity: "warning",
        detail: `${compact(
          liveRows
        )} rows and no recorded vacuum or analyse — the planner is working from stale statistics.`,
        timestamp: null,
        metrics: [{ label: "live rows", value: compact(liveRows) }],
      });
    }
  }

  return {
    events: rank(events),
    total: events.length,
    source,
    statsResetAt,
    totals,
    available: true,
  };
}

async function readMysqlActivity(
  client: Client,
  database: string,
  schema?: string
): Promise<ActivityReport> {
  const source = {
    kind: "information_schema" as const,
    view: "information_schema.TABLES",
    note: "MySQL does not keep per-table write counters, so this feed is built from creation and last-update times. UPDATE_TIME is reset when the server restarts, so an empty value does not mean the table is idle.",
  };

  let rows: Record<string, unknown>[];
  try {
    rows = await client.query(MYSQL_STATS_SQL, [schema ?? null, schema ?? null]);
  } catch (e) {
    return {
      events: [],
      total: 0,
      source,
      statsResetAt: null,
      totals: { tables: 0, inserts: 0, updates: 0, deletes: 0, liveRows: 0, deadRows: 0 },
      available: false,
      unavailableReason:
        e instanceof Error
          ? `Could not read information_schema.TABLES: ${e.message}`
          : "Could not read information_schema.TABLES.",
    };
  }

  const events: ActivityEvent[] = [];
  const totals = { tables: rows.length, inserts: 0, updates: 0, deletes: 0, liveRows: 0, deadRows: 0 };
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const schemaName = String(row.schema_name);
    const tableName = String(row.table_name);
    const fqn = `${database}.${schemaName}.${tableName}`;
    const display = `${schemaName}.${tableName}`;

    const liveRows = num(row.live_rows);
    const dataLength = num(row.data_length);
    const indexLength = num(row.index_length);
    const dataFree = num(row.data_free);
    const createdAt = ts(row.created_at);
    const updatedAt = ts(row.updated_at);

    totals.liveRows += liveRows;
    totals.deadRows += 0;

    if (updatedAt) {
      events.push({
        id: `${fqn}::updated`,
        entityType: "table",
        entityName: fqn,
        displayName: display,
        type: "Written",
        severity: "info",
        detail: `Last write recorded by the storage engine. Roughly ${compact(
          liveRows
        )} rows, ${bytes(dataLength + indexLength)} on disk.`,
        timestamp: updatedAt,
        metrics: [
          { label: "approx rows", value: compact(liveRows) },
          { label: "size", value: bytes(dataLength + indexLength) },
        ],
      });
    }

    if (createdAt && createdAt > weekAgo) {
      events.push({
        id: `${fqn}::created`,
        entityType: "table",
        entityName: fqn,
        displayName: display,
        type: "Created",
        severity: "info",
        detail: "Table created in the last seven days.",
        timestamp: createdAt,
        metrics: [{ label: "approx rows", value: compact(liveRows) }],
      });
    }

    // DATA_FREE is space the tablespace holds but no row occupies.
    if (dataFree > 50_000_000 && dataFree > dataLength * 0.3) {
      events.push({
        id: `${fqn}::fragmentation`,
        entityType: "table",
        entityName: fqn,
        displayName: display,
        type: "Fragmented",
        severity: "warning",
        detail: `${bytes(dataFree)} of allocated space holds no rows — heavy deletes without an OPTIMIZE TABLE.`,
        timestamp: null,
        metrics: [
          { label: "free space", value: bytes(dataFree) },
          { label: "data", value: bytes(dataLength) },
        ],
      });
    }

    if (!updatedAt && !createdAt && liveRows > 0) {
      events.push({
        id: `${fqn}::unknown`,
        entityType: "table",
        entityName: fqn,
        displayName: display,
        type: "No timestamps",
        severity: "info",
        detail: `${compact(
          liveRows
        )} rows, but the storage engine reports no create or update time for this table.`,
        timestamp: null,
        metrics: [{ label: "approx rows", value: compact(liveRows) }],
      });
    }
  }

  return {
    events: rank(events),
    total: events.length,
    source,
    statsResetAt: null,
    totals,
    available: true,
  };
}

/**
 * Warnings first, then the most recent timestamps, then the untimed counters.
 * A feed sorted purely by time would bury the problems on Postgres, where the
 * interesting events carry no timestamp at all.
 */
function rank(events: ActivityEvent[]): ActivityEvent[] {
  return events
    .slice()
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "warning" ? -1 : 1;
      if (a.timestamp && b.timestamp) return b.timestamp - a.timestamp;
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, MAX_EVENTS);
}
