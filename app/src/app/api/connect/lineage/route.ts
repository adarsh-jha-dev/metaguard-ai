import { withConnection } from "@/lib/db/connect";
import { introspect } from "@/lib/db/introspect";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Builds a lineage graph from declared foreign keys. A raw database has no ETL
 * lineage to read, but its referential constraints describe real dependencies:
 * if `orders.customer_id` references `customers.id`, dropping `customers`
 * breaks `orders`.
 */
export async function POST(req: Request) {
  try {
    const { connection, body } = await readConnection(req);
    const focus = typeof body.fqn === "string" ? body.fqn : undefined;
    const depth = Math.min(Math.max(Number(body.depth ?? 3) || 3, 1), 5);
    const schema = typeof body.schema === "string" && body.schema ? body.schema : connection.schema;

    const catalog = await withConnection(connection, (client) =>
      introspect(client, connection.database, { schema })
    );

    const upstream = new Map<string, Set<string>>(); // table -> tables it depends on
    const downstream = new Map<string, Set<string>>(); // table -> tables depending on it
    for (const fk of catalog.foreignKeys) {
      if (!upstream.has(fk.fromTable)) upstream.set(fk.fromTable, new Set());
      upstream.get(fk.fromTable)!.add(fk.toTable);
      if (!downstream.has(fk.toTable)) downstream.set(fk.toTable, new Set());
      downstream.get(fk.toTable)!.add(fk.fromTable);
    }

    const nodes = catalog.tables.map((t) => ({
      id: t.fullyQualifiedName,
      name: t.name,
      schema: t.schema,
      type: t.tableType,
      columns: t.columns.length,
      approxRows: t.approxRows,
    }));

    const edges = catalog.foreignKeys.map((fk) => ({
      from: fk.fromTable,
      to: fk.toTable,
      fromColumn: fk.fromColumn,
      toColumn: fk.toColumn,
      label: `${fk.fromColumn} → ${fk.toColumn}`,
    }));

    let traversal: { upstream: string[][]; downstream: string[][] } | null = null;
    if (focus) {
      traversal = {
        upstream: walk(focus, upstream, depth),
        downstream: walk(focus, downstream, depth),
      };
    }

    return json({ nodes, edges, focus: focus ?? null, traversal, depth });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Breadth-first walk returning one array of table FQNs per hop. */
function walk(start: string, graph: Map<string, Set<string>>, depth: number): string[][] {
  const seen = new Set<string>([start]);
  const levels: string[][] = [];
  let frontier = [start];

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbour of graph.get(node) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    if (next.length === 0) break;
    levels.push(next);
    frontier = next;
  }

  return levels;
}
