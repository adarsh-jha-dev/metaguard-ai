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