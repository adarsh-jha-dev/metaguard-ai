// Shared types for user-supplied database connections.
//
// IMPORTANT: nothing in this module is ever persisted. Credentials arrive in a
// request body, live for the duration of one request, and are discarded.

export type Dialect = "postgres" | "mysql";

export type Connection = {
  dialect: Dialect;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** "require" forces TLS, "disable" turns it off, "prefer" tries TLS then falls back. */
  ssl: "require" | "prefer" | "disable";
  /** Skip certificate verification — needed for self-signed certs on RDS/Neon proxies. */
  sslRejectUnauthorized?: boolean;
  /** Optional: restrict introspection to a single schema. */
  schema?: string;
};

export type ColumnMeta = {
  name: string;
  dataType: string;
  description: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  ordinalPosition: number;
  tags: { tagFQN: string }[];
};

export type TableMeta = {
  id: string;
  name: string;
  schema: string;
  fullyQualifiedName: string;
  description: string;
  tableType: "TABLE" | "VIEW";
  approxRows: number;
  columns: ColumnMeta[];
  tags: { tagFQN: string }[];
};

export type ForeignKey = {
  constraintName: string;
  fromTable: string; // fully qualified
  fromColumn: string;
  toTable: string; // fully qualified
  toColumn: string;
};

export type Catalog = {
  dialect: Dialect;
  database: string;
  version: string;
  tables: TableMeta[];
  foreignKeys: ForeignKey[];
};

/** Aggregate statistics for one column. No raw values are ever included. */
export type ColumnProfile = {
  column: string;
  dataType: string;
  sampledRows: number;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  distinctPercent: number;
  /** Fraction (0-1) of non-null sampled values matching each pattern. */
  patternHits: Record<string, number>;
};

export type TableProfile = {
  fqn: string;
  sampledRows: number;
  columns: ColumnProfile[];
  truncated: boolean;
};
