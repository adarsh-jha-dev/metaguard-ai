"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  BookOpen,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import LiveGlossary from "./live-glossary";

type GlossaryTerm = {
  id: string;
  name: string;
  fqn: string;
  description?: string;
};

type Glossary = {
  id: string;
  name: string;
  fqn: string;
  description?: string;
  termCount: number;
  terms: GlossaryTerm[];
};

type Table = {
  name: string;
  fullyQualifiedName: string;
};

type TermSuggestion = {
  name: string;
  fqn: string;
  reason: string;
};

type ColumnSuggestion = {
  column: string;
  suggestedTerms: TermSuggestion[];
};

type AppliedMap = Record<string, Set<string>>;

export default function GlossaryPage() {
  const { connection } = useConnection();
  if (connection) return <LiveGlossary />;
  return <OpenMetadataGlossary />;
}

function OpenMetadataGlossary() {
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [stats, setStats] = useState({ totalGlossaries: 0, totalTerms: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Suggest state
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [suggestions, setSuggestions] = useState<ColumnSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [applied, setApplied] = useState<AppliedMap>({});
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/glossary").then((r) => r.json()),
      fetch("/api/tables").then((r) => r.json()),
    ])
      .then(([gData, tData]) => {
        if (gData.error) throw new Error(gData.error);
        setGlossaries(gData.glossaries || []);
        setStats(gData.stats || { totalGlossaries: 0, totalTerms: 0 });
        const tbls: Table[] = (tData.data || []).map((t: Record<string, unknown>) => ({
          name: t.name as string,
          fullyQualifiedName: t.fullyQualifiedName as string,
        }));
        setTables(tbls);
        if (tbls.length) setSelectedTable(tbls[0].fullyQualifiedName);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleGlossary = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runSuggest = async () => {
    if (!selectedTable) return;
    setSuggesting(true);
    setSuggestions([]);
    setApplyMsg(null);
    try {
      const res = await fetch("/api/glossary/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableFqn: selectedTable }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSuggestions(data.suggestions || []);
      if (data.message) setApplyMsg(data.message);
    } catch (e: unknown) {
      setApplyMsg(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = async (column: string, term: TermSuggestion) => {
    const key = `${column}::${term.fqn}`;
    try {
      const res = await fetch("/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableFqn: selectedTable,
          columnName: column,
          tagFqn: term.fqn,
        }),
      });
      const data = await res.json();
      if (!data.success && !data.error?.includes("already")) throw new Error(data.error || "Failed");
      setApplied((prev) => {
        const next = { ...prev };
        if (!next[column]) next[column] = new Set();
        next[column].add(key);
        return next;
      });
    } catch (e: unknown) {
      setApplyMsg(e instanceof Error ? e.message : "Apply failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-warn mx-auto mb-3" />
          <p className="text-muted-foreground text-base">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-hue-amber/10 border border-hue-amber/20">
              <BookOpen className="w-5 h-5 text-hue-amber" />
            </div>
            <h1 className="text-3xl font-bold">Glossary AI Manager</h1>
          </div>
          <p className="text-muted-foreground">
            Browse business glossaries and let Gemini AI suggest relevant terms for your tables.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-4 border-border bg-card">
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Glossaries</p>
            <p className="text-3xl font-bold">{stats.totalGlossaries}</p>
          </Card>
          <Card className="p-4 border-border bg-card">
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Total Terms</p>
            <p className="text-3xl font-bold">{stats.totalTerms}</p>
          </Card>
        </div>

        {/* AI Suggest Panel */}
        <Card className="p-6 border-border bg-card mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-hue-amber" />
            <h2 className="font-semibold">AI Term Suggestions</h2>
          </div>
          <p className="text-base text-muted-foreground mb-4">
            Select a table and Gemini AI will analyze its columns and suggest the most relevant glossary terms to link.
          </p>
          <div className="flex gap-3 mb-4">
            <select
              value={selectedTable}
              onChange={(e) => {
                setSelectedTable(e.target.value);
                setSuggestions([]);
                setApplyMsg(null);
              }}
              className="flex-1 bg-muted border border-border-strong rounded-lg px-3 py-2 text-base text-foreground focus:outline-none focus:border-hue-amber/50"
            >
              {tables.map((t) => (
                <option key={t.fullyQualifiedName} value={t.fullyQualifiedName}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              onClick={runSuggest}
              disabled={suggesting || !selectedTable || stats.totalTerms === 0}
              className="bg-hue-amber hover:bg-hue-amber/85 text-on-accent shrink-0"
            >
              {suggesting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Suggesting…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Suggest Terms</>
              )}
            </Button>
          </div>

          {applyMsg && (
            <div className="mb-4 p-3 rounded-lg bg-warn/10 border border-warn/20 text-warn text-base">
              {applyMsg}
            </div>
          )}

          {stats.totalTerms === 0 && (
            <div className="p-3 rounded-lg bg-muted/50 text-muted-foreground text-base">
              No glossary terms found. Add terms in OpenMetadata to enable AI suggestions.
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions
                .filter((s) => s.suggestedTerms?.length > 0)
                .map((s) => (
                  <div key={s.column} className="rounded-lg border border-border p-4 bg-muted/30">
                    <p className="font-mono text-base text-foreground mb-3">
                      <span className="text-muted-foreground">column:</span> {s.column}
                    </p>
                    <div className="space-y-2">
                      {s.suggestedTerms.map((term) => {
                        const key = `${s.column}::${term.fqn}`;
                        const isApplied = applied[s.column]?.has(key);
                        return (
                          <div
                            key={term.fqn}
                            className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-muted/60 border border-border-strong/50"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <BookOpen className="w-3 h-3 text-hue-amber shrink-0" />
                                <span className="text-base text-foreground">{term.name}</span>
                                <Badge variant="outline" className="text-xs border-hue-amber/30 text-hue-amber">
                                  glossary
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground ml-5">{term.reason}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => applySuggestion(s.column, term)}
                              disabled={isApplied}
                              className={
                                isApplied
                                  ? "bg-ok/30 text-ok border border-ok/30 cursor-default"
                                  : "bg-border-strong hover:bg-faint-foreground text-foreground shrink-0"
                              }
                            >
                              {isApplied ? (
                                <><CheckCircle2 className="w-3 h-3 mr-1" /> Applied</>
                              ) : (
                                <><Link2 className="w-3 h-3 mr-1" /> Link</>
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              {suggestions.every((s) => !s.suggestedTerms?.length) && (
                <p className="text-base text-muted-foreground text-center py-4">
                  No relevant glossary terms found for this table's columns.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Glossary Browser */}
        <h2 className="text-xl font-semibold mb-4">Browse Glossaries</h2>
        {glossaries.length === 0 ? (
          <Card className="p-8 border-border bg-card text-center text-muted-foreground">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No glossaries found in OpenMetadata.</p>
            <p className="text-sm mt-1">Create glossaries in OpenMetadata to manage business terminology.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {glossaries.map((g) => {
              const isOpen = expanded.has(g.id);
              return (
                <Card key={g.id} className="border-border bg-card overflow-hidden">
                  <button
                    className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGlossary(g.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <BookOpen className="w-4 h-4 text-hue-amber shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{g.name}</p>
                      {g.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{g.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="border-hue-amber/30 text-hue-amber shrink-0">
                      {g.termCount} terms
                    </Badge>
                  </button>

                  {isOpen && g.terms.length > 0 && (
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {g.terms.map((term) => (
                          <div
                            key={term.id}
                            className="p-3 rounded-lg bg-muted/50 border border-border-strong/50"
                          >
                            <p className="text-base font-medium text-foreground">{term.name}</p>
                            {term.description && (
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{term.description}</p>
                            )}
                            <p className="text-xs text-faint-foreground mt-1 font-mono truncate">{term.fqn}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {isOpen && g.terms.length === 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-border text-sm text-faint-foreground">
                      No terms in this glossary yet.
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
