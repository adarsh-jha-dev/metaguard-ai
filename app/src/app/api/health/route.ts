import { getTables } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await getTables(100);
    const tables = data.data || [];

    const total = tables.length;
    if (total === 0) return NextResponse.json({ score: 0, metrics: {} });

    const withDescription = tables.filter((t: Record<string, unknown>) => t.description && t.description !== "").length;
    const withTags = tables.filter((t: Record<string, unknown>) => {
      const cols = (t.columns as Array<Record<string, unknown>>) || [];
      return cols.some((c) => ((c.tags as unknown[]) || []).length > 0);
    }).length;

    const totalColumns = tables.reduce((sum: number, t: Record<string, unknown>) => sum + ((t.columns as unknown[]) || []).length, 0);
    const taggedColumns = tables.reduce((sum: number, t: Record<string, unknown>) => {
      const cols = (t.columns as Array<Record<string, unknown>>) || [];
      return sum + cols.filter((c) => ((c.tags as unknown[]) || []).length > 0).length;
    }, 0);

    const descCoverage = (withDescription / total) * 100;
    const tagCoverage = totalColumns > 0 ? (taggedColumns / totalColumns) * 100 : 0;
    const tableLevelTagCoverage = (withTags / total) * 100;

    const score = Math.round(
      descCoverage * 0.35 +
      tagCoverage * 0.35 +
      tableLevelTagCoverage * 0.30
    );

    return NextResponse.json({
      score,
      metrics: {
        totalTables: total,
        descriptionCoverage: Math.round(descCoverage),
        tagCoverage: Math.round(tagCoverage),
        tableLevelTagCoverage: Math.round(tableLevelTagCoverage),
        totalColumns,
        taggedColumns,
        tablesWithDescription: withDescription,
        tablesWithTags: withTags,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}