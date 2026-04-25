import { getTableByFqn } from "@/lib/openmetadata";
import { classifyColumns } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { fqn } = await req.json();
    if (!fqn) return NextResponse.json({ error: "fqn is required" }, { status: 400 });

    const table = await getTableByFqn(fqn);
    const columns = table.columns.map((col: unknown) => ({
      name: (col as { name: string }).name,
      dataType: (col as { dataType: string }).dataType,
      description: (col as { description?: string }).description || "",
    }));

    const classifications = await classifyColumns(table.fullyQualifiedName, columns);

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