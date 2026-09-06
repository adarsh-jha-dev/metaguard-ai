import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { profileTable } from "@/lib/db/profile";
import { mergeVerdict } from "@/lib/db/classify";
import { classifyColumns } from "@/lib/gemini";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";
import { ConnectionError } from "@/lib/db/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scans one table for PII.
 *
 * The schema/table names in the request are used only as *bound parameters* to
 * the catalog query. The identifiers that get interpolated into profiling SQL
 * come back from the database's own catalog, so a crafted request body cannot
 * reach the query builder.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);

    const fqn = typeof body.fqn === "string" ? body.fqn : "";
    let schema = typeof body.schema === "string" ? body.schema : "";
    let table = typeof body.table === "string" ? body.table : "";

    if ((!schema || !table) && fqn) {
      const parts = fqn.split(".");
      if (parts.length >= 3) {
        table = parts[parts.length - 1];
        schema = parts[parts.length - 2];
      }
    }
    if (!schema || !table) {
      throw new ConnectionError("Which table? Provide a schema and table name.");
    }

    const deepScan = body.deepScan !== false;

    const result = await withConnection(connection, async (client) => {
      const catalog = await introspect(client, connection.database, { schema, table });
      const meta = catalog.tables[0];
      if (!meta) {
        throw new ConnectionError(
          `Table "${schema}.${table}" was not found, or this user cannot read it.`
        );
      }

      const profile = deepScan
        ? await profileTable(client, meta.fullyQualifiedName, meta.schema, meta.name, meta.columns)
        : { fqn: meta.fullyQualifiedName, sampledRows: 0, columns: [], truncated: false };

      return { meta, profile };
    });

    const { meta, profile } = result;

    // Ask Gemini about the column names. Only names, types and comments are
    // sent — never a value, never the connection details.
    let aiVerdicts: Record<string, { classification?: string; confidence?: number; reason?: string }> = {};
    let aiUsed = false;
    if (process.env.GEMINI_API_KEY) {
      try {
        const raw = await classifyColumns(
          meta.fullyQualifiedName,
          meta.columns.map((c) => ({
            name: c.name,
            dataType: c.dataType,
            description: c.description,
          }))
        );
        if (Array.isArray(raw)) {
          aiUsed = true;
          for (const r of raw as { column?: string }[]) {
            if (r?.column) aiVerdicts[r.column] = r as never;
          }
        }
      } catch {
        aiVerdicts = {};
      }
    }

    const profileByColumn = new Map(profile.columns.map((p) => [p.column, p]));
    const classifications = meta.columns.map((col) =>
      mergeVerdict(col, profileByColumn.get(col.name), aiVerdicts[col.name])
    );

    return json({
      table: {
        id: meta.fullyQualifiedName,
        name: meta.name,
        schema: meta.schema,
        fqn: meta.fullyQualifiedName,
        description: meta.description,
        approxRows: meta.approxRows,
        columns: meta.columns,
      },
      classifications,
      profile,
      scan: {
        deepScan,
        aiUsed,
        sampledRows: profile.sampledRows,
        columnsProfiled: profile.columns.length,
        truncated: profile.truncated,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
