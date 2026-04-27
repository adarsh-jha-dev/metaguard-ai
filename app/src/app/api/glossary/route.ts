import { getGlossaries, getGlossaryTerms } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [glossariesData, termsData] = await Promise.all([
      getGlossaries(50).catch(() => ({ data: [] })),
      getGlossaryTerms(200).catch(() => ({ data: [] })),
    ]);

    const glossaries: Record<string, unknown>[] = glossariesData.data || [];
    const terms: Record<string, unknown>[] = termsData.data || [];

    // Attach terms to their parent glossary
    const enriched = glossaries.map((g) => {
      const gFqn = g.fullyQualifiedName as string;
      const gTerms = terms.filter((t) => {
        const gl = t.glossary as Record<string, unknown> | undefined;
        return gl?.fullyQualifiedName === gFqn || gl?.name === g.name;
      });
      return {
        id: g.id,
        name: g.name,
        fqn: gFqn,
        description: g.description,
        termCount: gTerms.length,
        terms: gTerms.map((t) => ({
          id: t.id,
          name: t.name,
          fqn: t.fullyQualifiedName,
          description: t.description,
        })),
      };
    });

    return NextResponse.json({
      glossaries: enriched,
      allTerms: terms.map((t) => ({
        id: t.id,
        name: t.name,
        fqn: t.fullyQualifiedName,
        description: t.description,
      })),
      stats: {
        totalGlossaries: glossaries.length,
        totalTerms: terms.length,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
