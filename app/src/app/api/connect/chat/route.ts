import { GoogleGenerativeAI } from "@google/generative-ai";
import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { computeGovernance } from "@/lib/db/insights";
import { classifyByName } from "@/lib/db/classify";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";
import type { Catalog, TableMeta } from "@/lib/db/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rough character budget for the schema we paste into the prompt. */
const DIGEST_BUDGET = 24_000;

/**
 * Natural-language questions answered against a live schema.
 *
 * Only structure is sent to Gemini — table names, column names and types,
 * comments, and foreign keys. Never a row, never the connection details.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return json({ error: "message required" }, 400);
    if (!process.env.GEMINI_API_KEY) {
      return json({ error: "Chat needs a GEMINI_API_KEY on the server." }, 503);
    }

    const catalog = await withConnection(connection, (client) =>
      introspect(client, connection.database, { schema: connection.schema })
    );

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let tables = catalog.tables;
    let narrowed = false;

    // On a large schema, ask the model which tables matter before pasting them all.
    if (buildDigest(catalog, tables).length > DIGEST_BUDGET) {
      const index = tables
        .map((t) => `${t.schema}.${t.name} (${t.columns.length} cols)${t.description ? ` — ${t.description.slice(0, 100)}` : ""}`)
        .join("\n");

      const pick = await model.generateContent(
        `A user asked a question about a database. From the table list, choose up to 15 tables whose full column definitions are needed to answer it.

User question: "${message}"

Tables:
${index.slice(0, 30_000)}

Respond ONLY with a JSON array of table names, e.g. ["public.orders","public.customers"]. No markdown.`
      );
      const match = pick.response.text().match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const wanted = new Set((JSON.parse(match[0]) as string[]).map((s) => s.toLowerCase()));
          const picked = tables.filter(
            (t) =>
              wanted.has(`${t.schema}.${t.name}`.toLowerCase()) || wanted.has(t.name.toLowerCase())
          );
          if (picked.length > 0) {
            tables = picked;
            narrowed = true;
          }
        } catch {
          /* fall back to the truncated digest */
        }
      }
    }

    const governance = computeGovernance(catalog);
    const digest = buildDigest(catalog, tables).slice(0, DIGEST_BUDGET);

    const answer = await model.generateContent(
      `You are MetaGuard AI, a data governance assistant. Answer the user's question using only the schema below.

Rules:
- Be concise. Use markdown; format column lists as tables when it helps.
- The [PII?] marker is a name-based heuristic flag, not a confirmed classification — say so if you rely on it.
- Flag governance problems you notice: undocumented tables, missing primary keys, columns that look like personal data.
- You are looking at structure only. You have not seen any row data, so never claim anything about actual values.
- If the schema does not contain the answer, say so plainly.

Database: ${connection.database} (${catalog.dialect})
Governance score: ${governance.score}/100 — ${governance.metrics.tablesWithDescription}/${governance.metrics.totalTables} tables documented, ${governance.metrics.tablesWithPrimaryKey}/${governance.metrics.totalTables} with a primary key.
${narrowed ? `Showing ${tables.length} of ${catalog.tables.length} tables, selected as relevant to this question.\n` : ""}
Schema:
${digest}

User question: "${message}"

Answer:`
    );

    return json({
      answer: answer.response.text(),
      tablesConsidered: tables.length,
      totalTables: catalog.tables.length,
      narrowed,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Compact text rendering of a schema, cheap in tokens and easy for the model to read. */
function buildDigest(catalog: Catalog, tables: TableMeta[]): string {
  const parts = tables.map((t) => {
    const header = `TABLE ${t.schema}.${t.name}${t.tableType === "VIEW" ? " (view)" : ""}${
      t.description ? ` -- ${t.description}` : ""
    }`;
    const cols = t.columns.map((c) => {
      const flags: string[] = [];
      if (c.isPrimaryKey) flags.push("PK");
      if (!c.nullable) flags.push("NOT NULL");
      if (classifyByName(c)?.classification === "PII.Sensitive") flags.push("PII?");
      return `  ${c.name} ${c.dataType}${flags.length ? ` [${flags.join(", ")}]` : ""}${
        c.description ? ` -- ${c.description}` : ""
      }`;
    });
    return [header, ...cols].join("\n");
  });

  const shown = new Set(tables.map((t) => t.fullyQualifiedName));
  const fks = catalog.foreignKeys
    .filter((fk) => shown.has(fk.fromTable) || shown.has(fk.toTable))
    .map((fk) => `${short(fk.fromTable)}.${fk.fromColumn} -> ${short(fk.toTable)}.${fk.toColumn}`);

  return [...parts, fks.length ? `\nFOREIGN KEYS\n${fks.join("\n")}` : ""].join("\n\n");
}

function short(fqn: string): string {
  return fqn.split(".").slice(-2).join(".");
}
