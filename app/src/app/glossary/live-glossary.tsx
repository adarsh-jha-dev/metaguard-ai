"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Link2,
  Check,
  AlertTriangle,
  Download,
  FileCode2,
  Table2,
  Columns3,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { SourcePill } from "@/components/source-pill";
import {
  download,
  toGlossaryComments,
  toGlossaryLinksCsv,
  toTermsCsv,
  type GlossaryLink,
} from "@/lib/report";
import type { GlossaryReport, LiveGlossary, LiveTerm } from "@/lib/db/glossary";

type GlossaryResponse = GlossaryReport & {
  database: string;
  dialect: "postgres" | "mysql";
  totalTables: number;
  aiUsed: boolean;
  aiError?: string;
};

type TermSuggestion = { name: string; fqn: string; reason: string };
type ColumnSuggestion = { column: string; suggestedTerms: TermSuggestion[] };
type SuggestResponse = {
  table: string;
  schema: string;
  fqn: string;
  suggestions: ColumnSuggestion[];
  termsConsidered: number;
  message?: string;
};

/**
 * Glossary for a connected database.
 *
 * There is no glossary to read out of a raw database, so MetaGuard derives one:
 * every table becomes an entity term, every column name shared across tables
 * becomes an attribute term, and Gemini writes the definitions the database has
 * no comment for. Nothing is written back — links leave as SQL you can review.
 */
export default function LiveGlossary() {
  const { connection, catalog, call } = useConnection();

  const [report, setReport] = useState<GlossaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defining, setDefining] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [selectedTable, setSelectedTable] = useState("");
  const [suggestions, setSuggestions] = useState<ColumnSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const [linked, setLinked] = useState<Record<string, TermSuggestion>>({});

  const tables = catalog?.tables ?? [];
  // Derived rather than seeded through an effect: until the user picks one, the
  // selector shows the first table the catalog returned.
  const activeTable = selectedTable || tables[0]?.fullyQualifiedName || "";

  // Definitions are a second, opt-in pass: the derived glossary itself costs no
  // AI call, so the page loads without one.
  async function writeDefinitions() {
    setDefining(true);
    setError(null);
    try {
      const data = await call<GlossaryResponse>("/api/connect/glossary", {
        schema: connection?.schema,
        enrich: true,
      });
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write definitions for this schema.");
    } finally {
      setDefining(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    call<GlossaryResponse>("/api/connect/glossary", { schema: connection?.schema })
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        // Open the biggest glossary so the page never lands on empty accordions.
        setExpanded(new Set(data.glossaries.slice(0, 1).map((g) => g.id)));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not derive a glossary.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [call, connection?.schema]);

  const termByFqn = useMemo(() => {
    const map = new Map<string, LiveTerm>();
    for (const g of report?.glossaries ?? []) for (const t of g.terms) map.set(t.fqn, t);
    return map;
  }, [report]);

  const selected = tables.find((t) => t.fullyQualifiedName === activeTable);

  const links: GlossaryLink[] = Object.entries(linked).map(([column, term]) => ({
    column,
    term: term.name,
    definition: termByFqn.get(term.fqn)?.description,
    reason: term.reason,
  }));

  const exportInput = selected && {
    database: connection?.database ?? "",
    schema: selected.schema,
    table: selected.name,
    dialect: (connection?.dialect ?? "postgres") as "postgres" | "mysql",
    links,
  };

  async function runSuggest() {
    if (!selected) return;
    setSuggesting(true);
    setSuggestions([]);
    setSuggestMsg(null);
    setLinked({});
    try {
      const data = await call<SuggestResponse>("/api/connect/glossary/suggest", {
        fqn: selected.fullyQualifiedName,
        schema: selected.schema,
        table: selected.name,
      });
      setSuggestions(data.suggestions ?? []);
      if (data.message) setSuggestMsg(data.message);
      else if ((data.suggestions ?? []).length === 0) {
        setSuggestMsg("No derived term matched this table's columns closely enough to suggest.");
      }
    } catch (e) {
      setSuggestMsg(e instanceof Error ? e.message : "Suggestion failed.");
    } finally {
      setSuggesting(false);
    }
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        <p className="text-sm text-zinc-500">Deriving a glossary from your schema…</p>
      </div>
    );
  }

  const stats = report?.stats;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <BookOpen className="w-5 h-5 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold">Glossary AI Manager</h1>
            <SourcePill live label={connection?.database} />
          </div>
          <p className="text-zinc-400 max-w-3xl">
            Your database has no glossary to read, so MetaGuard builds one from the vocabulary already
            in it: every table is a business entity, every column name shared across tables is a common
            attribute. Definitions come from your <span className="font-mono text-zinc-300">COMMENT</span>s
            first, and from Gemini for everything left undefined.
          </p>
        </div>

        {error && (
          <Card className="p-4 mb-6 border-red-500/30 bg-red-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Domains" value={stats?.totalGlossaries ?? 0} />
          <StatCard label="Terms" value={stats?.totalTerms ?? 0} />
          <StatCard
            label="Defined"
            value={`${stats?.documentedTerms ?? 0}/${stats?.totalTerms ?? 0}`}
          />
          <StatCard label="Tables covered" value={stats?.tablesCovered ?? 0} />
        </div>

        {/* Definitions */}
        <Card className="p-5 border-zinc-800 bg-zinc-900 mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold">Definitions</h2>
            </div>
            <div className="flex gap-2">
              {report && report.glossaries.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-xs cursor-pointer"
                  onClick={() =>
                    download(
                      `${connection?.database ?? "glossary"}-glossary.csv`,
                      toTermsCsv(connection?.database ?? "", report.glossaries),
                      "text/csv"
                    )
                  }
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              )}
              <Button
                size="sm"
                onClick={writeDefinitions}
                disabled={defining || !report || (stats?.totalTerms ?? 0) === 0}
                className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                {defining ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Writing…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Write definitions with AI</>
                )}
              </Button>
            </div>
          </div>
          <p className="text-sm text-zinc-500 mt-3">
            {report?.aiUsed
              ? "Gemini wrote the definitions marked AI below. Only table, column and type names were sent — never a row."
              : `${stats?.documentedTerms ?? 0} of ${stats?.totalTerms ?? 0} terms have a definition from a database comment. Ask Gemini to write the rest.`}
          </p>
          {report?.aiError && (
            <p className="text-sm text-yellow-400 mt-2">{report.aiError}</p>
          )}
        </Card>

        {/* Term suggestions for one table */}
        <Card className="p-6 border-zinc-800 bg-zinc-900 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold">Link terms to a table</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Pick a table and Gemini will match its columns against the derived terms. MetaGuard connects
            read-only, so accepted links are handed back as SQL for you to review and run — nothing is
            written to your database.
          </p>
          <div className="flex gap-3 mb-4 flex-wrap">
            <select
              value={activeTable}
              onChange={(e) => {
                setSelectedTable(e.target.value);
                setSuggestions([]);
                setSuggestMsg(null);
                setLinked({});
              }}
              className="flex-1 min-w-[220px] bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
            >
              {tables.map((t) => (
                <option key={t.fullyQualifiedName} value={t.fullyQualifiedName}>
                  {t.schema}.{t.name}
                </option>
              ))}
            </select>
            <Button
              onClick={runSuggest}
              disabled={suggesting || !selected || (stats?.totalTerms ?? 0) === 0}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 cursor-pointer"
            >
              {suggesting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Matching…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Suggest terms</>
              )}
            </Button>
          </div>

          {suggestMsg && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
              {suggestMsg}
            </div>
          )}

          {suggestions.length > 0 && (
            <>
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div key={s.column} className="rounded-lg border border-zinc-800 p-4 bg-zinc-800/30">
                    <p className="font-mono text-sm text-zinc-200 mb-3">
                      <span className="text-zinc-500">column:</span> {s.column}
                    </p>
                    <div className="space-y-2">
                      {s.suggestedTerms.map((term) => {
                        const isLinked = linked[s.column]?.fqn === term.fqn;
                        return (
                          <div
                            key={term.fqn}
                            className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <BookOpen className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="text-sm text-zinc-200">{term.name}</span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] border-amber-500/30 text-amber-500"
                                >
                                  {termByFqn.get(term.fqn)?.kind ?? "term"}
                                </Badge>
                              </div>
                              <p className="text-xs text-zinc-500 ml-5">{term.reason}</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() =>
                                setLinked((prev) => {
                                  const next = { ...prev };
                                  if (next[s.column]?.fqn === term.fqn) delete next[s.column];
                                  else next[s.column] = term;
                                  return next;
                                })
                              }
                              className={
                                isLinked
                                  ? "bg-green-900/30 text-green-400 border border-green-500/30 shrink-0 cursor-pointer"
                                  : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200 shrink-0 cursor-pointer"
                              }
                            >
                              {isLinked ? (
                                <><Check className="w-3 h-3 mr-1" /> Linked</>
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
              </div>

              {exportInput && links.length > 0 && (
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <span className="text-xs text-zinc-500 mr-1">
                    {links.length} {links.length === 1 ? "link" : "links"} selected
                  </span>
                  {connection?.dialect === "postgres" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 text-xs cursor-pointer"
                      onClick={() =>
                        download(
                          `${exportInput.table}-glossary.sql`,
                          toGlossaryComments(exportInput),
                          "text/plain"
                        )
                      }
                      title="COMMENT ON statements you can review and run yourself"
                    >
                      <FileCode2 className="w-3.5 h-3.5 mr-1.5" /> SQL
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-xs cursor-pointer"
                    onClick={() =>
                      download(
                        `${exportInput.table}-glossary-links.csv`,
                        toGlossaryLinksCsv(exportInput),
                        "text/csv"
                      )
                    }
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Derived glossaries */}
        <h2 className="text-lg font-semibold mb-4">Derived terms</h2>
        {(report?.glossaries.length ?? 0) === 0 ? (
          <Card className="p-8 border-zinc-800 bg-zinc-900 text-center text-zinc-500">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No terms could be derived from this schema.</p>
            <p className="text-xs mt-1">
              MetaGuard needs at least one readable table to build a glossary.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {report!.glossaries.map((g) => (
              <GlossaryCard key={g.id} glossary={g} open={expanded.has(g.id)} onToggle={() => toggle(g.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4 border-zinc-800 bg-zinc-900">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}

function GlossaryCard({
  glossary,
  open,
  onToggle,
}: {
  glossary: LiveGlossary;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = glossary.kind === "entity" ? Table2 : Columns3;

  return (
    <Card className="border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-zinc-800/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
        <Icon className="w-4 h-4 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-100">{glossary.name}</p>
          <p className="text-xs text-zinc-500 truncate mt-0.5">{glossary.description}</p>
        </div>
        <Badge variant="outline" className="border-amber-500/30 text-amber-400 shrink-0">
          {glossary.termCount} {glossary.termCount === 1 ? "term" : "terms"}
        </Badge>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {glossary.terms.map((term) => (
              <div key={term.fqn} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-sm font-medium text-zinc-200">{term.name}</p>
                  {term.aiGenerated && (
                    <Badge
                      variant="outline"
                      className="text-[9px] border-amber-500/30 text-amber-500 px-1 py-0"
                    >
                      AI
                    </Badge>
                  )}
                </div>
                {term.description ? (
                  <p className="text-xs text-zinc-500 mt-0.5">{term.description}</p>
                ) : (
                  <p className="text-xs text-zinc-700 mt-0.5 italic">No definition yet</p>
                )}
                <p className="text-[10px] text-zinc-600 mt-1.5 font-mono truncate">
                  {term.kind === "entity"
                    ? term.usedIn[0]
                    : `${term.sourceColumns.join(", ")} · ${term.usedIn.length} tables`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
