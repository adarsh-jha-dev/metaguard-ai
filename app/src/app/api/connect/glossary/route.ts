import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { applyDefinitions, buildGlossary, describeTermContext } from "@/lib/db/glossary";
import { defineGlossaryTerms } from "@/lib/gemini";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Terms sent to Gemini in one enrichment pass. */
const MAX_DEFINED_TERMS = 60;

/**
 * Builds a business glossary out of a live schema.
 *
 * The glossary itself is derived deterministically from table and column names,
 * so this works with no AI key at all. Pass `enrich: true` to have Gemini write
 * definitions for the terms the database has no comment for.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);
    const schema = typeof body.schema === "string" && body.schema ? body.schema : connection.schema;
    const enrich = body.enrich === true;

    const catalog = await withConnection(connection, (client) =>
      introspect(client, connection.database, { schema })
    );

    let report = buildGlossary(catalog);
    let aiUsed = false;
    let aiError: string | undefined;

    if (enrich) {
      if (!process.env.GEMINI_API_KEY) {
        aiError = "Definitions need a GEMINI_API_KEY on the server.";
      } else {
        // Only undefined terms are worth a token — a real COMMENT always wins.
        const undefinedTerms = report.glossaries
          .flatMap((g) => g.terms)
          .filter((t) => !t.description)
          .slice(0, MAX_DEFINED_TERMS);

        if (undefinedTerms.length > 0) {
          try {
            const written = await defineGlossaryTerms(
              connection.database,
              undefinedTerms.map((t) => ({
                fqn: t.fqn,
                name: t.name,
                kind: t.kind,
                context: describeTermContext(t, catalog),
              }))
            );
            const byFqn = new Map(
              written
                .filter((d) => d?.fqn && typeof d.definition === "string")
                .map((d) => [d.fqn, d.definition.trim()])
            );
            report = applyDefinitions(report, byFqn);
            aiUsed = byFqn.size > 0;
          } catch {
            aiError = "Gemini could not write definitions for this schema.";
          }
        }
      }
    }

    return json({
      ...report,
      database: connection.database,
      dialect: catalog.dialect,
      totalTables: catalog.tables.length,
      aiUsed,
      aiError,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
