"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, FileText, Tag, Table2 } from "lucide-react";

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

export default function Dashboard() {
  const [score, setScore] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        setScore(d.score);
        setMetrics(d.metrics);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (score === 0) return;
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

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-400";
    if (s >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreRing = (s: number) => {
    const circumference = 2 * Math.PI * 88;
    const offset = circumference - (s / 100) * circumference;
    return { circumference, offset };
  };

  const getBarColor = (v: number) => {
    if (v >= 80) return "bg-green-500";
    if (v >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const ring = getScoreRing(animatedScore);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold">Governance Dashboard</h1>
          </div>
          <p className="text-zinc-400">
            Real-time governance health score computed from your OpenMetadata instance.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Score Ring */}
          <Card className="p-8 border-zinc-800 bg-zinc-900 flex flex-col items-center justify-center">
            <div className="relative w-52 h-52">
              <svg className="w-52 h-52 -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="88" stroke="#27272a" strokeWidth="8" fill="none" />
                <circle
                  cx="100" cy="100" r="88"
                  stroke={animatedScore >= 80 ? "#4ade80" : animatedScore >= 50 ? "#facc15" : "#f87171"}
                  strokeWidth="8" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={ring.circumference}
                  strokeDashoffset={ring.offset}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-5xl font-bold ${getScoreColor(animatedScore)}`}>
                  {animatedScore}
                </span>
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

          {/* Metrics Breakdown */}
          <div className="space-y-4">
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
          </div>
        </div>

        {/* Score Formula */}
        <Card className="mt-8 p-6 border-zinc-800 bg-zinc-900">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Score Formula
          </h3>
          <div className="flex flex-wrap gap-3 text-sm">
            <code className="px-3 py-1.5 bg-zinc-800 rounded-lg text-zinc-300">
              Description Coverage × 0.35
            </code>
            <span className="text-zinc-600 self-center">+</span>
            <code className="px-3 py-1.5 bg-zinc-800 rounded-lg text-zinc-300">
              Column Tag Coverage × 0.35
            </code>
            <span className="text-zinc-600 self-center">+</span>
            <code className="px-3 py-1.5 bg-zinc-800 rounded-lg text-zinc-300">
              Table Tag Coverage × 0.30
            </code>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: number; unit: string }) {
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

function MetricBar({ icon, label, value, detail, barColor }: { icon: React.ReactNode; label: string; value: number; detail: string; barColor: string }) {
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