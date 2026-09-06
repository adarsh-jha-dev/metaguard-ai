import { analyzeFailingTests } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { failingTests } = await req.json();
    if (!failingTests?.length) {
      return NextResponse.json({ error: "failingTests array required" }, { status: 400 });
    }

    // Parse entityLink like "\"<#E::table::sample_data.ecommerce_db.shopify.orders::order_id>\""
    // to extract table and column names
    const parsed = failingTests.map((t: Record<string, unknown>) => {
      const link = t.entityLink as string | undefined;
      // Live-database checks already carry table/column; OpenMetadata tests
      // encode them in an entityLink that needs parsing.
      let table = (t.table as string) || "unknown";
      let column = t.column as string | undefined;
      if (link && table === "unknown") {
        const match = link.match(/::([\w.]+)(?:::([\w.]+))?>/);
        if (match) {
          table = match[1];
          column = match[2];
        }
      }
      return {
        name: (t.name as string) || "unnamed",
        table,
        column,
        testType: (t.testType as string) || "unknown",
        lastResult: t.lastResult as string | undefined,
        description: t.description as string | undefined,
      };
    });

    const analysis = await analyzeFailingTests(parsed);
    return NextResponse.json({ analysis });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
