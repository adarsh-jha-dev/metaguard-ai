"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  GitFork,
  Search,
  ArrowRight,
  Database,
  Eye,
  AlertTriangle,
  Link2Off,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { SourcePill, formatCount } from "@/components/source-pill";

type Node = {
  id: string;
  name: string;
  schema: string;
  type: "TABLE" | "VIEW";
  columns: number;
  approxRows: number;
};

type Edge = { from: string; to: string; fromColumn: string; toColumn: string; label: string };

type LineageResponse = {
  nodes: Node[];
  edges: Edge[];
  focus: string | null;
  traversal: { upstream: string[][]; downstream: string[][] } | null;
};

/**
 * Lineage for a connected database, derived from declared foreign keys.
 * "Upstream" means the tables a table depends on; "downstream" means the tables
 * that would break if it went away.
 */
export default function LiveLineage() {
  const { connection, call } = useConnection();

  const [graph, setGraph] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    call<LineageResponse>("/api/connect/lineage", { schema: connection?.schema })
      .then((data) => {
        if (cancelled) return;
        setGraph(data);
        // Open on the most connected table — usually the heart of the schema.
        const degree = new Map<string, number>();
        for (const e of data.edges) {
          degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
          degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
        }
        const hub = [...degree.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        setFocus(hub ?? data.nodes[0]?.id ?? null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not read relationships."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [call, connection?.schema]);

  const nodeById = useMemo(
    () => new Map((graph?.nodes ?? []).map((n) => [n.id, n])),
    [graph]
  );

  const { upstream, downstream } = useMemo(() => {
    if (!graph || !focus) return { upstream: [] as string[][], downstream: [] as string[][] };
    const up = new Map<string, Set<string>>();
    const down = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!up.has(e.from)) up.set(e.from, new Set());
      up.get(e.from)!.add(e.to);
      if (!down.has(e.to)) down.set(e.to, new Set());
      down.get(e.to)!.add(e.from);
    }
    return { upstream: walk(focus, up), downstream: walk(focus, down) };
  }, [graph, focus]);

  const visibleNodes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const nodes = graph?.nodes ?? [];
    if (!q) return nodes;
    return nodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [graph, filter]);

  const focusEdges = useMemo(
    () => (graph?.edges ?? []).filter((e) => e.from === focus || e.to === focus),
    [graph, focus]
  );

  const focusNode = focus ? nodeById.get(focus) : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <GitFork className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold">Lineage</h1>
            <SourcePill live label={connection?.database} />
          </div>
          <p className="text-zinc-400 max-w-3xl">
            Built from your foreign keys. Pick a table to see what it depends on, and what would break
            if you dropped it.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 py-20 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Reading relationships…
          </div>
        )}

        {error && (
          <Card className="p-4 bg-red-500/5 border-red-500/20">
            <p className="text-sm text-red-300">{error}</p>
          </Card>
        )}

        {graph && !loading && graph.edges.length === 0 && (
          <Card className="p-6 bg-zinc-900 border-zinc-800 mb-6">
            <div className="flex items-start gap-3">
              <Link2Off className="w-5 h-5 text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm text-zinc-200 font-medium">No foreign keys declared</p>
                <p className="text-xs text-zinc-500 mt-1 max-w-2xl">
                  {graph.nodes.length} tables, none of them linked by a foreign key constraint. That is
                  itself a governance finding: without declared relationships, nothing — not MetaGuard,
                  not your ORM, not the next engineer — can tell how these tables relate.
                </p>
              </div>
            </div>
          </Card>
        )}

        {graph && !loading && graph.edges.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Table picker */}
            <div className="lg:col-span-1">
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter tables…"
                  className="bg-zinc-900 border-zinc-800 pl-9 h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                {visibleNodes.map((n) => {
                  const connections = graph.edges.filter((e) => e.from === n.id || e.to === n.id).length;
                  return (
                    <button
                      key={n.id}
                      onClick={() => setFocus(n.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        focus === n.id
                          ? "bg-blue-500/10 border-blue-500/40"
                          : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-zinc-200 truncate font-mono">{n.name}</span>
                        <span className="text-[10px] text-zinc-600 shrink-0">{connections} links</span>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {n.type === "VIEW" ? "view · " : ""}
                        {n.columns} cols
                        {n.approxRows ? ` · ~${formatCount(n.approxRows)} rows` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Graph */}
            <div className="lg:col-span-2 space-y-6">
              {focusNode && (
                <>
                  <Column
                    title="Upstream — what this table depends on"
                    empty="Nothing. This table stands alone."
                    levels={upstream}
                    nodeById={nodeById}
                    direction="up"
                  />

                  <Card className="p-5 border-blue-500/40 bg-blue-500/5">
                    <div className="flex items-center gap-2 mb-1">
                      {focusNode.type === "VIEW" ? (
                        <Eye className="w-4 h-4 text-blue-300" />
                      ) : (
                        <Database className="w-4 h-4 text-blue-300" />
                      )}
                      <p className="font-mono text-sm text-zinc-100">{focusNode.name}</p>
                      <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-[10px]">
                        {focusNode.schema}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {focusNode.columns} columns
                      {focusNode.approxRows ? ` · ~${formatCount(focusNode.approxRows)} rows` : ""}
                    </p>

                    {focusEdges.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-500/20 space-y-1">
                        {focusEdges.slice(0, 8).map((e, i) => (
                          <p key={i} className="text-[11px] text-zinc-500 font-mono">
                            {nodeById.get(e.from)?.name ?? e.from}.{e.fromColumn}
                            <ArrowRight className="w-3 h-3 inline mx-1.5 text-zinc-700" />
                            {nodeById.get(e.to)?.name ?? e.to}.{e.toColumn}
                          </p>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Column
                    title="Downstream — what breaks if this goes away"
                    empty="Nothing depends on this table."
                    levels={downstream}
                    nodeById={nodeById}
                    direction="down"
                  />

                  {downstream.flat().length > 0 && (
                    <Card className="p-4 border-amber-500/20 bg-amber-500/5">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-zinc-400">
                          Dropping <span className="font-mono text-zinc-200">{focusNode.name}</span>{" "}
                          would affect{" "}
                          <span className="text-amber-300">
                            {downstream.flat().length} downstream table
                            {downstream.flat().length === 1 ? "" : "s"}
                          </span>
                          .
                        </p>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  empty,
  levels,
  nodeById,
  direction,
}: {
  title: string;
  empty: string;
  levels: string[][];
  nodeById: Map<string, Node>;
  direction: "up" | "down";
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{title}</p>
      {levels.length === 0 ? (
        <p className="text-xs text-zinc-600">{empty}</p>
      ) : (
        <div className="space-y-2">
          {levels.map((level, depth) => (
            <div key={depth} className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-zinc-700 w-12 shrink-0">
                {direction === "up" ? "−" : "+"}
                {depth + 1} hop
              </span>
              {level.map((id) => (
                <span
                  key={id}
                  className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300"
                >
                  {nodeById.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Breadth-first walk, one array of node ids per hop. */
function walk(start: string, graph: Map<string, Set<string>>, depth = 3): string[][] {
  const seen = new Set([start]);
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
