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
      return <Pencil className="w-3.5 h-3.5 text-hue-blue" />;
    case "Maintenance":
      return <Brush className="w-3.5 h-3.5 text-brand" />;
    case "Full scans":
    case "Never analysed":
      return <ScanSearch className="w-3.5 h-3.5 text-warn" />;
    case "Created":
      return <PlusCircle className="w-3.5 h-3.5 text-hue-purple" />;
    default:
      return <Database className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const typeColor = (event: ActivityEvent) =>
  event.severity === "warning"
    ? "border-warn/30 text-warn bg-warn/5"
    : "border-border-strong text-muted-foreground bg-muted/40";

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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className="p-2 rounded-lg bg-hue-cyan/10 border border-hue-cyan/20">
                <Activity className="w-5 h-5 text-hue-cyan" />
              </div>
              <h1 className="text-3xl font-bold">Activity Feed</h1>
              <SourcePill live label={connection?.database} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading || summarizing}
              className="border-border-strong text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Read from{" "}
            <span className="font-mono text-foreground-subtle">{report?.source.view ?? "the statistics views"}</span>{" "}
            — what has been written, vacuumed and scanned in{" "}
            <span className="font-mono text-foreground-subtle">{connection?.database}</span>. Catalog statistics
            only: no table contents are read.
          </p>
        </div>

        {error && (
          <Card className="p-4 mb-6 border-critical/30 bg-critical/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-critical mt-0.5 shrink-0" />
              <p className="text-base text-critical">{error}</p>
            </div>
          </Card>
        )}

        {report && !report.available && (
          <Card className="p-4 mb-6 border-warn/20 bg-warn/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
              <div>
                <p className="text-base text-foreground-subtle">
                  {report.unavailableReason ?? "This account cannot read the statistics views."}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
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
        <Card className="p-5 border-border bg-card mb-8">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-hue-cyan" />
              <h2 className="font-semibold">AI Activity Summary</h2>
            </div>
            <Button
              size="sm"
              onClick={summarize}
              disabled={summarizing || loading || events.length === 0}
              className="bg-hue-cyan hover:bg-hue-cyan/85 text-on-accent cursor-pointer"
            >
              {summarizing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Summarizing…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Summarize activity</>
              )}
            </Button>
          </div>
          {aiSummary ? (
            <p className="text-base text-foreground-subtle leading-relaxed">{aiSummary}</p>
          ) : (
            <p className="text-base text-faint-foreground">
              {events.length === 0
                ? "Nothing to summarize yet."
                : "Gemini reads the feed below and tells you what a maintainer should look at first."}
            </p>
          )}
          {report?.aiError && <p className="text-base text-warn mt-2">{report.aiError}</p>}
        </Card>

        {/* Reading the numbers */}
        {report?.available && (
          <Card className="p-4 mb-6 bg-card/60 border-border">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
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
          <span className="text-base text-muted-foreground">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          {warnings > 0 && (
            <>
              <span className="text-faint-foreground">·</span>
              <span className="text-base text-warn">{warnings} needing attention</span>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <Card className="p-10 border-border bg-card text-center text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No activity recorded for this database.</p>
            <p className="text-sm mt-1">
              A database that has just been restored or had its statistics reset reports nothing until
              it is used again.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Card
                key={event.id}
                className={`p-4 bg-card transition-colors hover:bg-muted/60 ${
                  event.severity === "warning" ? "border-warn/20" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-muted border border-border-strong shrink-0">
                    {typeIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base font-medium text-foreground font-mono truncate">
                        {event.displayName}
                      </span>
                      <Badge variant="outline" className={`text-xs ${typeColor(event)}`}>
                        {event.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1.5">{event.detail}</p>
                    <div className="flex items-center gap-3 text-xs text-faint-foreground flex-wrap">
                      {event.timestamp && <span>{timeAgo(event.timestamp)}</span>}
                      {event.metrics.map((m) => (
                        <span key={m.label}>
                          {m.label}: <span className="text-muted-foreground">{m.value}</span>
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
    <Card className="p-4 border-border bg-card">
      <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </Card>
  );
}
