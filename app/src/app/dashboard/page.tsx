"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Activity,
  FileText,
  Tag,
  Table2,
  LayoutDashboard,
  Workflow,
  Radio,
  Brain,
  FlaskConical,
  GitFork,
  BookOpen,
  KeyRound,
  Link2,
  Eye,
  AlertTriangle,
  RefreshCw,
  Rows3,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/lib/connection-context";
import { SourcePill, formatCount } from "@/components/source-pill";

type Metrics = {
  totalTables: number;
  descriptionCoverage: number;
  tagCoverage: number;
  tableLevelTagCoverage: number;
  totalColumns: number;
  taggedColumns: number;
  tablesWithDescription: number;
  tablesWithTags: number;
};

type EntityCounts = {
  tables: number;
  dashboards: number;
  pipelines: number;
  topics: number;
  mlModels: number;
  total: number;
};

type QualityStats = {
  totalSuites: number;
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  passRate: number;
};

export default function Dashboard() {
  const { connection, catalog, catalogLoading, catalogError, refreshCatalog } = useConnection();
  const live = Boolean(connection);

  const [demoScore, setDemoScore] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [entities, setEntities] = useState<EntityCounts | null>(null);
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [demoLoading, setDemoLoading] = useState(!live);
  const [animatedScore, setAnimatedScore] = useState(0);

  // Derived, not synced: the live score is already in the catalog, so copying
  // it into state through an effect would only add a render and a stale window.
  const score = live ? (catalog?.governance.score ?? 0) : demoScore;
  const loading = live ? catalogLoading : demoLoading;

  // Demo / OpenMetadata path.
  useEffect(() => {
    if (live) return;
    Promise.allSettled([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/entities").then((r) => r.json()),
      fetch("/api/quality").then((r) => r.json()),
    ]).then(([health, ents, qual]) => {
      if (health.status === "fulfilled" && !health.value.error) {
        setDemoScore(health.value.score);
        setMetrics(health.value.metrics);
      }
      if (ents.status === "fulfilled" && !ents.value.error) setEntities(ents.value);
      if (qual.status === "fulfilled" && !qual.value.error) setQuality(qual.value.stats);
      setDemoLoading(false);
    });
  }, [live]);

  // Count the ring up to the score. A score of 0 settles on the first tick, so
  // there is no special case that would setState straight from the effect body.
  useEffect(() => {
    let current = 0;
    const step = score / 40;
    const interval = setInterval(() => {
      current += step;
      if (current >= score) {
        setAnimatedScore(score);
        clearInterval(interval);
      } else {
        setAnimatedScore(Math.round(current));
      }
    }, 20);
    return () => clearInterval(interval);
  }, [score]);

  const getScoreColor = (s: number) =>
    s >= 80 ? "text-green-400" : s >= 50 ? "text-yellow-400" : "text-red-400";
  const getBarColor = (v: number) => (v >= 80 ? "bg-green-500" : v >= 50 ? "bg-yellow-500" : "bg-red-500");
  const ring = (() => {
    const circumference = 2 * Math.PI * 88;
    return { circumference, offset: circumference - (animatedScore / 100) * circumference };
  })();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
        {live && <p className="text-sm text-zinc-500">Reading your schema…</p>}
      </div>
    );
  }

  const g = catalog?.governance;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold">Governance Dashboard</h1>
              <SourcePill live={live} label={connection?.database} />
            </div>
            <p className="text-zinc-400">
              {live
                ? `Governance health for ${connection?.database} on ${connection?.host}${connection?.schema ? ` · schema ${connection.schema}` : ""}.`
                : "Real-time governance health across your entire OpenMetadata catalog."}
            </p>
          </div>
          {live && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 cursor-pointer"
              onClick={() => void refreshCatalog()}
              disabled={catalogLoading}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${catalogLoading ? "animate-spin" : ""}`} />
              Re-scan schema
            </Button>
          )}
        </div>

        {catalogError && (
          <Card className="p-4 mb-6 bg-red-500/5 border-red-500/20">
            <p className="text-sm text-red-300">{catalogError}</p>
          </Card>
        )}

        {!live && (
          <Card className="p-4 mb-8 bg-sky-500/5 border-sky-500/20 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-zinc-300">
              This is the built-in sample catalog. Connect a Postgres or MySQL database to score your
              own schema.
            </p>
            <Link href="/connect">
              <Button size="sm" className="bg-sky-500/90 hover:bg-sky-500 text-zinc-950 cursor-pointer">
                Connect a database
              </Button>
            </Link>
          </Card>
        )}

        {/* Catalog overview */}
        {live && g ? (
          <div className="mb-8">
            <h2 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Catalog Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Tables", value: g.metrics.totalTables - g.metrics.views, icon: <Table2 className="w-4 h-4 text-blue-400" /> },
                { label: "Views", value: g.metrics.views, icon: <Eye className="w-4 h-4 text-purple-400" /> },
                { label: "Columns", value: g.metrics.totalColumns, icon: <FileText className="w-4 h-4 text-cyan-400" /> },
                { label: "Relationships", value: catalog.foreignKeys.length, icon: <Link2 className="w-4 h-4 text-orange-400" /> },
                // reltuples is only populated once a table has been analysed;
                // showing "0 rows" for a table full of data would be a lie.
                { label: "Rows (approx)", value: g.metrics.approxRows, format: true, icon: <Rows3 className="w-4 h-4 text-pink-400" /> },
              ].map((e) => (
                <Card key={e.label} className="p-4 border-zinc-800 bg-zinc-900">
                  <div className="flex items-center gap-2 mb-1">
                    {e.icon}
                    <span className="text-xs text-zinc-500">{e.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-zinc-100">
                    {e.format ? (e.value > 0 ? formatCount(e.value) : "—") : e.value}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          entities && (
            <div className="mb-8">
              <h2 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Catalog Overview</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "Tables", value: entities.tables, icon: <Table2 className="w-4 h-4 text-blue-400" /> },
                  { label: "Dashboards", value: entities.dashboards, icon: <LayoutDashboard className="w-4 h-4 text-purple-400" /> },
                  { label: "Pipelines", value: entities.pipelines, icon: <Workflow className="w-4 h-4 text-orange-400" /> },
                  { label: "Topics", value: entities.topics, icon: <Radio className="w-4 h-4 text-cyan-400" /> },
                  { label: "ML Models", value: entities.mlModels, icon: <Brain className="w-4 h-4 text-pink-400" /> },
                ].map((e) => (
                  <Card key={e.label} className="p-4 border-zinc-800 bg-zinc-900">
                    <div className="flex items-center gap-2 mb-1">
                      {e.icon}
                      <span className="text-xs text-zinc-500">{e.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">{e.value}</p>
                  </Card>
                ))}
              </div>
            </div>
          )
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Score ring */}
          <Card className="p-8 border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center">
            <div className="relative w-52 h-52">
              <svg className="w-52 h-52 -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="88" stroke="#27272a" strokeWidth="8" fill="none" />
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  stroke={animatedScore >= 80 ? "#4ade80" : animatedScore >= 50 ? "#facc15" : "#f87171"}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={ring.circumference}
                  strokeDashoffset={ring.offset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-5xl font-bold ${getScoreColor(animatedScore)}`}>{animatedScore}</span>
                <span className="text-zinc-500 text-sm mt-1">/ 100</span>
              </div>
            </div>
            <p className="text-zinc-400 mt-4 text-sm">Governance Health Score</p>
            <Badge
              variant="outline"
              className={`mt-2 ${
                score >= 80
                  ? "border-green-500/30 text-green-400"
                  : score >= 50
                    ? "border-yellow-500/30 text-yellow-400"
                    : "border-red-500/30 text-red-400"
              }`}
            >
              {score >= 80 ? "Healthy" : score >= 50 ? "Needs Attention" : "Critical"}
            </Badge>
          </Card>

          {/* Metric breakdown */}
          <div className="space-y-4">
            {live && g ? (
              <>
                <MetricBar
                  icon={<FileText className="w-4 h-4" />}
                  label="Table Descriptions"
                  value={g.metrics.descriptionCoverage}
                  detail={`${g.metrics.tablesWithDescription} of ${g.metrics.totalTables} tables have a comment`}
                  barColor={getBarColor(g.metrics.descriptionCoverage)}
                />
                <MetricBar
                  icon={<FileText className="w-4 h-4" />}
                  label="Column Descriptions"
                  value={g.metrics.columnDescriptionCoverage}
                  detail={`${g.metrics.columnsWithDescription} of ${g.metrics.totalColumns} columns documented`}
                  barColor={getBarColor(g.metrics.columnDescriptionCoverage)}
                />
                <MetricBar
                  icon={<KeyRound className="w-4 h-4" />}
                  label="Primary Key Coverage"
                  value={g.metrics.primaryKeyCoverage}
                  detail={`${g.metrics.tablesWithPrimaryKey} of ${g.metrics.totalTables} tables have a primary key`}
                  barColor={getBarColor(g.metrics.primaryKeyCoverage)}
                />
                <MetricBar
                  icon={<Link2 className="w-4 h-4" />}
                  label="Relationship Coverage"
                  value={g.metrics.relationshipCoverage}
                  detail={`${g.metrics.tablesInRelationships} of ${g.metrics.totalTables} tables have foreign keys`}
                  barColor={getBarColor(g.metrics.relationshipCoverage)}
                />
              </>
            ) : (
              <>
                <MetricCard
                  icon={<Table2 className="w-4 h-4" />}
                  label="Total Tables"
                  value={metrics?.totalTables || 0}
                  unit="tables"
                />
                <MetricBar
                  icon={<FileText className="w-4 h-4" />}
                  label="Description Coverage"
                  value={metrics?.descriptionCoverage || 0}
                  detail={`${metrics?.tablesWithDescription || 0} of ${metrics?.totalTables || 0} tables`}
                  barColor={getBarColor(metrics?.descriptionCoverage || 0)}
                />
                <MetricBar
                  icon={<Tag className="w-4 h-4" />}
                  label="Column Tag Coverage"
                  value={metrics?.tagCoverage || 0}
                  detail={`${metrics?.taggedColumns || 0} of ${metrics?.totalColumns || 0} columns`}
                  barColor={getBarColor(metrics?.tagCoverage || 0)}
                />
                <MetricBar
                  icon={<Tag className="w-4 h-4" />}
                  label="Table-Level Tag Coverage"
                  value={metrics?.tableLevelTagCoverage || 0}
                  detail={`${metrics?.tablesWithTags || 0} of ${metrics?.totalTables || 0} tables`}
                  barColor={getBarColor(metrics?.tableLevelTagCoverage || 0)}
                />
              </>
            )}
          </div>
        </div>

        {/* What's actually wrong */}
        {live && g && g.gaps.length > 0 && (
          <Card className="mb-8 p-6 border-zinc-800 bg-zinc-900">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-zinc-200">What&apos;s dragging the score down</h3>
            </div>
            <div className="space-y-3">
              {g.gaps.map((gap) => (
                <div key={gap.title} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                      gap.severity === "high"
                        ? "bg-red-400"
                        : gap.severity === "medium"
                          ? "bg-yellow-400"
                          : "bg-zinc-600"
                    }`}
                  />
                  <div>
                    <p className="text-sm text-zinc-200">{gap.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{gap.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Data quality summary (OpenMetadata path only) */}
        {!live && quality && (
          <Card className="mb-8 p-6 border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-violet-400" />
                <h3 className="font-semibold text-zinc-200">Data Quality</h3>
              </div>
              <Link href="/quality" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                View details →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Test Suites", value: quality.totalSuites },
                { label: "Total Tests", value: quality.totalCases },
                { label: "Passed", value: quality.totalPassed, green: true },
                { label: "Failed", value: quality.totalFailed, red: true },
              ].map((q) => (
                <div key={q.label} className="text-center">
                  <p
                    className={`text-2xl font-bold ${
                      q.green ? "text-green-400" : q.red ? "text-red-400" : "text-zinc-100"
                    }`}
                  >
                    {q.value}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">{q.label}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Quick links */}
        <h2 className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { href: "/pii-scanner", label: "Scan PII", icon: <Tag className="w-4 h-4 text-emerald-400" />, desc: live ? "Find personal data in real columns" : "Auto-tag sensitive columns" },
            { href: "/quality", label: "Quality", icon: <FlaskConical className="w-4 h-4 text-violet-400" />, desc: live ? "Profile tables for defects" : "View test health" },
            { href: "/lineage", label: "Lineage", icon: <GitFork className="w-4 h-4 text-blue-400" />, desc: live ? "Map foreign-key dependencies" : "Explore dependencies" },
            { href: "/chat", label: "Ask a question", icon: <BookOpen className="w-4 h-4 text-amber-400" />, desc: "Query your schema in English" },
          ].map((a) => (
            <Link key={a.href} href={a.href}>
              <Card className="p-4 border-zinc-800 bg-zinc-900 hover:bg-zinc-800/70 transition-colors cursor-pointer h-full">
                <div className="flex items-center gap-2 mb-1.5">
                  {a.icon}
                  <span className="text-sm font-medium text-zinc-200">{a.label}</span>
                </div>
                <p className="text-xs text-zinc-500">{a.desc}</p>
              </Card>
            </Link>
          ))}
        </div>

        {/* Score formula */}
        <Card className="p-6 border-zinc-800 bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Score Formula</h3>
          <div className="flex flex-wrap gap-3 text-sm">
            {(live
              ? [
                  "Table Descriptions × 0.30",
                  "Column Descriptions × 0.30",
                  "Primary Key Coverage × 0.25",
                  "Relationship Coverage × 0.15",
                ]
              : ["Description Coverage × 0.35", "Column Tag Coverage × 0.35", "Table Tag Coverage × 0.30"]
            ).map((part, i, arr) => (
              <span key={part} className="flex items-center gap-3">
                <code className="px-3 py-1.5 bg-zinc-800 rounded-lg text-zinc-300">{part}</code>
                {i < arr.length - 1 && <span className="text-zinc-600">+</span>}
              </span>
            ))}
          </div>
          {live && (
            <p className="text-xs text-zinc-600 mt-3">
              A raw database has no tags or owners to count, so the score measures what a database can
              actually tell you: is it documented, is it keyed, and are its relationships declared.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <Card className="p-4 border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-3">
        <div className="text-zinc-500">{icon}</div>
        <div>
          <p className="text-xs text-zinc-500">{label}</p>
          <p className="text-xl font-bold text-zinc-100">
            {value} <span className="text-sm font-normal text-zinc-500">{unit}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function MetricBar({
  icon,
  label,
  value,
  detail,
  barColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  barColor: string;
}) {
  return (
    <Card className="p-4 border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-zinc-500">{icon}</div>
          <p className="text-sm text-zinc-300">{label}</p>
        </div>
        <span className="text-sm font-bold text-zinc-100">{value}%</span>
      </div>
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500 mt-1.5">{detail}</p>
    </Card>
  );
}
