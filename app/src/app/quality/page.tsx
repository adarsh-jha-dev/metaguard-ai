"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import LiveQuality from "./live-quality";

type Suite = {
  id: string;
  name: string;
  fqn: string;
  description?: string;
  passed: number;
  failed: number;
  aborted: number;
  total: number;
};

type FailingCase = {
  name: string;
  fqn: string;
  entityLink?: string;
  testType?: string;
  lastResult?: string;
  description?: string;
};

type Stats = {
  totalSuites: number;
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  passRate: number;
};

type Analysis = {
  testName: string;
  likelyCause: string;
  suggestedFix: string;
  severity: "high" | "medium" | "low";
};

export default function QualityPage() {
  const { connection } = useConnection();
  if (connection) return <LiveQuality />;
  return <OpenMetadataQuality />;
}

function OpenMetadataQuality() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [failingCases, setFailingCases] = useState<FailingCase[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<Analysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetch("/api/quality")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSuites(d.suites || []);
        setFailingCases(d.failingCases || []);
        setStats(d.stats || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleSuite = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runAnalysis = async () => {
    if (!failingCases.length) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/quality/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ failingTests: failingCases }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || []);
    } catch {
      setAnalysis([]);
    } finally {
      setAnalyzing(false);
    }
  };

  const severityColor = (s: string) => {
    if (s === "high") return "border-critical/30 text-critical bg-critical/5";
    if (s === "medium") return "border-warn/30 text-warn bg-warn/5";
    return "border-hue-blue/30 text-hue-blue bg-hue-blue/5";
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
          <p className="text-faint-foreground text-sm mt-1">Make sure OpenMetadata is running with test suites configured.</p>
        </div>
      </div>
    );
  }

  const passRate = stats?.passRate ?? 0;
  const passColor = passRate >= 80 ? "text-ok" : passRate >= 50 ? "text-warn" : "text-critical";
  const ringColor = passRate >= 80 ? "#4ade80" : passRate >= 50 ? "#facc15" : "#f87171";
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (passRate / 100) * circumference;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-hue-violet/10 border border-hue-violet/20">
              <FlaskConical className="w-5 h-5 text-hue-violet" />
            </div>
            <h1 className="text-3xl font-bold">Data Quality Center</h1>
          </div>
          <p className="text-muted-foreground">
            Live test suite health from OpenMetadata — powered by AI failure analysis.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Test Suites", value: stats?.totalSuites ?? 0, icon: <FlaskConical className="w-4 h-4" /> },
            { label: "Total Tests", value: stats?.totalCases ?? 0, icon: <CheckCircle2 className="w-4 h-4" /> },
            { label: "Passed", value: stats?.totalPassed ?? 0, icon: <CheckCircle2 className="w-4 h-4 text-ok" /> },
            { label: "Failed", value: stats?.totalFailed ?? 0, icon: <XCircle className="w-4 h-4 text-critical" /> },
          ].map((s) => (
            <Card key={s.label} className="p-4 border-border bg-card">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {s.icon}
                <span className="text-sm uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-3xl font-bold">{s.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Pass Rate Ring */}
          <Card className="p-6 border-border bg-card flex flex-col items-center justify-center">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" stroke="#27272a" strokeWidth="8" fill="none" />
                <circle
                  cx="64" cy="64" r="56"
                  stroke={ringColor}
                  strokeWidth="8" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-bold ${passColor}`}>{passRate}%</span>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-base">Pass Rate</p>
          </Card>

          {/* AI Analysis Panel */}
          <div className="lg:col-span-2">
            <Card className="h-full p-6 border-border bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-hue-violet" />
                  <h3 className="font-semibold">AI Failure Analysis</h3>
                </div>
                <Button
                  onClick={runAnalysis}
                  disabled={analyzing || failingCases.length === 0}
                  size="sm"
                  className="bg-hue-violet hover:bg-hue-violet/85 text-on-accent"
                >
                  {analyzing ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Analyzing…</>
                  ) : (
                    `Analyze ${failingCases.length} Failing Tests`
                  )}
                </Button>
              </div>

              {analysis.length === 0 && !analyzing && (
                <div className="flex flex-col items-center justify-center h-32 text-faint-foreground">
                  <Sparkles className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-base">
                    {failingCases.length === 0
                      ? "No failing tests found — great quality!"
                      : "Click \"Analyze\" to get AI insights on failing tests."}
                  </p>
                </div>
              )}

              {analysis.length > 0 && (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {analysis.map((a, i) => (
                    <div key={i} className={`rounded-lg border p-3 ${severityColor(a.severity)}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-base font-medium text-foreground truncate">{a.testName}</p>
                        <Badge variant="outline" className={`text-xs ml-2 shrink-0 ${severityColor(a.severity)}`}>
                          {a.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1"><span className="text-muted-foreground">Cause:</span> {a.likelyCause}</p>
                      <p className="text-sm text-muted-foreground"><span className="text-muted-foreground">Fix:</span> {a.suggestedFix}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Test Suites List */}
        <h2 className="text-xl font-semibold mb-4">Test Suites</h2>
        {suites.length === 0 ? (
          <Card className="p-8 border-border bg-card text-center text-muted-foreground">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No test suites found in OpenMetadata.</p>
            <p className="text-sm mt-1">Create test suites in OpenMetadata to see quality metrics here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {suites.map((suite) => {
              const isOpen = expanded.has(suite.id);
              const rate = suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0;
              return (
                <Card key={suite.id} className="border-border bg-card overflow-hidden">
                  <button
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleSuite(suite.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{suite.name as string}</p>
                      {suite.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{suite.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-muted-foreground">{suite.total} tests</span>
                      <Badge
                        variant="outline"
                        className={
                          rate >= 80
                            ? "border-ok/30 text-ok"
                            : rate >= 50
                            ? "border-warn/30 text-warn"
                            : "border-critical/30 text-critical"
                        }
                      >
                        {rate}% pass
                      </Badge>
                      {suite.failed > 0 && (
                        <Badge variant="outline" className="border-critical/30 text-critical">
                          {suite.failed} failed
                        </Badge>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-border">
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        {[
                          { label: "Passed", value: suite.passed, cls: "text-ok" },
                          { label: "Failed", value: suite.failed, cls: "text-critical" },
                          { label: "Aborted", value: suite.aborted, cls: "text-muted-foreground" },
                        ].map((m) => (
                          <div key={m.label} className="bg-muted/50 rounded-lg p-3 text-center">
                            <p className={`text-2xl font-bold ${m.cls}`}>{m.value}</p>
                            <p className="text-sm text-muted-foreground">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-ok transition-all duration-500"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
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
