"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitFork, Search, ArrowRight, Database, LayoutDashboard, Workflow, Radio } from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import LiveLineage from "./live-lineage";

type LineageNode = {
  id: string;
  name: string;
  fqn: string;
  type: string;
  isRoot: boolean;
};

type LineageEdge = {
  fromId: string;
  fromFqn: string;
  toId: string;
  toFqn: string;
};

const ENTITY_TYPES = ["table", "dashboard", "pipeline", "topic"] as const;

const typeIcon = (t: string) => {
  switch (t) {
    case "table": return <Database className="w-3.5 h-3.5" />;
    case "dashboard": return <LayoutDashboard className="w-3.5 h-3.5" />;
    case "pipeline": return <Workflow className="w-3.5 h-3.5" />;
    case "topic": return <Radio className="w-3.5 h-3.5" />;
    default: return <Database className="w-3.5 h-3.5" />;
  }
};

const typeColor = (t: string) => {
  switch (t) {
    case "table": return "border-blue-500/40 text-blue-300 bg-blue-500/5";
    case "dashboard": return "border-purple-500/40 text-purple-300 bg-purple-500/5";
    case "pipeline": return "border-orange-500/40 text-orange-300 bg-orange-500/5";
    case "topic": return "border-cyan-500/40 text-cyan-300 bg-cyan-500/5";
    default: return "border-zinc-700 text-zinc-400 bg-zinc-800";
  }
};

export default function LineagePage() {
  const { connection } = useConnection();
  if (connection) return <LiveLineage />;
  return <OpenMetadataLineage />;
}

function OpenMetadataLineage() {
  const [fqn, setFqn] = useState("");
  const [entityType, setEntityType] = useState<string>("table");
  const [nodes, setNodes] = useState<LineageNode[]>([]);
  const [edges, setEdges] = useState<LineageEdge[]>([]);
  const [root, setRoot] = useState<LineageNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Populate with a default table FQN on first load
  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((d) => {
        const first = d.data?.[0];
        if (first?.fullyQualifiedName) setFqn(first.fullyQualifiedName);
      })
      .catch(() => {});
  }, []);

  const fetchLineage = async () => {
    if (!fqn.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`/api/lineage?fqn=${encodeURIComponent(fqn)}&type=${entityType}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setRoot(data.root || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setNodes([]);
      setEdges([]);
    } finally {
      setLoading(false);
    }
  };

  // Partition nodes into upstream / root / downstream
  const rootNode = nodes.find((n) => n.isRoot) || root;
  const upstreamIds = new Set(edges.filter((e) => e.toId === rootNode?.id).map((e) => e.fromId));
  const downstreamIds = new Set(edges.filter((e) => e.fromId === rootNode?.id).map((e) => e.toId));

  const upstream = nodes.filter((n) => upstreamIds.has(n.id));
  const downstream = nodes.filter((n) => downstreamIds.has(n.id));

  const NodeCard = ({ node }: { node: LineageNode }) => (
    <div className={`rounded-lg border p-3 ${node.isRoot ? "border-emerald-500/50 bg-emerald-500/5" : typeColor(node.type)} min-w-[160px] max-w-[200px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={node.isRoot ? "text-emerald-400" : ""}>{typeIcon(node.type)}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 ${node.isRoot ? "border-emerald-500/30 text-emerald-400" : typeColor(node.type)}`}>
          {node.type}
        </Badge>
      </div>
      <p className="text-xs font-medium text-zinc-200 break-all leading-tight">{node.name || node.fqn?.split(".").pop()}</p>
      {node.fqn && node.fqn !== node.name && (
        <p className="text-[10px] text-zinc-600 mt-0.5 break-all leading-tight">{node.fqn}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <GitFork className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold">Lineage Explorer</h1>
          </div>
          <p className="text-zinc-400">
            Explore upstream and downstream data dependencies for any asset in your catalog.
          </p>
        </div>

        {/* Search */}
        <Card className="p-4 border-zinc-800 bg-zinc-900 mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setEntityType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    entityType === t
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex flex-1 gap-2">
              <Input
                value={fqn}
                onChange={(e) => setFqn(e.target.value)}
                placeholder="Enter fully qualified name, e.g. sample_data.ecommerce_db.shopify.customers"
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600"
                onKeyDown={(e) => e.key === "Enter" && fetchLineage()}
              />
              <Button onClick={fetchLineage} disabled={loading || !fqn.trim()} className="bg-blue-600 hover:bg-blue-700 shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Lineage Graph */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        )}

        {error && (
          <Card className="p-6 border-zinc-800 bg-zinc-900 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-zinc-600 text-xs mt-1">Check that the FQN is correct and the entity exists in OpenMetadata.</p>
          </Card>
        )}

        {!loading && !error && searched && (
          <>
            {nodes.length === 0 ? (
              <Card className="p-10 border-zinc-800 bg-zinc-900 text-center text-zinc-500">
                <GitFork className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No lineage data found for this entity.</p>
                <p className="text-xs mt-1">Make sure lineage has been ingested in OpenMetadata.</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Stats */}
                <div className="flex gap-4 text-sm text-zinc-400">
                  <span>{upstream.length} upstream</span>
                  <span className="text-zinc-700">·</span>
                  <span>{downstream.length} downstream</span>
                  <span className="text-zinc-700">·</span>
                  <span>{edges.length} edges</span>
                </div>

                {/* Visual Flow */}
                <Card className="p-6 border-zinc-800 bg-zinc-900 overflow-x-auto">
                  <div className="flex items-start gap-6 min-w-max">
                    {/* Upstream column */}
                    <div className="flex flex-col gap-3">
                      {upstream.length > 0 ? (
                        <>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Upstream</p>
                          {upstream.map((n) => <NodeCard key={n.id} node={n} />)}
                        </>
                      ) : (
                        <div className="flex items-center justify-center w-40 h-16 text-zinc-700 text-xs">
                          No upstream
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    {upstream.length > 0 && (
                      <div className="flex items-center self-center">
                        <ArrowRight className="w-5 h-5 text-zinc-600" />
                      </div>
                    )}

                    {/* Root */}
                    {rootNode && (
                      <div className="flex flex-col gap-2 self-center">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Root</p>
                        <NodeCard node={{ ...rootNode, isRoot: true }} />
                      </div>
                    )}

                    {/* Arrow */}
                    {downstream.length > 0 && (
                      <div className="flex items-center self-center">
                        <ArrowRight className="w-5 h-5 text-zinc-600" />
                      </div>
                    )}

                    {/* Downstream column */}
                    {downstream.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Downstream</p>
                        {downstream.map((n) => <NodeCard key={n.id} node={n} />)}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Edge Table */}
                {edges.length > 0 && (
                  <Card className="p-5 border-zinc-800 bg-zinc-900">
                    <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Lineage Edges</h3>
                    <div className="space-y-2">
                      {edges.map((e, i) => {
                        const fromNode = nodes.find((n) => n.id === e.fromId);
                        const toNode = nodes.find((n) => n.id === e.toId);
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/50 rounded px-3 py-2">
                            <span className="font-mono text-zinc-300 truncate max-w-[200px]">
                              {fromNode?.name || e.fromFqn?.split(".").pop() || e.fromId}
                            </span>
                            <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                            <span className="font-mono text-zinc-300 truncate max-w-[200px]">
                              {toNode?.name || e.toFqn?.split(".").pop() || e.toId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </>
        )}

        {!searched && !loading && (
          <div className="text-center py-16 text-zinc-600">
            <GitFork className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Enter a fully qualified name above and click Search to explore lineage.</p>
          </div>
        )}
      </div>
    </div>
  );
}
