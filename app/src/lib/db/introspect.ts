import type { Client } from "./connect";
import type { Catalog, ColumnMeta, ForeignKey, TableMeta } from "./types";

/**
 * Reads a live database's schema into the same shape the rest of the app already
 * uses for OpenMetadata entities, so every existing page renders it unchanged.
 * Only catalog metadata is read here — no table contents.
 */

const MAX_TABLES = 500;

type RawColumnRow = {
  table_schema: string;
  table_name: string;
  table_type: string;
  table_description: string | null;
  approx_rows: number | string | null;
  column_name: string;
  data_type: string;
  ordinal_position: number;
  is_nullable: boolean | string;
  column_description: string | null;
  is_primary_key: boolean | number | string;
};

const PG_COLUMNS_SQL = `
SELECT
  n.nspname                                            AS table_schema,
  c.relname                                            AS table_name,
  CASE WHEN c.relkind IN ('v','m') THEN 'VIEW' ELSE 'TABLE' END AS table_type,
  obj_description(c.oid, 'pg_class')                   AS table_description,
  GREATEST(c.reltuples, 0)::bigint                     AS approx_rows,
  a.attname                                            AS column_name,
  format_type(a.atttypid, a.atttypmod)                 AS data_type,
  a.attnum                                             AS ordinal_position,
  (NOT a.attnotnull)                                   AS is_nullable,
  col_description(c.oid, a.attnum)                     AS column_description,
  COALESCE(pk.is_pk, false)                            AS is_primary_key
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN LATERAL (
  SELECT true AS is_pk
  FROM pg_constraint con
  WHERE con.conrelid = c.oid AND con.contype = 'p' AND a.attnum = ANY (con.conkey)
  LIMIT 1
) pk ON true
WHERE c.relkind IN ('r','p','v','m','f')
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname NOT LIKE 'pg\\_toast%'
  AND n.nspname NOT LIKE 'pg\\_temp%'
  AND has_table_privilege(c.oid, 'SELECT')
  AND ($1::text IS NULL OR n.nspname = $1::text)
  AND ($2::text IS NULL OR c.relname = $2::text)
ORDER BY n.nspname, c.relname, a.attnum
`;

const PG_FK_SQL = `
SELECT
  con.conname       AS constraint_name,
  sn.nspname        AS from_schema,
  sc.relname        AS from_table,
  sa.attname        AS from_column,
  tn.nspname        AS to_schema,
  tc.relname        AS to_table,
  ta.attname        AS to_column
FROM pg_constraint con
JOIN pg_class sc     ON sc.oid = con.conrelid
JOIN pg_namespace sn ON sn.oid = sc.relnamespace
JOIN pg_class tc     ON tc.oid = con.confrelid
JOIN pg_namespace tn ON tn.oid = tc.relnamespace
JOIN LATERAL unnest(con.conkey, con.confkey) AS k(src, tgt) ON true
JOIN pg_attribute sa ON sa.attrelid = sc.oid AND sa.attnum = k.src
JOIN pg_attribute ta ON ta.attrelid = tc.oid AND ta.attnum = k.tgt
WHERE con.contype = 'f'
  AND sn.nspname NOT IN ('pg_catalog','information_schema')
  AND ($1::text IS NULL OR sn.nspname = $1::text)
`;

const MYSQL_COLUMNS_SQL = `
SELECT
  t.TABLE_SCHEMA        AS table_schema,
  t.TABLE_NAME          AS table_name,
  CASE WHEN t.TABLE_TYPE = 'VIEW' THEN 'VIEW' ELSE 'TABLE' END AS table_type,
  NULLIF(t.TABLE_COMMENT, '')  AS table_description,
  COALESCE(t.TABLE_ROWS, 0)    AS approx_rows,
  c.COLUMN_NAME         AS column_name,
  c.COLUMN_TYPE         AS data_type,
  c.ORDINAL_POSITION    AS ordinal_position,
  (c.IS_NULLABLE = 'YES')      AS is_nullable,
  NULLIF(c.COLUMN_COMMENT, '') AS column_description,
  (c.COLUMN_KEY = 'PRI')       AS is_primary_key
FROM information_schema.TABLES t
JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
WHERE t.TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
  AND (? IS NULL OR t.TABLE_SCHEMA = ?)
  AND (? IS NULL OR t.TABLE_NAME = ?)
ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
`;

const MYSQL_FK_SQL = `
SELECT
  k.CONSTRAINT_NAME          AS constraint_name,
  k.TABLE_SCHEMA             AS from_schema,
  k.TABLE_NAME               AS from_table,
  k.COLUMN_NAME              AS from_column,
  k.REFERENCED_TABLE_SCHEMA  AS to_schema,
  k.REFERENCED_TABLE_NAME    AS to_table,
  k.REFERENCED_COLUMN_NAME   AS to_column
FROM information_schema.KEY_COLUMN_USAGE k
WHERE k.REFERENCED_TABLE_NAME IS NOT NULL
  AND k.TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
  AND (? IS NULL OR k.TABLE_SCHEMA = ?)
`;

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "YES" || v === "t";

export function makeFqn(database: string, schema: string, table: string) {
  return `${database}.${schema}.${table}`;
}

export type IntrospectFilter = { schema?: string; table?: string };

export async function introspect(
  client: Client,
  database: string,
  filter: IntrospectFilter = {}
): Promise<Catalog> {
  const isPg = client.dialect === "postgres";
  const schemaFilter = filter.schema ?? null;
  const tableFilter = filter.table ?? null;

  const columnRows = await client.query<RawColumnRow>(
    isPg ? PG_COLUMNS_SQL : MYSQL_COLUMNS_SQL,
    isPg ? [schemaFilter, tableFilter] : [schemaFilter, schemaFilter, tableFilter, tableFilter]
  );

  const byTable = new Map<string, TableMeta>();

  for (const row of columnRows) {
    const fqn = makeFqn(database, row.table_schema, row.table_name);

    let table = byTable.get(fqn);
    if (!table) {
      if (byTable.size >= MAX_TABLES) continue;
      table = {
        id: fqn,
        name: row.table_name,
        schema: row.table_schema,
        fullyQualifiedName: fqn,
        description: row.table_description ?? "",
        tableType: row.table_type === "VIEW" ? "VIEW" : "TABLE",
        approxRows: Number(row.approx_rows ?? 0) || 0,
        columns: [],
        tags: [],
      };
      byTable.set(fqn, table);
    }

    const column: ColumnMeta = {
      name: row.column_name,
      dataType: String(row.data_type).toUpperCase(),
      description: row.column_description ?? "",
      nullable: truthy(row.is_nullable),
      isPrimaryKey: truthy(row.is_primary_key),
      ordinalPosition: Number(row.ordinal_position),
      tags: [],
    };
    table.columns.push(column);
  }

  // Foreign keys are best-effort: some managed databases restrict these views.
  let foreignKeys: ForeignKey[] = [];
  try {
    const fkRows = await client.query<{
      constraint_name: string;
      from_schema: string;
      from_table: string;
      from_column: string;
      to_schema: string;
      to_table: string;
      to_column: string;
    }>(
      isPg ? PG_FK_SQL : MYSQL_FK_SQL,
      isPg ? [schemaFilter] : [schemaFilter, schemaFilter]
    );
    foreignKeys = fkRows.map((r) => ({
      constraintName: r.constraint_name,
      fromTable: makeFqn(database, r.from_schema, r.from_table),
      fromColumn: r.from_column,
      toTable: makeFqn(database, r.to_schema, r.to_table),
      toColumn: r.to_column,
    }));
  } catch {
    foreignKeys = [];
  }

  return {
    dialect: client.dialect,
    database,
    version: client.version,
    tables: [...byTable.values()],
    foreignKeys,
  };
}
