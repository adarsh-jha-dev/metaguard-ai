import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { profileTable } from "@/lib/db/profile";
import { deriveQualityChecks, type QualityCheck } from "@/lib/db/insights";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How many tables one request will profile, to keep the round trip bounded. */
const MAX_TABLES_PER_RUN = 8;

/**
 * Generates a data quality report by profiling tables and deriving the checks a
 * team would otherwise have to write by hand.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);

    const requested = Array.isArray(body.tables)
      ? (body.tables as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const schema = typeof body.schema === "string" && body.schema ? body.schema : connection.schema;

    const report = await withConnection(connection, async (client) => {
      const catalog = await introspect(client, connection.database, { schema });

      const selected = (
        requested.length > 0
          ? catalog.tables.filter((t) => requested.includes(t.fullyQualifiedName))
          : // Default to the largest tables — that's where quality problems bite.
            [...catalog.tables]
              .filter((t) => t.tableType === "TABLE")
              .sort((a, b) => b.approxRows - a.approxRows)
      ).slice(0, MAX_TABLES_PER_RUN);

      const checks: QualityCheck[] = [];
      const profiled: string[] = [];

      // Group foreign-key source columns by table so uniqueness checks can skip them.
      const fkColumnsByTable = new Map<string, Set<string>>();
      for (const fk of catalog.foreignKeys) {
        if (!fkColumnsByTable.has(fk.fromTable)) fkColumnsByTable.set(fk.fromTable, new Set());
        fkColumnsByTable.get(fk.fromTable)!.add(fk.fromColumn);
      }

      for (const table of selected) {
        try {
          const profile = await profileTable(
            client,
            table.fullyQualifiedName,
            table.schema,
            table.name,
            table.columns
          );
          checks.push(
            ...deriveQualityChecks(
              table,
              profile,
              fkColumnsByTable.get(table.fullyQualifiedName) ?? new Set()
            )
          );
          profiled.push(table.fullyQualifiedName);
        } catch {
          checks.push({
            id: `${table.fullyQualifiedName}::readable`,
            table: table.fullyQualifiedName,
            tableName: table.name,
            name: `${table.name} is readable`,
            testType: "tableIsReadable",
            status: "failed",
            detail: "The connected user could not read this table's contents.",
          });
        }
      }

      return {
        checks,
        profiledTables: profiled,
        totalTables: catalog.tables.length,
        limited: catalog.tables.length > selected.length,
      };
    });

    const summary = {
      total: report.checks.length,
      passed: report.checks.filter((c) => c.status === "passed").length,
      failed: report.checks.filter((c) => c.status === "failed").length,
      warning: report.checks.filter((c) => c.status === "warning").length,
    };

    return json({ ...report, summary });
  } catch (e) {
    return errorResponse(e);
  }
}
