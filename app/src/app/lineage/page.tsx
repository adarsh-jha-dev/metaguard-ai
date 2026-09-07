"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitFork, Search, ArrowRight, Database, LayoutDashboard, Workflow, Radio } from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import LiveLineage from "./live-lineage";
import { SampleCatalogNotice } from "@/components/sample-catalog-notice";

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
    case "table": return "border-hue-blue/40 text-hue-blue bg-hue-blue/5";
    case "dashboard": return "border-hue-purple/40 text-hue-purple bg-hue-purple/5";
    case "pipeline": return "border-hue-orange/40 text-hue-orange bg-hue-orange/5";
    case "topic": return "border-hue-cyan/40 text-hue-cyan bg-hue-cyan/5";
    default: return "border-border-strong text-muted-foreground bg-muted";
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
    <div className={`rounded-lg border p-3 ${node.isRoot ? "border-brand/50 bg-brand/5" : typeColor(node.type)} min-w-[160px] max-w-[200px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={node.isRoot ? "text-brand" : ""}>{typeIcon(node.type)}</span>
        <Badge variant="outline" className={`text-xs px-1 py-0 ${node.isRoot ? "border-brand/30 text-brand" : typeColor(node.type)}`}>
          {node.type}
        </Badge>
      </div>
      <p className="text-sm font-medium text-foreground break-all leading-tight">{node.name || node.fqn?.split(".").pop()}</p>
      {node.fqn && node.fqn !== node.name && (
        <p className="text-xs text-faint-foreground mt-0.5 break-all leading-tight">{node.fqn}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-hue-blue/10 border border-hue-blue/20">
              <GitFork className="w-5 h-5 text-hue-blue" />
            </div>
            <h1 className="text-3xl font-bold">Lineage Explorer</h1>
          </div>
          <p className="text-muted-foreground">
            Explore upstream and downstream data dependencies for any asset in your catalog.
          </p>
        </div>

        <SampleCatalogNotice>
          This graph comes from the sample catalog. Connect a database to map your own foreign keys
          and see what breaks before you drop a table.
        </SampleCatalogNotice>

        {/* Search */}
        <Card className="p-4 border-border bg-card mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setEntityType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    entityType === t
                      ? "bg-border-strong text-foreground"
                      : "text-muted-foreground hover:text-foreground-subtle hover:bg-muted"
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
                className="bg-muted border-border-strong text-foreground placeholder:text-faint-foreground"
                onKeyDown={(e) => e.key === "Enter" && fetchLineage()}
              />
              <Button onClick={fetchLineage} disabled={loading || !fqn.trim()} className="bg-hue-blue hover:bg-hue-blue/85 shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Lineage Graph */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="p-6 border-border bg-card text-center">
            <p className="text-critical text-base">{error}</p>
            <p className="text-faint-foreground text-sm mt-1">Check that the FQN is correct and the entity exists in OpenMetadata.</p>
          </Card>
        )}

        {!loading && !error && searched && (
          <>
            {nodes.length === 0 ? (
              <Card className="p-10 border-border bg-card text-center text-muted-foreground">
                <GitFork className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No lineage data found for this entity.</p>
                <p className="text-sm mt-1">Make sure lineage has been ingested in OpenMetadata.</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Stats */}
                <div className="flex gap-4 text-base text-muted-foreground">
                  <span>{upstream.length} upstream</span>
                  <span className="text-faint-foreground">·</span>
                  <span>{downstream.length} downstream</span>
                  <span className="text-faint-foreground">·</span>
                  <span>{edges.length} edges</span>
                </div>

                {/* Visual Flow */}
                <Card className="p-6 border-border bg-card overflow-x-auto">
                  <div className="flex items-start gap-6 min-w-max">
                    {/* Upstream column */}
                    <div className="flex flex-col gap-3">
                      {upstream.length > 0 ? (
                        <>
                          <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Upstream</p>
                          {upstream.map((n) => <NodeCard key={n.id} node={n} />)}
                        </>
                      ) : (
                        <div className="flex items-center justify-center w-40 h-16 text-faint-foreground text-sm">
                          No upstream
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    {upstream.length > 0 && (
                      <div className="flex items-center self-center">
                        <ArrowRight className="w-5 h-5 text-faint-foreground" />
                      </div>
                    )}

                    {/* Root */}
                    {rootNode && (
                      <div className="flex flex-col gap-2 self-center">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Root</p>
                        <NodeCard node={{ ...rootNode, isRoot: true }} />
                      </div>
                    )}

                    {/* Arrow */}
                    {downstream.length > 0 && (
                      <div className="flex items-center self-center">
                        <ArrowRight className="w-5 h-5 text-faint-foreground" />
                      </div>
                    )}

                    {/* Downstream column */}
                    {downstream.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Downstream</p>
                        {downstream.map((n) => <NodeCard key={n.id} node={n} />)}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Edge Table */}
                {edges.length > 0 && (
                  <Card className="p-5 border-border bg-card">
                    <h3 className="text-base font-medium text-muted-foreground uppercase tracking-wider mb-3">Lineage Edges</h3>
                    <div className="space-y-2">
                      {edges.map((e, i) => {
                        const fromNode = nodes.find((n) => n.id === e.fromId);
                        const toNode = nodes.find((n) => n.id === e.toId);
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
                            <span className="font-mono text-foreground-subtle truncate max-w-[200px]">
                              {fromNode?.name || e.fromFqn?.split(".").pop() || e.fromId}
                            </span>
                            <ArrowRight className="w-3 h-3 text-faint-foreground shrink-0" />
                            <span className="font-mono text-foreground-subtle truncate max-w-[200px]">
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
          <div className="text-center py-16 text-faint-foreground">
            <GitFork className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Enter a fully qualified name above and click Search to explore lineage.</p>
          </div>
        )}
      </div>
    </div>
  );
}
