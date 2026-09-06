import type { Client } from "./connect";
import type { ColumnMeta, ColumnProfile, TableProfile } from "./types";

/**
 * Column profiling over a bounded sample.
 *
 * Every query here returns *aggregates only* — counts of rows matching a
 * pattern, null counts, distinct counts. No raw cell value is ever selected,
 * returned to the browser, or sent to the LLM.
 */

const SAMPLE_ROWS = 5_000;
/** Columns per aggregate query. Keeps generated SQL to a sane size on wide tables. */
const COLUMNS_PER_BATCH = 20;
/** Hard cap on columns profiled for one table. */
const MAX_PROFILED_COLUMNS = 120;

/**
 * Patterns use only the POSIX character classes and interval syntax that both
 * PostgreSQL and MySQL (5.7 POSIX and 8.0 ICU) understand. `[.]` is used in
 * place of an escaped dot so the expressions survive SQL literal escaping.
 */
export const VALUE_PATTERNS: { key: string; label: string; regex: string; signal: "pii" | "id" }[] = [
  {
    key: "email",
    label: "email address",
    regex: "^[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}$",
    signal: "pii",
  },
  {
    key: "phone",
    label: "phone number",
    regex: "^[+]?[0-9][0-9 ()-]{6,19}$",
    signal: "pii",
  },
  {
    key: "ssn",
    label: "US social security number",
    regex: "^[0-9]{3}-[0-9]{2}-[0-9]{4}$",
    signal: "pii",
  },
  {
    key: "credit_card",
    label: "payment card number",
    regex: "^([0-9]{13,19}|[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4})$",
    signal: "pii",
  },
  {
    key: "ipv4",
    label: "IP address",
    regex: "^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}$",
    signal: "pii",
  },
  {
    key: "iban",
    label: "IBAN / bank account",
    regex: "^[[:alpha:]]{2}[0-9]{2}[[:alnum:]]{10,30}$",
    signal: "pii",
  },
  {
    key: "uuid",
    label: "UUID",
    regex: "^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$",
    signal: "id",
  },
];

// ── Identifier + literal escaping ──────────────────────────────────────────

export function quoteIdent(dialect: "postgres" | "mysql", name: string): string {
  if (name.includes("\0")) throw new Error("Invalid identifier");
  return dialect === "postgres"
    ? '"' + name.replace(/"/g, '""') + '"'
    : "`" + name.replace(/`/g, "``") + "`";
}

function quoteLiteral(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

/** Types we refuse to cast to text — binary/spatial payloads. */
function isOpaqueType(dataType: string): boolean {
  return /\b(BLOB|BYTEA|BINARY|VARBINARY|GEOMETRY|GEOGRAPHY|POINT|POLYGON|LINESTRING|IMAGE)\b/i.test(
    dataType
  );
}

/**
 * Types worth running value patterns against.
 *
 * Deliberately an allowlist of *exclusions* rather than inclusions: dialects
 * spell types in ways a keyword list keeps missing (`character varying`,
 * `nvarchar2`, domain types, extensions like `citext`), and a column skipped
 * here is a column whose PII goes undetected. Anything castable to text gets
 * scanned; a regex over booleans and timestamps simply finds nothing.
 */
function isPatternCandidate(dataType: string): boolean {
  return !isOpaqueType(dataType);
}

function textExpr(dialect: "postgres" | "mysql", ident: string): string {
  return dialect === "postgres"
    ? `TRIM(BOTH FROM ${ident}::text)`
    : `TRIM(CAST(${ident} AS CHAR))`;
}

function regexExpr(dialect: "postgres" | "mysql", value: string, pattern: string): string {
  return dialect === "postgres"
    ? `${value} ~* ${quoteLiteral(pattern)}`
    : `${value} REGEXP ${quoteLiteral(pattern)}`;
}

// ── Profiling ──────────────────────────────────────────────────────────────

type BatchRow = Record<string, number | string | null>;

/**
 * Profiles one table. `schema`/`table` must come from a catalog this process
 * introspected — never straight from a request body — because they are
 * interpolated as quoted identifiers rather than bound parameters.
 */
export async function profileTable(
  client: Client,
  fqn: string,
  schema: string,
  table: string,
  columns: ColumnMeta[]
): Promise<TableProfile> {
  const dialect = client.dialect;
  const qualified = `${quoteIdent(dialect, schema)}.${quoteIdent(dialect, table)}`;
  const sampleFrom = `(SELECT * FROM ${qualified} LIMIT ${SAMPLE_ROWS}) AS mg_sample`;

  const target = columns.slice(0, MAX_PROFILED_COLUMNS);
  const profiles: ColumnProfile[] = [];

  for (let start = 0; start < target.length; start += COLUMNS_PER_BATCH) {
    const batch = target.slice(start, start + COLUMNS_PER_BATCH);

    let rows: BatchRow[];
    try {
      rows = await client.query<BatchRow>(buildBatchSql(dialect, sampleFrom, batch, true));
    } catch {
      // A cast or regex the server dislikes — retry with counts only.
      try {
        rows = await client.query<BatchRow>(buildBatchSql(dialect, sampleFrom, batch, false));
      } catch {
        continue;
      }
    }

    const row = rows[0];
    if (!row) continue;
    const sampledRows = Number(row.__rows ?? 0);

    batch.forEach((col, i) => {
      const nonNull = Number(row[`c${i}_nn`] ?? 0);
      const distinct = row[`c${i}_d`] == null ? 0 : Number(row[`c${i}_d`]);
      const nullCount = Math.max(sampledRows - nonNull, 0);

      const patternHits: Record<string, number> = {};
      for (const p of VALUE_PATTERNS) {
        const key = `c${i}_${p.key}`;
        if (row[key] == null) continue;
        const hits = Number(row[key]);
        if (nonNull > 0 && hits > 0) patternHits[p.key] = hits / nonNull;
      }

      profiles.push({
        column: col.name,
        dataType: col.dataType,
        sampledRows,
        nullCount,
        nullPercent: sampledRows > 0 ? (nullCount / sampledRows) * 100 : 0,
        distinctCount: distinct,
        distinctPercent: nonNull > 0 ? (distinct / nonNull) * 100 : 0,
        patternHits,
      });
    });
  }

  return {
    fqn,
    sampledRows: profiles[0]?.sampledRows ?? 0,
    columns: profiles,
    truncated: columns.length > MAX_PROFILED_COLUMNS,
  };
}

function buildBatchSql(
  dialect: "postgres" | "mysql",
  sampleFrom: string,
  batch: ColumnMeta[],
  withPatterns: boolean
): string {
  const selects: string[] = ["COUNT(*) AS __rows"];

  batch.forEach((col, i) => {
    const ident = quoteIdent(dialect, col.name);
    selects.push(`COUNT(${ident}) AS c${i}_nn`);

    if (isOpaqueType(col.dataType)) return;

    const asText = textExpr(dialect, ident);
    selects.push(`COUNT(DISTINCT ${asText}) AS c${i}_d`);

    if (!withPatterns || !isPatternCandidate(col.dataType)) return;
    for (const p of VALUE_PATTERNS) {
      selects.push(
        `SUM(CASE WHEN ${regexExpr(dialect, asText, p.regex)} THEN 1 ELSE 0 END) AS c${i}_${p.key}`
      );
    }
  });

  return `SELECT ${selects.join(", ")} FROM ${sampleFrom}`;
}
