import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function classifyColumns(
  tableName: string,
  columns: { name: string; dataType: string; description?: string }[]
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a PII (Personally Identifiable Information) classification agent.
Given these columns from the table "${tableName}", classify each column as one of:
- "PII.Sensitive" — directly identifies a person (name, email, SSN, phone, credit card, address, DOB, IP address, bank account, tax ID, salary)
- "PII.NonSensitive" — indirectly related to a person but not directly identifying (city, country, department, status, payment method)
- "NotPII" — no personal information (IDs, counts, totals, timestamps, booleans, amounts)

Columns:
${columns.map((c) => `- ${c.name} (${c.dataType})${c.description ? ` — ${c.description}` : ""}`).join("\n")}

Respond ONLY with a valid JSON array, no markdown, no backticks, no explanation:
[{"column": "column_name", "classification": "PII.Sensitive", "confidence": 0.95, "reason": "short reason"}]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");
  return JSON.parse(jsonMatch[0]);
}

export async function analyzeFailingTests(
  failingTests: Array<{
    name: string;
    table: string;
    column?: string;
    testType: string;
    lastResult?: string;
    description?: string;
  }>
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a data quality expert analyzing failing tests in a data platform.

Given these failing data quality tests, provide actionable insights about what might be causing each failure and how to fix it.

Failing tests:
${failingTests
  .map(
    (t) =>
      `- Test: "${t.name}" on ${t.table}${t.column ? `.${t.column}` : ""} (type: ${t.testType})${
        t.lastResult ? `, last result: ${t.lastResult}` : ""
      }${t.description ? `, description: ${t.description}` : ""}`
  )
  .join("\n")}

Respond ONLY with a valid JSON array, no markdown, no backticks:
[{"testName": "...", "likelyCause": "...", "suggestedFix": "...", "severity": "high|medium|low"}]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");
  return JSON.parse(jsonMatch[0]);
}

export async function suggestGlossaryTerms(
  tableName: string,
  columns: Array<{ name: string; dataType: string; description?: string }>,
  availableTerms: Array<{ name: string; description?: string; fqn: string }>
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a data governance expert. Given a table's columns and a list of available glossary terms, suggest the most relevant terms to link to each column.

Table: "${tableName}"

Columns:
${columns.map((c) => `- ${c.name} (${c.dataType})${c.description ? `: ${c.description}` : ""}`).join("\n")}

Available glossary terms (max 50 shown):
${availableTerms
  .slice(0, 50)
  .map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""} [FQN: ${t.fqn}]`)
  .join("\n")}

For each column, suggest 0-2 glossary terms that should be linked to it. Only suggest terms that are clearly relevant. Skip columns where no term applies.

Respond ONLY with a valid JSON array, no markdown, no backticks:
[{"column": "column_name", "suggestedTerms": [{"name": "...", "fqn": "...", "reason": "one sentence reason"}]}]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");
  return JSON.parse(jsonMatch[0]);
}

export async function summarizeActivity(
  events: Array<{
    entityType: string;
    eventType: string;
    entityName: string;
    timestamp?: string;
    user?: string;
  }>
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a data governance assistant. Summarize the following recent activity events from a metadata platform.

Events:
${events
  .slice(0, 30)
  .map(
    (e) =>
      `- ${e.eventType} on ${e.entityType} "${e.entityName}"${e.user ? ` by ${e.user}` : ""}${
        e.timestamp ? ` at ${e.timestamp}` : ""
      }`
  )
  .join("\n")}

Write a brief, professional summary (2-4 sentences) highlighting key governance-relevant changes such as new tags, schema changes, quality test failures, and ownership changes. Use plain prose, no bullet points.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * Writes business definitions for glossary terms derived from a live schema.
 *
 * Only names, types and the tables a term came from are sent — the same
 * structure-only contract the rest of the connected-database features keep.
 */
export async function defineGlossaryTerms(
  database: string,
  terms: Array<{ fqn: string; name: string; kind: "entity" | "attribute"; context: string }>
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a data governance expert writing a business glossary for the database "${database}".

Write a one-sentence business definition for each term below. Definitions are read by analysts, not engineers: describe what the concept means to the business, not how it is stored. Never invent facts about the data's contents — you can only see structure.

Terms (with what each was derived from):
${terms.map((t) => `- [${t.fqn}] ${t.context}`).join("\n")}

Respond ONLY with a valid JSON array, no markdown, no backticks:
[{"fqn": "the fqn in brackets", "definition": "one sentence"}]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON in LLM response");
  return JSON.parse(jsonMatch[0]) as Array<{ fqn: string; definition: string }>;
}

/**
 * Summarizes what a connected database's own statistics say has been happening
 * to it. Distinct from summarizeActivity, which reads OpenMetadata's social
 * feed of conversations and tasks.
 */
export async function summarizeDatabaseActivity(
  database: string,
  dialect: string,
  events: Array<{ type: string; table: string; detail: string; severity: string }>
) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a database reliability engineer reviewing activity statistics for the ${dialect} database "${database}".

Observations (read from the database's own catalog and statistics views):
${events
  .slice(0, 40)
  .map((e) => `- [${e.severity}] ${e.type} on ${e.table}: ${e.detail}`)
  .join("\n")}

Write a brief, professional summary (3-5 sentences) covering where the write activity is concentrated, which tables need attention and why, and what a maintainer should look at first. Plain prose, no bullet points, no markdown headings. These are catalog statistics, not row data — do not speculate about what the data contains.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
