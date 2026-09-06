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
import { OpenMetadataOnlyNotice } from "@/components/openmetadata-notice";

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <BookOpen className="w-5 h-5 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold">Glossary AI Manager</h1>
          </div>
          <p className="text-zinc-400">
            Browse business glossaries and let Gemini AI suggest relevant terms for your tables.
          </p>
        </div>

        <OpenMetadataOnlyNotice feature="the business glossary" />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="p-4 border-zinc-800 bg-zinc-900">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Glossaries</p>
            <p className="text-2xl font-bold">{stats.totalGlossaries}</p>
          </Card>
          <Card className="p-4 border-zinc-800 bg-zinc-900">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Terms</p>
            <p className="text-2xl font-bold">{stats.totalTerms}</p>
          </Card>
        </div>

        {/* AI Suggest Panel */}
        <Card className="p-6 border-zinc-800 bg-zinc-900 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold">AI Term Suggestions</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
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
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
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
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              {suggesting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Suggesting…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Suggest Terms</>
              )}
            </Button>
          </div>

          {applyMsg && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
              {applyMsg}
            </div>
          )}

          {stats.totalTerms === 0 && (
            <div className="p-3 rounded-lg bg-zinc-800/50 text-zinc-500 text-sm">
              No glossary terms found. Add terms in OpenMetadata to enable AI suggestions.
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions
                .filter((s) => s.suggestedTerms?.length > 0)
                .map((s) => (
                  <div key={s.column} className="rounded-lg border border-zinc-800 p-4 bg-zinc-800/30">
                    <p className="font-mono text-sm text-zinc-200 mb-3">
                      <span className="text-zinc-500">column:</span> {s.column}
                    </p>
                    <div className="space-y-2">
                      {s.suggestedTerms.map((term) => {
                        const key = `${s.column}::${term.fqn}`;
                        const isApplied = applied[s.column]?.has(key);
                        return (
                          <div
                            key={term.fqn}
                            className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <BookOpen className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="text-sm text-zinc-200">{term.name}</span>
                                <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500">
                                  glossary
                                </Badge>
                              </div>
                              <p className="text-xs text-zinc-500 ml-5">{term.reason}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => applySuggestion(s.column, term)}
                              disabled={isApplied}
                              className={
                                isApplied
                                  ? "bg-green-900/30 text-green-400 border border-green-500/30 cursor-default"
                                  : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200 shrink-0"
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
                <p className="text-sm text-zinc-500 text-center py-4">
                  No relevant glossary terms found for this table's columns.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Glossary Browser */}
        <h2 className="text-lg font-semibold mb-4">Browse Glossaries</h2>
        {glossaries.length === 0 ? (
          <Card className="p-8 border-zinc-800 bg-zinc-900 text-center text-zinc-500">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No glossaries found in OpenMetadata.</p>
            <p className="text-xs mt-1">Create glossaries in OpenMetadata to manage business terminology.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {glossaries.map((g) => {
              const isOpen = expanded.has(g.id);
              return (
                <Card key={g.id} className="border-zinc-800 bg-zinc-900 overflow-hidden">
                  <button
                    className="w-full p-4 flex items-center gap-3 text-left hover:bg-zinc-800/50 transition-colors"
                    onClick={() => toggleGlossary(g.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    )}
                    <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-100">{g.name}</p>
                      {g.description && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{g.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 shrink-0">
                      {g.termCount} terms
                    </Badge>
                  </button>

                  {isOpen && g.terms.length > 0 && (
                    <div className="px-4 pb-4 border-t border-zinc-800">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {g.terms.map((term) => (
                          <div
                            key={term.id}
                            className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                          >
                            <p className="text-sm font-medium text-zinc-200">{term.name}</p>
                            {term.description && (
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{term.description}</p>
                            )}
                            <p className="text-[10px] text-zinc-700 mt-1 font-mono truncate">{term.fqn}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {isOpen && g.terms.length === 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-zinc-800 text-xs text-zinc-600">
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
