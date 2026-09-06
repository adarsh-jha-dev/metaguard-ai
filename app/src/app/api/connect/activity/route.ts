import { withConnection } from "@/lib/db/connect";
import { readActivity } from "@/lib/db/activity";
import { summarizeDatabaseActivity } from "@/lib/gemini";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * What has actually been happening to a connected database, read from its own
 * statistics views: writes, bloat, maintenance, tables created. Pass
 * `summary: true` to have Gemini read the feed back as prose.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);
    const schema = typeof body.schema === "string" && body.schema ? body.schema : connection.schema;
    const wantSummary = body.summary === true;

    const report = await withConnection(connection, (client) =>
      readActivity(client, connection.database, schema)
    );

    let aiSummary: string | undefined;
    let aiError: string | undefined;
    if (wantSummary && report.events.length > 0) {
      if (!process.env.GEMINI_API_KEY) {
        aiError = "The activity summary needs a GEMINI_API_KEY on the server.";
      } else {
        try {
          aiSummary = await summarizeDatabaseActivity(
            connection.database,
            connection.dialect,
            report.events.map((e) => ({
              type: e.type,
              table: e.displayName,
              detail: e.detail,
              severity: e.severity,
            }))
          );
        } catch {
          aiError = "Gemini could not summarise this activity.";
        }
      }
    }

    return json({ ...report, database: connection.database, dialect: connection.dialect, aiSummary, aiError });
  } catch (e) {
    return errorResponse(e);
  }
}
