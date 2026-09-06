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
    if (s === "high") return "border-red-500/30 text-red-400 bg-red-500/5";
    if (s === "medium") return "border-yellow-500/30 text-yellow-400 bg-yellow-500/5";
    return "border-blue-500/30 text-blue-400 bg-blue-500/5";
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
          <p className="text-zinc-600 text-xs mt-1">Make sure OpenMetadata is running with test suites configured.</p>
        </div>
      </div>
    );
  }

  const passRate = stats?.passRate ?? 0;
  const passColor = passRate >= 80 ? "text-green-400" : passRate >= 50 ? "text-yellow-400" : "text-red-400";
  const ringColor = passRate >= 80 ? "#4ade80" : passRate >= 50 ? "#facc15" : "#f87171";
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (passRate / 100) * circumference;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <FlaskConical className="w-5 h-5 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold">Data Quality Center</h1>
          </div>
          <p className="text-zinc-400">
            Live test suite health from OpenMetadata — powered by AI failure analysis.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Test Suites", value: stats?.totalSuites ?? 0, icon: <FlaskConical className="w-4 h-4" /> },
            { label: "Total Tests", value: stats?.totalCases ?? 0, icon: <CheckCircle2 className="w-4 h-4" /> },
            { label: "Passed", value: stats?.totalPassed ?? 0, icon: <CheckCircle2 className="w-4 h-4 text-green-400" /> },
            { label: "Failed", value: stats?.totalFailed ?? 0, icon: <XCircle className="w-4 h-4 text-red-400" /> },
          ].map((s) => (
            <Card key={s.label} className="p-4 border-zinc-800 bg-zinc-900">
              <div className="flex items-center gap-2 text-zinc-500 mb-1">
                {s.icon}
                <span className="text-xs uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Pass Rate Ring */}
          <Card className="p-6 border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center">
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
                <span className={`text-3xl font-bold ${passColor}`}>{passRate}%</span>
              </div>
            </div>
            <p className="text-zinc-400 mt-3 text-sm">Pass Rate</p>
          </Card>

          {/* AI Analysis Panel */}
          <div className="lg:col-span-2">
            <Card className="h-full p-6 border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <h3 className="font-semibold">AI Failure Analysis</h3>
                </div>
                <Button
                  onClick={runAnalysis}
                  disabled={analyzing || failingCases.length === 0}
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {analyzing ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Analyzing…</>
                  ) : (
                    `Analyze ${failingCases.length} Failing Tests`
                  )}
                </Button>
              </div>

              {analysis.length === 0 && !analyzing && (
                <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
                  <Sparkles className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">
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
                        <p className="text-sm font-medium text-zinc-200 truncate">{a.testName}</p>
                        <Badge variant="outline" className={`text-[10px] ml-2 shrink-0 ${severityColor(a.severity)}`}>
                          {a.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-400 mb-1"><span className="text-zinc-500">Cause:</span> {a.likelyCause}</p>
                      <p className="text-xs text-zinc-400"><span className="text-zinc-500">Fix:</span> {a.suggestedFix}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Test Suites List */}
        <h2 className="text-lg font-semibold mb-4">Test Suites</h2>
        {suites.length === 0 ? (
          <Card className="p-8 border-zinc-800 bg-zinc-900 text-center text-zinc-500">
            <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No test suites found in OpenMetadata.</p>
            <p className="text-xs mt-1">Create test suites in OpenMetadata to see quality metrics here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {suites.map((suite) => {
              const isOpen = expanded.has(suite.id);
              const rate = suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0;
              return (
                <Card key={suite.id} className="border-zinc-800 bg-zinc-900 overflow-hidden">
                  <button
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-zinc-800/50 transition-colors"
                    onClick={() => toggleSuite(suite.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-100 truncate">{suite.name as string}</p>
                      {suite.description && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{suite.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-zinc-500">{suite.total} tests</span>
                      <Badge
                        variant="outline"
                        className={
                          rate >= 80
                            ? "border-green-500/30 text-green-400"
                            : rate >= 50
                            ? "border-yellow-500/30 text-yellow-400"
                            : "border-red-500/30 text-red-400"
                        }
                      >
                        {rate}% pass
                      </Badge>
                      {suite.failed > 0 && (
                        <Badge variant="outline" className="border-red-500/30 text-red-400">
                          {suite.failed} failed
                        </Badge>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-zinc-800">
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        {[
                          { label: "Passed", value: suite.passed, cls: "text-green-400" },
                          { label: "Failed", value: suite.failed, cls: "text-red-400" },
                          { label: "Aborted", value: suite.aborted, cls: "text-zinc-500" },
                        ].map((m) => (
                          <div key={m.label} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                            <p className={`text-xl font-bold ${m.cls}`}>{m.value}</p>
                            <p className="text-xs text-zinc-500">{m.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-500"
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
