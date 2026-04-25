import { GoogleGenerativeAI } from "@google/generative-ai";
import { getTables, getTableByFqn, getLineage, searchTables } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function executeQuery(intent: string, query: string) {
  try {
    if (intent === "search") {
      const results = await searchTables(query);
      return JSON.stringify(results.hits?.hits?.map((h: { _source: unknown }) => h._source) || []);
    }
    if (intent === "list_tables") {
      const data = await getTables(50);
      return JSON.stringify(data.data?.map((t: { name: string; fullyQualifiedName: string; description: string; columns: { name: string }[] }) => ({
        name: t.name,
        fqn: t.fullyQualifiedName,
        description: t.description,
        columnCount: t.columns?.length || 0,
        columns: t.columns?.map((c: { name: string }) => c.name) || [],
      })) || []);
    }
    if (intent === "table_details") {
      const table = await getTableByFqn(query);
      return JSON.stringify({
        name: table.name,
        fqn: table.fullyQualifiedName,
        description: table.description,
        columns: table.columns?.map((c: { name: string; dataType: string; description: string; tags: { tagFQN: string }[] }) => ({
          name: c.name,
          type: c.dataType,
          description: c.description,
          tags: c.tags?.map((t: { tagFQN: string }) => t.tagFQN) || [],
        })),
      });
    }
    if (intent === "lineage") {
      const lineage = await getLineage(query);
      return JSON.stringify(lineage);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Query failed";
    return JSON.stringify({ error: message });
  }
  return "[]";
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Step 1: Ask LLM to decide what data to fetch
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

User question: "${message}"

Respond ONLY with JSON, no markdown:
{"intent": "one_of_the_intents", "query": "the query parameter"}`);

    const planText = planResult.response.text();
    const planMatch = planText.match(/\{[\s\S]*\}/);
    if (!planMatch) throw new Error("Could not parse plan");
    const plan = JSON.parse(planMatch[0]);

    // Step 2: Execute the query
    const data = await executeQuery(plan.intent, plan.query);

    // Step 3: Ask LLM to answer the question using the data
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