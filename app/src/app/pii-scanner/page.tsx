"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Shield,
  Loader2,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  Search,
  Sparkles,
  Beaker,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import type { ColumnVerdict } from "@/lib/db/classify";
import type { TableProfile } from "@/lib/db/types";
import { download, toCsv, toJson, toPostgresComments } from "@/lib/report";
import { SourcePill, formatCount } from "@/components/source-pill";

type TableRow = {
  id: string;
  name: string;
  schema?: string;
  fullyQualifiedName: string;
  description?: string;
  approxRows?: number;
  columns: { name: string }[];
};

type ScanResult = {
  table: { id: string; name: string; schema?: string; fqn: string; columns: unknown[] };
  classifications: ColumnVerdict[];
  profile?: TableProfile;
  scan?: {
    deepScan: boolean;
    aiUsed: boolean;
    sampledRows: number;
    columnsProfiled: number;
    truncated: boolean;
  };
};

export default function PIIScanner() {
  const { connection } = useConnection();
  // Remounting on a source change is how the scan results, selection and error
  // get reset — cheaper to reason about than an effect that clears each one.
  return <Scanner key={connection ? `${connection.host}/${connection.database}/${connection.schema ?? ""}` : "demo"} />;
}

function Scanner() {
  const { connection, catalog, catalogLoading, catalogError, call } = useConnection();
  const live = Boolean(connection);

  const [demoTables, setDemoTables] = useState<TableRow[]>([]);
  const [demoLoading, setDemoLoading] = useState(!live);
  const [filter, setFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [deepScan, setDeepScan] = useState(true);

  useEffect(() => {
    if (live) return;
    fetch("/api/tables")
      .then((r) => r.json())
      .then((d) => setDemoTables(d.data ?? []))
      .catch(() => setDemoTables([]))
      .finally(() => setDemoLoading(false));
  }, [live]);

  const tables: TableRow[] = useMemo(
    () => (live ? (catalog?.tables ?? []) : demoTables),
    [live, catalog, demoTables]
  );
  const loading = live ? catalogLoading : demoLoading;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter(
      (t) => t.name.toLowerCase().includes(q) || t.fullyQualifiedName.toLowerCase().includes(q)
    );
  }, [tables, filter]);

  async function scanTable(table: TableRow) {
    setSelected(table.fullyQualifiedName);
    setScanning(true);
    setScanResult(null);
    setError(null);
    try {
      if (live) {
        const data = await call<ScanResult>("/api/connect/scan", {
          fqn: table.fullyQualifiedName,
          schema: table.schema,
          table: table.name,
          deepScan,
        });
        setScanResult(data);
      } else {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fqn: table.fullyQualifiedName }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        // The demo endpoint returns the older, flatter shape.
        setScanResult({
          ...data,
          classifications: (data.classifications ?? []).map(
            (c: Partial<ColumnVerdict>): ColumnVerdict => ({
              column: c.column ?? "",
              classification: c.classification ?? "NotPII",
              confidence: c.confidence ?? 0.9,
              reason: c.reason ?? "",
              signals: { ai: c.reason },
              evidence: [],
            })
          ),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function approveTag(columnName: string, tagFQN: string) {
    if (!scanResult) return;
    setApproving(columnName);
    try {
      const res = await fetch("/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: scanResult.table.id, columnName, tagFQN }),
      });
      const data = await res.json();
      if (data.success) {
        setScanResult((prev) =>
          prev
            ? {
                ...prev,
                classifications: prev.classifications.map((c) =>
                  c.column === columnName ? { ...c, approved: true } : c
                ) as ColumnVerdict[],
              }
            : prev
        );
      }
    } finally {
      setApproving(null);
    }
  }

  const exportInput = scanResult && {
    database: connection?.database ?? "sample_data",
    schema: scanResult.table.schema ?? "public",
    table: scanResult.table.name,
    dialect: (connection?.dialect ?? "postgres") as "postgres" | "mysql",
    classifications: scanResult.classifications,
  };

  const counts = scanResult
    ? {
        sensitive: scanResult.classifications.filter((c) => c.classification === "PII.Sensitive").length,
        nonSensitive: scanResult.classifications.filter((c) => c.classification === "PII.NonSensitive")
          .length,
        clean: scanResult.classifications.filter((c) => c.classification === "NotPII").length,
      }
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold">PII Scanner</h1>
            <SourcePill live={live} label={connection?.database} />
          </div>
          <p className="text-zinc-400 max-w-3xl">
            {live
              ? "Classifies every column using three independent signals: the column's name, what the sampled values actually look like, and Gemini's read of the schema."
              : "Exploring the sample catalog. Connect your own database to scan real columns — including the ones whose names give nothing away."}
          </p>
        </div>

        {!live && (
          <Card className="p-4 mb-6 bg-sky-500/5 border-sky-500/20 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-zinc-300">
              Value-level detection only works on a live database — it&apos;s what catches PII in a column
              called <span className="font-mono text-zinc-100">notes</span> or{" "}
              <span className="font-mono text-zinc-100">field_7</span>.
            </p>
            <Link href="/connect">
              <Button size="sm" className="bg-sky-500/90 hover:bg-sky-500 text-zinc-950 cursor-pointer">
                Connect a database
              </Button>
            </Link>
          </Card>
        )}

        {catalogError && live && (
          <Card className="p-4 mb-6 bg-red-500/5 border-red-500/20">
            <p className="text-sm text-red-300">{catalogError}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Table list ─────────────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                Tables {tables.length > 0 && <span className="text-zinc-600">({tables.length})</span>}
              </h2>
            </div>

            {tables.length > 8 && (
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter tables…"
                  className="bg-zinc-900 border-zinc-800 pl-9 h-9 text-sm"
                />
              </div>
            )}

            {live && (
              <label className="flex items-center gap-2 mb-3 px-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deepScan}
                  onChange={(e) => setDeepScan(e.target.checked)}
                  className="accent-red-400 cursor-pointer"
                />
                <span className="text-xs text-zinc-400">
                  Profile values <span className="text-zinc-600">(aggregate counts only)</span>
                </span>
              </label>
            )}

            {loading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Reading schema…
              </div>
            ) : visible.length === 0 ? (
              <p className="text-sm text-zinc-600 py-4">No tables to show.</p>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {visible.map((table) => (
                  <Card
                    key={table.id}
                    className={`p-3.5 cursor-pointer transition-all border bg-zinc-900 hover:bg-zinc-800 ${
                      selected === table.fullyQualifiedName
                        ? "border-red-500/50 bg-zinc-800"
                        : "border-zinc-800"
                    }`}
                    onClick={() => scanTable(table)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-100 text-sm truncate">{table.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {table.columns?.length ?? 0} columns
                          {table.schema ? ` · ${table.schema}` : ""}
                          {table.approxRows ? ` · ~${formatCount(table.approxRows)} rows` : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ── Results ────────────────────────────────────────────────── */}
          <div className="lg:col-span-2">
            {scanning && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-red-400" />
                <p className="font-medium">{deepScan && live ? "Profiling columns…" : "Classifying columns…"}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {deepScan && live
                    ? "Running aggregate queries over a sample of rows"
                    : "This takes a few seconds"}
                </p>
              </div>
            )}

            {error && !scanning && (
              <Card className="p-5 bg-red-500/5 border-red-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              </Card>
            )}

            {!scanning && !scanResult && !error && (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <Shield className="w-12 h-12 mb-4 opacity-20" />
                <p>Select a table to scan for PII</p>
              </div>
            )}

            {scanResult && !scanning && counts && (
              <div>
                <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
                  <div>
                    <h2 className="text-sm font-medium text-zinc-300">
                      {scanResult.table.name}
                      {scanResult.table.schema && (
                        <span className="text-zinc-600 font-normal"> · {scanResult.table.schema}</span>
                      )}
                    </h2>
                    <div className="flex gap-2 text-xs text-zinc-500 mt-1">
                      <span className="text-red-400">{counts.sensitive} sensitive</span>
                      <span>·</span>
                      <span className="text-yellow-400">{counts.nonSensitive} non-sensitive</span>
                      <span>·</span>
                      <span className="text-green-400">{counts.clean} clean</span>
                      {scanResult.scan?.sampledRows ? (
                        <>
                          <span>·</span>
                          <span>{formatCount(scanResult.scan.sampledRows)} rows sampled</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {live && exportInput && (
                    <div className="flex gap-2">
                      {connection?.dialect === "postgres" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-700 text-xs cursor-pointer"
                          onClick={() =>
                            download(
                              `${exportInput.table}-pii-comments.sql`,
                              toPostgresComments(exportInput),
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
                          download(`${exportInput.table}-pii.csv`, toCsv(exportInput), "text/csv")
                        }
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-zinc-700 text-xs cursor-pointer"
                        onClick={() =>
                          download(
                            `${exportInput.table}-pii.json`,
                            toJson(exportInput),
                            "application/json"
                          )
                        }
                      >
                        JSON
                      </Button>
                    </div>
                  )}
                </div>

                {live && scanResult.scan && (
                  <p className="text-[11px] text-zinc-600 mb-3">
                    Signals used:{" "}
                    {[
                      "column names",
                      scanResult.scan.deepScan ? "sampled value patterns" : null,
                      scanResult.scan.aiUsed ? "Gemini" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {scanResult.scan.truncated && " · column list truncated"}
                  </p>
                )}

                <div className="space-y-2">
                  {scanResult.classifications.map((cls) => (
                    <VerdictCard
                      key={cls.column}
                      verdict={cls}
                      live={live}
                      approving={approving === cls.column}
                      onApprove={() => approveTag(cls.column, cls.classification)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VerdictCard({
  verdict,
  live,
  approving,
  onApprove,
}: {
  verdict: ColumnVerdict & { approved?: boolean };
  live: boolean;
  approving: boolean;
  onApprove: () => void;
}) {
  // The winning signal already reads as the main reason; repeating it below as
  // a supporting signal is noise, so only the *other* signals are listed.
  const supportingSignals: { key: string; Icon: typeof KeyRound; text: string }[] = [
    { key: "name", Icon: KeyRound, text: verdict.signals.name },
    // The evidence chips above already say it when a pattern matched.
    { key: "value", Icon: Beaker, text: verdict.evidence.length > 0 ? undefined : verdict.signals.value },
    { key: "ai", Icon: Sparkles, text: verdict.signals.ai },
  ].flatMap((s) => (s.text && s.text !== verdict.reason ? [{ ...s, text: s.text }] : []));

  const badgeColor =
    verdict.classification === "PII.Sensitive"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : verdict.classification === "PII.NonSensitive"
        ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
        : "bg-green-500/15 text-green-400 border-green-500/30";

  return (
    <Card className="p-4 border border-zinc-800 bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <p className="font-mono text-sm font-medium text-zinc-100">{verdict.column}</p>
            <Badge variant="outline" className={badgeColor}>
              {verdict.classification}
            </Badge>
            <span className="text-xs text-zinc-600">{Math.round(verdict.confidence * 100)}%</span>
          </div>
          <p className="text-xs text-zinc-500">{verdict.reason}</p>

          {verdict.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {verdict.evidence.map((e) => (
                <span
                  key={e.pattern}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-300"
                >
                  <Beaker className="w-2.5 h-2.5" />
                  {e.matchPercent}% match {e.label}
                </span>
              ))}
            </div>
          )}

          {live && supportingSignals.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-zinc-600">
              {supportingSignals.map(({ key, Icon, text }) => (
                <span key={key} className="inline-flex items-center gap-1">
                  <Icon className="w-2.5 h-2.5" /> {text}
                </span>
              ))}
            </div>
          )}
        </div>

        {!live && verdict.classification !== "NotPII" && (
          <div className="ml-2 shrink-0">
            {verdict.approved ? (
              <div className="flex items-center gap-1 text-green-400 text-xs">
                <Check className="w-4 h-4" /> Tagged
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 hover:border-red-500/50 text-xs cursor-pointer"
                disabled={approving}
                onClick={onApprove}
              >
                {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve Tag"}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

