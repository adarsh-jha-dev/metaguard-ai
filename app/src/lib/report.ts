import type { ColumnVerdict } from "@/lib/db/classify";

/**
 * Turns a scan into something the user can take away and act on.
 *
 * MetaGuard connects read-only, so it deliberately cannot write tags back to a
 * user's database. Instead it hands over the exact statements to run — and for
 * MySQL, where changing a column comment means restating the whole column
 * definition, it hands over the report rather than risky DDL.
 */

export type ScanExportInput = {
  database: string;
  schema: string;
  table: string;
  dialect: "postgres" | "mysql";
  classifications: ColumnVerdict[];
};

export function toCsv({ database, schema, table, classifications }: ScanExportInput): string {
  const header = [
    "database",
    "schema",
    "table",
    "column",
    "classification",
    "confidence",
    "reason",
    "evidence",
  ];
  const rows = classifications.map((c) => [
    database,
    schema,
    table,
    c.column,
    c.classification,
    c.confidence.toFixed(2),
    c.reason,
    c.evidence.map((e) => `${e.matchPercent}% ${e.label}`).join("; "),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function toJson(input: ScanExportInput): string {
  return JSON.stringify(
    {
      scannedAt: new Date().toISOString(),
      source: { database: input.database, schema: input.schema, table: input.table },
      columns: input.classifications,
    },
    null,
    2
  );
}

/**
 * PostgreSQL only. `COMMENT ON` never touches data or column definitions, so
 * it is safe to hand over verbatim.
 */
export function toPostgresComments({
  schema,
  table,
  classifications,
}: ScanExportInput): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

  const lines = classifications
    .filter((c) => c.classification !== "NotPII")
    .map(
      (c) =>
        `COMMENT ON COLUMN ${q(schema)}.${q(table)}.${q(c.column)} IS ${lit(
          `[${c.classification}] ${c.reason}`
        )};`
    );

  if (lines.length === 0) return "-- No PII columns found in this table.";

  return [
    `-- MetaGuard AI · PII classification for ${schema}.${table}`,
    `-- Generated ${new Date().toISOString()}`,
    "-- COMMENT ON only annotates the catalog; it does not alter data or column definitions.",
    "-- Review before running. Existing comments on these columns will be replaced.",
    "",
    ...lines,
  ].join("\n");
}

export function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Glossary exports ───────────────────────────────────────────────────────

export type GlossaryLink = {
  column: string;
  term: string;
  definition?: string;
  reason?: string;
};

export type GlossaryExportInput = {
  database: string;
  schema: string;
  table: string;
  dialect: "postgres" | "mysql";
  links: GlossaryLink[];
};

/**
 * PostgreSQL only, for the same reason as the PII export: `COMMENT ON` records
 * the term against the column without restating the column definition.
 */
export function toGlossaryComments({ schema, table, links }: GlossaryExportInput): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

  if (links.length === 0) return "-- No glossary terms linked yet.";

  const lines = links.map(
    (l) =>
      `COMMENT ON COLUMN ${q(schema)}.${q(table)}.${q(l.column)} IS ${lit(
        `[${l.term}]${l.definition ? ` ${l.definition}` : ""}`
      )};`
  );

  return [
    `-- MetaGuard AI · glossary terms for ${schema}.${table}`,
    `-- Generated ${new Date().toISOString()}`,
    "-- COMMENT ON only annotates the catalog; it does not alter data or column definitions.",
    "-- Review before running. Existing comments on these columns will be replaced.",
    "",
    ...lines,
  ].join("\n");
}

const csv = (rows: string[][]) =>
  rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

export function toGlossaryLinksCsv({ database, schema, table, links }: GlossaryExportInput): string {
  return csv([
    ["database", "schema", "table", "column", "term", "definition", "reason"],
    ...links.map((l) => [database, schema, table, l.column, l.term, l.definition ?? "", l.reason ?? ""]),
  ]);
}

/** The whole derived glossary, for handing to whatever catalog the team keeps. */
export function toTermsCsv(
  database: string,
  glossaries: {
    name: string;
    terms: {
      name: string;
      description: string;
      kind: string;
      usedIn: string[];
      sourceColumns: string[];
      aiGenerated: boolean;
    }[];
  }[]
): string {
  return csv([
    ["database", "glossary", "term", "kind", "definition", "definition_source", "used_in", "columns"],
    ...glossaries.flatMap((g) =>
      g.terms.map((t) => [
        database,
        g.name,
        t.name,
        t.kind,
        t.description,
        t.description ? (t.aiGenerated ? "gemini" : "database comment") : "undefined",
        t.usedIn.join("; "),
        t.sourceColumns.join("; "),
      ])
    ),
  ]);
}
