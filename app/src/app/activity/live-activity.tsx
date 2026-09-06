"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Activity,
  Sparkles,
  Database,
  RefreshCw,
  AlertTriangle,
  Info,
  Pencil,
  Brush,
  ScanSearch,
  PlusCircle,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { SourcePill } from "@/components/source-pill";
import type { ActivityEvent, ActivityReport } from "@/lib/db/activity";

type ActivityResponse = ActivityReport & {
  database: string;
  dialect: "postgres" | "mysql";
  aiSummary?: string;
  aiError?: string;
};

const typeIcon = (type: string) => {
  switch (type) {
    case "Writes":
    case "Written":
      return <Pencil className="w-3.5 h-3.5 text-blue-400" />;
    case "Maintenance":
      return <Brush className="w-3.5 h-3.5 text-emerald-400" />;
    case "Full scans":
    case "Never analysed":
      return <ScanSearch className="w-3.5 h-3.5 text-yellow-400" />;
    case "Created":
      return <PlusCircle className="w-3.5 h-3.5 text-purple-400" />;
    default:
      return <Database className="w-3.5 h-3.5 text-zinc-400" />;
  }
};

const typeColor = (event: ActivityEvent) =>
  event.severity === "warning"
    ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/5"
    : "border-zinc-700 text-zinc-500 bg-zinc-800/40";

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 31) return `${d}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Activity for a connected database.
 *
 * OpenMetadata's feed is a social one — conversations, tasks, announcements. A
 * raw database keeps a different kind of record, in its own statistics views:
 * what has been written, what needs vacuuming, what is being scanned end to end.
 * That is what this reads.
 */
export default function LiveActivity() {
  const { connection, call } = useConnection();

  const [report, setReport] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Fetching is separated from the state updates so the initial load can run
  // inside the effect without setting state on the way in.
  const fetchActivity = useCallback(
    (withSummary: boolean) =>
      call<ActivityResponse>("/api/connect/activity", {
        schema: connection?.schema,
        summary: withSummary,
      }),
    [call, connection?.schema]
  );

  useEffect(() => {
    let cancelled = false;
    fetchActivity(false)
      .then((data) => !cancelled && setReport(data))
      .catch(
        (e) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "Could not read this database's activity.")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchActivity]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchActivity(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this database's activity.");
    } finally {
      setLoading(false);
    }
  }

  async function summarize() {
    setSummarizing(true);
    setError(null);
    try {
      const data = await fetchActivity(true);
      setReport(data);
      setAiSummary(data.aiSummary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not summarise this database's activity.");
    } finally {
      setSummarizing(false);
    }
  }

  const events = report?.events ?? [];
  const warnings = events.filter((e) => e.severity === "warning").length;
  const totals = report?.totals;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Activity className="w-5 h-5 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold">Activity Feed</h1>
              <SourcePill live label={connection?.database} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading || summarizing}
              className="border-zinc-700 text-zinc-400 hover:text-zinc-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <p className="text-zinc-400 max-w-3xl">
            Read from{" "}
            <span className="font-mono text-zinc-300">{report?.source.view ?? "the statistics views"}</span>{" "}
            — what has been written, vacuumed and scanned in{" "}
            <span className="font-mono text-zinc-300">{connection?.database}</span>. Catalog statistics
            only: no table contents are read.
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

        {report && !report.available && (
          <Card className="p-4 mb-6 border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-zinc-300">
                  {report.unavailableReason ?? "This account cannot read the statistics views."}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Managed providers often restrict them. Granting{" "}
                  <span className="font-mono">pg_monitor</span> (Postgres) or{" "}
                  <span className="font-mono">PROCESS</span> (MySQL) to this user is enough.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Totals */}
        {report?.available && totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Tables" value={compact(totals.tables)} />
            {report.dialect === "postgres" ? (
              <>
                <StatCard label="Rows inserted" value={compact(totals.inserts)} />
                <StatCard label="Rows updated" value={compact(totals.updates)} />
                <StatCard label="Rows deleted" value={compact(totals.deletes)} />
              </>
            ) : (
              <>
                <StatCard label="Approx rows" value={compact(totals.liveRows)} />
                <StatCard label="Events" value={compact(events.length)} />
                <StatCard label="Needs attention" value={compact(warnings)} />
              </>
            )}
          </div>
        )}

        {/* AI summary */}
        <Card className="p-5 border-zinc-800 bg-zinc-900 mb-8">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="font-semibold">AI Activity Summary</h2>
            </div>
            <Button
              size="sm"
              onClick={summarize}
              disabled={summarizing || loading || events.length === 0}
              className="bg-cyan-600 hover:bg-cyan-700 text-white cursor-pointer"
            >
              {summarizing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Summarizing…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Summarize activity</>
              )}
            </Button>
          </div>
          {aiSummary ? (
            <p className="text-sm text-zinc-300 leading-relaxed">{aiSummary}</p>
          ) : (
            <p className="text-sm text-zinc-600">
              {events.length === 0
                ? "Nothing to summarize yet."
                : "Gemini reads the feed below and tells you what a maintainer should look at first."}
            </p>
          )}
          {report?.aiError && <p className="text-sm text-yellow-400 mt-2">{report.aiError}</p>}
        </Card>

        {/* Reading the numbers */}
        {report?.available && (
          <Card className="p-4 mb-6 bg-zinc-900/60 border-zinc-800">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
              <p className="text-xs text-zinc-500 leading-relaxed">
                {report.source.note}
                {report.statsResetAt && (
                  <> Counters were last reset {timeAgo(report.statsResetAt)}.</>
                )}
              </p>
            </div>
          </Card>
        )}

        {/* Feed */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-zinc-400">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          {warnings > 0 && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-sm text-yellow-400">{warnings} needing attention</span>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        ) : events.length === 0 ? (
          <Card className="p-10 border-zinc-800 bg-zinc-900 text-center text-zinc-500">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No activity recorded for this database.</p>
            <p className="text-xs mt-1">
              A database that has just been restored or had its statistics reset reports nothing until
              it is used again.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Card
                key={event.id}
                className={`p-4 bg-zinc-900 transition-colors hover:bg-zinc-800/60 ${
                  event.severity === "warning" ? "border-yellow-500/20" : "border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-zinc-800 border border-zinc-700 shrink-0">
                    {typeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-zinc-200 font-mono truncate">
                        {event.displayName}
                      </span>
                      <Badge variant="outline" className={`text-[9px] ${typeColor(event)}`}>
                        {event.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-400 mb-1.5">{event.detail}</p>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-600 flex-wrap">
                      {event.timestamp && <span>{timeAgo(event.timestamp)}</span>}
                      {event.metrics.map((m) => (
                        <span key={m.label}>
                          {m.label}: <span className="text-zinc-500">{m.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 border-zinc-800 bg-zinc-900">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}
