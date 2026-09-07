"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Play,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { SourcePill } from "@/components/source-pill";
import type { QualityCheck } from "@/lib/db/insights";

type QualityResponse = {
  checks: QualityCheck[];
  profiledTables: string[];
  totalTables: number;
  limited: boolean;
  summary: { total: number; passed: number; failed: number; warning: number };
};

type Analysis = {
  testName: string;
  likelyCause: string;
  suggestedFix: string;
  severity: "high" | "medium" | "low";
};

/**
 * Data quality for a connected database. A raw database has no test suites to
 * read, so MetaGuard generates the checks by profiling the data itself.
 */
export default function LiveQuality() {
  const { connection, catalog, call } = useConnection();

  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<QualityResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Analysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const tables = catalog?.tables ?? [];

  const byTable = useMemo(() => {
    const groups = new Map<string, QualityCheck[]>();
    for (const check of result?.checks ?? []) {
      if (!groups.has(check.table)) groups.set(check.table, []);
      groups.get(check.table)!.push(check);
    }
    return [...groups.entries()];
  }, [result]);

  const failing = (result?.checks ?? []).filter((c) => c.status === "failed");

  async function run() {
    setRunning(true);
    setError(null);
    setAnalysis([]);
    try {
      const data = await call<QualityResponse>("/api/connect/quality", {
        tables: selected,
        schema: connection?.schema,
      });
      setResult(data);
      setExpanded(new Set(data.checks.filter((c) => c.status !== "passed").map((c) => c.table)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not profile the database.");
    } finally {
      setRunning(false);
    }
  }

  async function runAnalysis() {
    if (failing.length === 0) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/quality/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          failingTests: failing.slice(0, 20).map((c) => ({
            name: c.name,
            table: c.tableName,
            column: c.column,
            testType: c.testType,
            lastResult: c.detail,
          })),
        }),
      });
      const data = await res.json();
      if (!data.error) setAnalysis(data.analysis ?? []);
    } finally {
      setAnalyzing(false);
    }
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const passRate = result?.summary.total
    ? Math.round((result.summary.passed / result.summary.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-hue-violet/10 border border-hue-violet/20">
              <FlaskConical className="w-5 h-5 text-hue-violet" />
            </div>
            <h1 className="text-3xl font-bold">Data Quality</h1>
            <SourcePill live label={connection?.database} />
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Your database has no test suite, so MetaGuard writes one for it — profiling each table and
            checking completeness, uniqueness, and cardinality against what the schema promises.
          </p>
        </div>

        {/* Table picker */}
        <Card className="p-5 mb-6 bg-card border-border">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <p className="text-base font-medium text-foreground">Tables to profile</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selected.length === 0
                  ? "Nothing selected — the 8 largest tables will be profiled."
                  : `${selected.length} selected`}
                {" · "}
                <button
                  onClick={() => setSelected([])}
                  className="text-muted-foreground hover:text-foreground cursor-pointer underline underline-offset-2"
                >
                  clear
                </button>
              </p>
            </div>
            <Button
              onClick={run}
              disabled={running}
              className="bg-hue-violet/90 hover:bg-hue-violet text-on-accent font-medium cursor-pointer"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Profiling…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" /> Run checks
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {tables.map((t) => {
              const on = selected.includes(t.fullyQualifiedName);
              return (
                <button
                  key={t.fullyQualifiedName}
                  onClick={() =>
                    setSelected((prev) =>
                      on
                        ? prev.filter((f) => f !== t.fullyQualifiedName)
                        : prev.length >= 8
                          ? prev
                          : [...prev, t.fullyQualifiedName]
                    )
                  }
                  className={`px-2.5 py-1 rounded-md text-sm font-mono border transition-colors cursor-pointer ${
                    on
                      ? "bg-hue-violet/15 border-hue-violet/40 text-hue-violet"
                      : "bg-background border-border text-muted-foreground hover:border-border-strong"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          {selected.length >= 8 && (
            <p className="text-xs text-faint-foreground mt-2">
              Eight tables per run keeps each request inside the serverless timeout.
            </p>
          )}
        </Card>

        {error && (
          <Card className="p-4 mb-6 bg-critical/5 border-critical/20">
            <p className="text-base text-critical">{error}</p>
          </Card>
        )}

        {!result && !running && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FlaskConical className="w-12 h-12 mb-4 opacity-20" />
            <p>Run the checks to profile your tables</p>
          </div>
        )}

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Checks run", value: result.summary.total, color: "text-foreground" },
                { label: "Passed", value: result.summary.passed, color: "text-ok" },
                { label: "Failed", value: result.summary.failed, color: "text-critical" },
                { label: "Warnings", value: result.summary.warning, color: "text-warn" },
              ].map((s) => (
                <Card key={s.label} className="p-4 border-border bg-card text-center">
                  <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.label}</p>
                </Card>
              ))}
            </div>

            <Card className="p-5 mb-6 border-border bg-card">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>
                  Pass rate across {result.profiledTables.length} profiled table
                  {result.profiledTables.length === 1 ? "" : "s"}
                  {result.limited && ` (of ${result.totalTables} total)`}
                </span>
                <span
                  className={passRate >= 80 ? "text-ok" : passRate >= 50 ? "text-warn" : "text-critical"}
                >
                  {passRate}%
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    passRate >= 80 ? "bg-ok" : passRate >= 50 ? "bg-warn" : "bg-critical"
                  }`}
                  style={{ width: `${passRate}%` }}
                />
              </div>
            </Card>

            {failing.length > 0 && (
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <p className="text-base text-muted-foreground">
                  {failing.length} failing check{failing.length === 1 ? "" : "s"} — ask Gemini what to do
                  about them.
                </p>
                <Button
                  onClick={runAnalysis}
                  disabled={analyzing}
                  size="sm"
                  variant="outline"
                  className="border-border-strong cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analysing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI failure analysis
                    </>
                  )}
                </Button>
              </div>
            )}

            {analysis.length > 0 && (
              <div className="space-y-2 mb-8">
                {analysis.map((a) => (
                  <Card key={a.testName} className="p-4 border-border bg-card">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={
                          a.severity === "high"
                            ? "border-critical/30 text-critical text-xs"
                            : a.severity === "medium"
                              ? "border-warn/30 text-warn text-xs"
                              : "border-border-strong text-muted-foreground text-xs"
                        }
                      >
                        {a.severity}
                      </Badge>
                      <p className="text-base text-foreground">{a.testName}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      <span className="text-muted-foreground">Likely cause:</span> {a.likelyCause}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-muted-foreground">Suggested fix:</span> {a.suggestedFix}
                    </p>
                  </Card>
                ))}
              </div>
            )}

            {/* Checks by table */}
            <div className="space-y-2">
              {byTable.map(([table, checks]) => {
                const open = expanded.has(table);
                const failed = checks.filter((c) => c.status === "failed").length;
                const warned = checks.filter((c) => c.status === "warning").length;
                return (
                  <Card key={table} className="border-border bg-card overflow-hidden">
                    <button
                      onClick={() => toggle(table)}
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {open ? (
                          <ChevronDown className="w-4 h-4 text-faint-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-faint-foreground shrink-0" />
                        )}
                        <span className="text-base font-medium text-foreground truncate">
                          {checks[0]?.tableName ?? table}
                        </span>
                        <span className="text-sm text-faint-foreground">{checks.length} checks</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {failed > 0 && (
                          <Badge variant="outline" className="border-critical/30 text-critical text-xs">
                            {failed} failed
                          </Badge>
                        )}
                        {warned > 0 && (
                          <Badge
                            variant="outline"
                            className="border-warn/30 text-warn text-xs"
                          >
                            {warned} warning
                          </Badge>
                        )}
                        {failed === 0 && warned === 0 && (
                          <Badge variant="outline" className="border-ok/30 text-ok text-xs">
                            all passed
                          </Badge>
                        )}
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-border divide-y divide-border/70">
                        {[...checks]
                          .sort((a, b) => rank(a.status) - rank(b.status))
                          .map((check) => (
                            <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                              <StatusIcon status={check.status} />
                              <div className="min-w-0">
                                <p className="text-base text-foreground">{check.name}</p>
                                <p className="text-sm text-muted-foreground mt-0.5">{check.detail}</p>
                                <p className="text-xs text-faint-foreground mt-1 font-mono">{check.testType}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function rank(status: QualityCheck["status"]) {
  return status === "failed" ? 0 : status === "warning" ? 1 : 2;
}

function StatusIcon({ status }: { status: QualityCheck["status"] }) {
  if (status === "passed") return <CheckCircle2 className="w-4 h-4 text-ok mt-0.5 shrink-0" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-critical mt-0.5 shrink-0" />;
  return <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />;
}
