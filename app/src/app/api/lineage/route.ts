import { getEntityLineage } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

const SUPPORTED_TYPES = ["table", "dashboard", "pipeline", "topic", "mlmodel", "container"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fqn = searchParams.get("fqn");
  const type = searchParams.get("type") || "table";

  if (!fqn) return NextResponse.json({ error: "fqn query param required" }, { status: 400 });
  if (!SUPPORTED_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${SUPPORTED_TYPES.join(", ")}` }, { status: 400 });
  }

  try {
    const lineage = await getEntityLineage(type, fqn);

    // Normalise into a simple graph structure for the UI
    const entity = lineage.entity || {};
    const nodes: Record<string, unknown>[] = lineage.nodes || [];
    const edges: Record<string, unknown>[] = lineage.edges || [];

    const allNodes = [entity, ...nodes].map((n) => ({
      id: n.id as string,
      name: n.name as string,
      fqn: n.fullyQualifiedName as string,
      type: n.type as string,
      isRoot: n.id === entity.id,
    }));

    const allEdges = edges.map((e) => {
      const from = e.fromEntity as Record<string, unknown>;
      const to = e.toEntity as Record<string, unknown>;
      return {
        fromId: from?.id as string,
        fromFqn: from?.fullyQualifiedName as string,
        toId: to?.id as string,
        toFqn: to?.fullyQualifiedName as string,
      };
    });

    return NextResponse.json({ nodes: allNodes, edges: allEdges, root: entity });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
