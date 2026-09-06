import { ConnectionError, withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { buildGlossary } from "@/lib/db/glossary";
import { suggestGlossaryTerms } from "@/lib/gemini";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Suggestion = { column: string; suggestedTerms: { name: string; fqn: string; reason: string }[] };

/**
 * Suggests which derived glossary terms belong on which column of one table.
 *
 * The candidate terms are rebuilt from the live schema here rather than taken
 * from the request, so a stale or edited client payload cannot put terms in
 * front of the model that the database never produced.
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
    if (!table) throw new ConnectionError("Which table? Provide a schema and table name.");
    if (!process.env.GEMINI_API_KEY) {
      return json({ error: "Term suggestions need a GEMINI_API_KEY on the server." }, 503);
    }

    const catalog = await withConnection(connection, (client) =>
      introspect(client, connection.database, { schema: schema || connection.schema })
    );

    const target = catalog.tables.find(
      (t) => t.fullyQualifiedName === fqn || (t.name === table && (!schema || t.schema === schema))
    );
    if (!target) {
      throw new ConnectionError(`Table "${table}" was not found, or this user cannot read it.`);
    }

    const { glossaries } = buildGlossary(catalog);
    const terms = glossaries.flatMap((g) => g.terms);
    if (terms.length === 0) {
      return json({ suggestions: [], message: "No glossary terms could be derived from this schema." });
    }

    // The table's own entity term describes the table itself, not its columns.
    const candidates = terms
      .filter((t) => !(t.kind === "entity" && t.usedIn[0] === target.fullyQualifiedName))
      .map((t) => ({ name: t.name, fqn: t.fqn, description: t.description }));

    const suggestions = (await suggestGlossaryTerms(
      target.name,
      target.columns.map((c) => ({
        name: c.name,
        dataType: c.dataType,
        description: c.description || undefined,
      })),
      candidates
    )) as Suggestion[];

    // The model occasionally invents an FQN; drop anything not in the glossary.
    const known = new Map(terms.map((t) => [t.fqn, t]));
    const columns = new Set(target.columns.map((c) => c.name));
    const cleaned = (Array.isArray(suggestions) ? suggestions : [])
      .filter((s) => s?.column && columns.has(s.column))
      .map((s) => ({
        column: s.column,
        suggestedTerms: (s.suggestedTerms ?? [])
          .filter((t) => known.has(t?.fqn))
          .map((t) => ({ ...t, name: known.get(t.fqn)!.name })),
      }))
      .filter((s) => s.suggestedTerms.length > 0);

    return json({
      table: target.name,
      schema: target.schema,
      fqn: target.fullyQualifiedName,
      suggestions: cleaned,
      termsConsidered: candidates.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
