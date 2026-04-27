import { getTableByFqn, getGlossaryTerms } from "@/lib/openmetadata";
import { suggestGlossaryTerms } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { tableFqn } = await req.json();
    if (!tableFqn) return NextResponse.json({ error: "tableFqn required" }, { status: 400 });

    const [table, termsData] = await Promise.all([
      getTableByFqn(tableFqn),
      getGlossaryTerms(200).catch(() => ({ data: [] })),
    ]);

    const columns = (table.columns || []).map((c: Record<string, unknown>) => ({
      name: c.name as string,
      dataType: c.dataType as string,
      description: c.description as string | undefined,
    }));

    const availableTerms = (termsData.data || []).map((t: Record<string, unknown>) => ({
      name: t.name as string,
      fqn: t.fullyQualifiedName as string,
      description: t.description as string | undefined,
    }));

    if (availableTerms.length === 0) {
      return NextResponse.json({ suggestions: [], message: "No glossary terms found in OpenMetadata" });
    }

    const suggestions = await suggestGlossaryTerms(table.name, columns, availableTerms);

    return NextResponse.json({
      tableName: table.name,
      tableId: table.id,
      suggestions,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
