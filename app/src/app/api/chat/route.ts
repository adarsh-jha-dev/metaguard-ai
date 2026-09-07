import { GoogleGenerativeAI } from "@google/generative-ai";
import { getTables, getTableByFqn, getLineage, searchTables } from "@/lib/openmetadata";
import { DEMO_TABLES } from "@/lib/demo-data";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/** Keyword search over the bundled catalog, for when OpenMetadata isn't reachable. */
function searchDemoTables(query: string) {
  const q = query.trim().toLowerCase();
  const matches = DEMO_TABLES.data.filter((t) => {
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.columns.some(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.tags?.some((tag) => tag.tagFQN.toLowerCase().includes(q))
      )
    );
  });
  // Tags are the point of most searches here ("which tables have PII?"), so
  // they travel with the columns rather than being summarised away.
  return (matches.length > 0 ? matches : DEMO_TABLES.data).map((t) => ({
    name: t.name,
    fqn: t.fullyQualifiedName,
    description: t.description,
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.dataType,
      tags: c.tags?.map((tag) => tag.tagFQN) ?? [],
    })),
  }));
}

async function executeQuery(intent: string, query: string) {
  try {
    if (intent === "search") {
      try {
        const results = await searchTables(query);
        const hits = results.hits?.hits?.map((h: { _source: unknown }) => h._source) || [];
        if (hits.length > 0) return JSON.stringify(hits);
      } catch { /* fall through to demo */ }
      return JSON.stringify(searchDemoTables(query));
    }
    if (intent === "list_tables") {
      try {
        const data = await getTables(50);
        if (data.data && data.data.length > 0) {
          return JSON.stringify(data.data.map((t: { name: string; fullyQualifiedName: string; description: string; columns: { name: string }[] }) => ({
            name: t.name, fqn: t.fullyQualifiedName, description: t.description,
            columnCount: t.columns?.length || 0, columns: t.columns?.map((c: { name: string }) => c.name) || [],
          })));
        }
      } catch { /* fall through to demo */ }
      return JSON.stringify(DEMO_TABLES.data.map((t) => ({
        name: t.name, fqn: t.fullyQualifiedName, description: t.description,
        columnCount: t.columns.length, columns: t.columns.map((c) => c.name),
      })));
    }
    if (intent === "table_details") {
      try {
        const table = await getTableByFqn(query);
        return JSON.stringify({
          name: table.name, fqn: table.fullyQualifiedName, description: table.description,
          columns: table.columns?.map((c: { name: string; dataType: string; description: string; tags: { tagFQN: string }[] }) => ({
            name: c.name, type: c.dataType, description: c.description,
            tags: c.tags?.map((t: { tagFQN: string }) => t.tagFQN) || [],
          })),
        });
      } catch {
        const demoTable = DEMO_TABLES.data.find((t) => t.fullyQualifiedName === query || t.name === query.split(".").pop());
        if (demoTable) {
          return JSON.stringify({
            name: demoTable.name, fqn: demoTable.fullyQualifiedName, description: demoTable.description,
            columns: demoTable.columns.map((c) => ({
              name: c.name, type: c.dataType, description: c.description,
              tags: c.tags.map((t) => t.tagFQN),
            })),
          });
        }
      }
    }
    if (intent === "lineage") {
      try {
        const lineage = await getLineage(query);
        return JSON.stringify(lineage);
      } catch {
        return JSON.stringify({ message: "Lineage data unavailable in demo mode. In production, this shows upstream and downstream table dependencies." });
      }
    }
  } catch {
    return JSON.stringify({ error: "Query failed" });
  }
  return "[]";
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const planResult = await model.generateContent(`You are a metadata assistant for OpenMetadata. Given the user's question, decide what data to fetch.

Available intents:
- "list_tables" — list all tables (query: "")
- "table_details" — get details of a specific table (query: the table FQN like "sample_data.ecommerce_db.shopify.customers")
- "search" — search tables by keyword (query: search term)
- "lineage" — get lineage for a table (query: the table FQN)

Our database has these tables:
- sample_data.ecommerce_db.shopify.customers (customer PII, contact info, loyalty)
- sample_data.ecommerce_db.shopify.orders (order transactions, shipping, payments)
- sample_data.ecommerce_db.shopify.employees (employee records, payroll, tax info)
- sample_data.ecommerce_db.shopify.products (product catalog, pricing, inventory)
- sample_data.ecommerce_db.shopify.payments (payment transactions, card details, billing)

User question: "${message}"

Respond ONLY with JSON, no markdown:
{"intent": "one_of_the_intents", "query": "the query parameter"}`);

    const planText = planResult.response.text();
    const planMatch = planText.match(/\{[\s\S]*\}/);
    if (!planMatch) throw new Error("Could not parse plan");
    const plan = JSON.parse(planMatch[0]);

    const data = await executeQuery(plan.intent, plan.query);

    const answerResult = await model.generateContent(`You are MetaGuard AI, a friendly data governance assistant. Answer the user's question using the metadata below.

Rules:
- Be concise and helpful
- Format column lists as clean tables when relevant
- Mention specific PII tags if present
- If data shows issues (missing descriptions, untagged PII), flag them
- Use markdown for formatting

User question: "${message}"

Metadata from OpenMetadata:
${data}

Answer:`);

    const answer = answerResult.response.text();

    return NextResponse.json({
      answer,
      intent: plan.intent,
      query: plan.query,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Chat error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}