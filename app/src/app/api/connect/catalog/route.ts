import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { computeGovernance } from "@/lib/db/insights";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Full schema read: tables, columns, comments, keys, relationships. */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);
    const schema = typeof body.schema === "string" && body.schema ? body.schema : connection.schema;

    const catalog = await withConnection(connection, (client) =>
      introspect(client, connection.database, { schema })
    );

    return json({
      ...catalog,
      governance: computeGovernance(catalog),
      // Mirrors the OpenMetadata list shape so existing views render unchanged.
      data: catalog.tables,
      paging: { total: catalog.tables.length },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
