import { getTableByFqn } from "@/lib/openmetadata";
import { classifyColumns } from "@/lib/gemini";
import { DEMO_TABLES, DEMO_SCAN_RESULTS } from "@/lib/demo-data";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { fqn } = await req.json();
    if (!fqn) return NextResponse.json({ error: "fqn is required" }, { status: 400 });

    let table;
    let classifications;

    try {
      table = await getTableByFqn(fqn);
      const columns = table.columns.map((col: { name: string; dataType: string; description?: string }) => ({
        name: col.name,
        dataType: col.dataType,
        description: col.description || "",
      }));
      classifications = await classifyColumns(table.fullyQualifiedName, columns);
    } catch {
      // Fallback to demo data
      const demoTable = DEMO_TABLES.data.find((t) => t.fullyQualifiedName === fqn);
      if (!demoTable) return NextResponse.json({ error: "Table not found" }, { status: 404 });

      table = demoTable;
      classifications = DEMO_SCAN_RESULTS[fqn];

      // If no pre-built scan results, generate generic ones
      if (!classifications) {
        classifications = demoTable.columns.map((col) => ({
          column: col.name,
          classification: col.tags.length > 0 ? col.tags[0].tagFQN : "NotPII",
          confidence: 0.93,
          reason: col.tags.length > 0 ? `${col.description} contains personal data` : "No personal information detected",
        }));
      }
    }

    return NextResponse.json({
      table: {
        id: table.id,
        name: table.name,
        fqn: table.fullyQualifiedName,
        columns: table.columns,
      },
      classifications,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}