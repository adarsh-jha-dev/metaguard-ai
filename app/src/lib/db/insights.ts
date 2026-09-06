import type { Catalog, TableMeta, TableProfile } from "./types";

/**
 * Derived analysis over an introspected catalog: a governance score that means
 * something for a raw database (which has no tags or owners to count), and data
 * quality checks inferred from column profiles.
 */

// ── Governance score ───────────────────────────────────────────────────────

export type GovernanceReport = {
  score: number;
  metrics: {
    totalTables: number;
    totalColumns: number;
    tablesWithDescription: number;
    columnsWithDescription: number;
    tablesWithPrimaryKey: number;
    tablesInRelationships: number;
    descriptionCoverage: number;
    columnDescriptionCoverage: number;
    primaryKeyCoverage: number;
    relationshipCoverage: number;
    views: number;
    approxRows: number;
  };
  gaps: { title: string; detail: string; severity: "high" | "medium" | "low" }[];
};

export function computeGovernance(catalog: Catalog): GovernanceReport {
  const tables = catalog.tables;
  const total = tables.length || 1;
  const totalColumns = tables.reduce((n, t) => n + t.columns.length, 0) || 1;

  const tablesWithDescription = tables.filter((t) => t.description.trim().length > 0).length;
  const columnsWithDescription = tables.reduce(
    (n, t) => n + t.columns.filter((c) => c.description.trim().length > 0).length,
    0
  );
  const tablesWithPrimaryKey = tables.filter((t) => t.columns.some((c) => c.isPrimaryKey)).length;

  const related = new Set<string>();
  for (const fk of catalog.foreignKeys) {
    related.add(fk.fromTable);
    related.add(fk.toTable);
  }
  const tablesInRelationships = tables.filter((t) => related.has(t.fullyQualifiedName)).length;

  const descriptionCoverage = (tablesWithDescription / total) * 100;
  const columnDescriptionCoverage = (columnsWithDescription / totalColumns) * 100;
  const primaryKeyCoverage = (tablesWithPrimaryKey / total) * 100;
  const relationshipCoverage = (tablesInRelationships / total) * 100;

  const score = Math.round(
    descriptionCoverage * 0.3 +
      columnDescriptionCoverage * 0.3 +
      primaryKeyCoverage * 0.25 +
      relationshipCoverage * 0.15
  );

  const gaps: GovernanceReport["gaps"] = [];
  const undocumented = tables.length - tablesWithDescription;
  if (undocumented > 0) {
    gaps.push({
      title: `${undocumented} ${undocumented === 1 ? "table has" : "tables have"} no description`,
      detail: "Nobody joining the team can tell what these tables are for without reading the code that writes them.",
      severity: undocumented / total > 0.5 ? "high" : "medium",
    });
  }
  const undocumentedCols = totalColumns - columnsWithDescription;
  if (undocumentedCols / totalColumns > 0.3) {
    gaps.push({
      title: `${Math.round((undocumentedCols / totalColumns) * 100)}% of columns are undocumented`,
      detail: "Column comments are the cheapest documentation you can add — they travel with the schema.",
      severity: undocumentedCols / totalColumns > 0.8 ? "high" : "medium",
    });
  }
  const noPk = tables.filter((t) => t.tableType === "TABLE" && !t.columns.some((c) => c.isPrimaryKey));
  if (noPk.length > 0) {
    gaps.push({
      title: `${noPk.length} ${noPk.length === 1 ? "table has" : "tables have"} no primary key`,
      detail: `Without a primary key, deduplication and incremental syncs are unreliable. Affected: ${noPk
        .slice(0, 5)
        .map((t) => t.name)
        .join(", ")}${noPk.length > 5 ? "…" : ""}`,
      severity: "high",
    });
  }
  const isolated = tables.filter((t) => t.tableType === "TABLE" && !related.has(t.fullyQualifiedName));
  if (isolated.length > 0 && catalog.foreignKeys.length > 0) {
    gaps.push({
      title: `${isolated.length} ${isolated.length === 1 ? "table has" : "tables have"} no declared relationships`,
      detail: "These tables have no foreign keys in or out, so lineage and impact analysis can't see how they connect.",
      severity: "low",
    });
  }

  return {
    score,
    metrics: {
      totalTables: tables.length,
      totalColumns: tables.reduce((n, t) => n + t.columns.length, 0),
      tablesWithDescription,
      columnsWithDescription,
      tablesWithPrimaryKey,
      tablesInRelationships,
      descriptionCoverage: Math.round(descriptionCoverage),
      columnDescriptionCoverage: Math.round(columnDescriptionCoverage),
      primaryKeyCoverage: Math.round(primaryKeyCoverage),
      relationshipCoverage: Math.round(relationshipCoverage),
      views: tables.filter((t) => t.tableType === "VIEW").length,
      approxRows: tables.reduce((n, t) => n + t.approxRows, 0),
    },
    gaps,
  };
}

// ── Quality checks ─────────────────────────────────────────────────────────

export type QualityCheck = {
  id: string;
  table: string;
  tableName: string;
  column?: string;
  name: string;
  testType: string;
  status: "passed" | "failed" | "warning";
  detail: string;
};

/**
 * Turns a column profile into pass/fail checks. These are the checks you would
 * write by hand on day one of a data quality program, generated automatically.
 */
export function deriveQualityChecks(
  table: TableMeta,
  profile: TableProfile,
  /**
   * Columns on this table that are the *source* of a foreign key. Repeated
   * values are the whole point of a foreign key, so they are exempt from the
   * uniqueness check — flagging them would bury the real findings in noise.
   */
  foreignKeyColumns: Set<string> = new Set()
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const fqn = table.fullyQualifiedName;

  if (table.tableType === "TABLE" && !table.columns.some((c) => c.isPrimaryKey)) {
    checks.push({
      id: `${fqn}::primary_key`,
      table: fqn,
      tableName: table.name,
      name: `${table.name} declares a primary key`,
      testType: "tableHasPrimaryKey",
      status: "failed",
      detail: "No primary key constraint. Duplicate rows cannot be detected or prevented.",
    });
  }

  if (profile.sampledRows === 0) {
    checks.push({
      id: `${fqn}::not_empty`,
      table: fqn,
      tableName: table.name,
      name: `${table.name} contains rows`,
      testType: "tableRowCountToBeGreaterThan",
      status: "warning",
      detail: "The table is empty. Downstream consumers will silently receive nothing.",
    });
    return checks;
  }

  for (const col of profile.columns) {
    const meta = table.columns.find((c) => c.name === col.column);
    const base = { table: fqn, tableName: table.name, column: col.column };

    // Completeness
    if (col.nullPercent >= 100) {
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::not_null`,
        name: `${col.column} is populated`,
        testType: "columnValuesToBeNotNull",
        status: "failed",
        detail: `Every one of the ${col.sampledRows.toLocaleString()} sampled rows is NULL — this column is entirely unused.`,
      });
    } else if (col.nullPercent > 50) {
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::not_null`,
        name: `${col.column} is mostly populated`,
        testType: "columnValuesToBeNotNull",
        status: "warning",
        detail: `${col.nullPercent.toFixed(1)}% of sampled values are NULL.`,
      });
    } else if (col.nullPercent > 0 && meta && !meta.nullable) {
      // Shouldn't be possible; if it happens the sample and the constraint disagree.
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::not_null`,
        name: `${col.column} honours its NOT NULL constraint`,
        testType: "columnValuesToBeNotNull",
        status: "failed",
        detail: `Column is declared NOT NULL but ${col.nullPercent.toFixed(1)}% of sampled values are NULL.`,
      });
    } else {
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::not_null`,
        name: `${col.column} completeness`,
        testType: "columnValuesToBeNotNull",
        status: "passed",
        detail: `${(100 - col.nullPercent).toFixed(1)}% populated across ${col.sampledRows.toLocaleString()} sampled rows.`,
      });
    }

    // Uniqueness for keys
    const looksLikeKey = meta?.isPrimaryKey || /(^|_)id$/i.test(col.column);
    if (looksLikeKey && !foreignKeyColumns.has(col.column)) {
      const nonNull = col.sampledRows - col.nullCount;
      const unique = nonNull > 0 && col.distinctCount >= nonNull;
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::unique`,
        name: `${col.column} is unique`,
        testType: "columnValuesToBeUnique",
        status: unique ? "passed" : meta?.isPrimaryKey ? "failed" : "warning",
        detail: unique
          ? `${col.distinctCount.toLocaleString()} distinct values across ${nonNull.toLocaleString()} rows.`
          : `Only ${col.distinctCount.toLocaleString()} distinct values across ${nonNull.toLocaleString()} sampled rows — duplicates present.`,
      });
    }

    // Constant columns
    if (col.distinctCount === 1 && col.sampledRows > 20 && col.nullPercent < 100) {
      checks.push({
        ...base,
        id: `${fqn}::${col.column}::cardinality`,
        name: `${col.column} carries information`,
        testType: "columnValueCardinality",
        status: "warning",
        detail: "Every sampled row holds the same value. The column carries no signal as stored.",
      });
    }
  }

  return checks;
}
