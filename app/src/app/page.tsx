"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Activity,
  MessageSquare,
  ArrowRight,
  Database,
  Plug,
  FlaskConical,
  GitFork,
  Lock,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { formatCount } from "@/components/source-pill";

export default function Home() {
  const { connection, catalog, catalogLoading } = useConnection();
  const live = Boolean(connection);

  const [demoStats, setDemoStats] = useState({ tables: 0, score: 0 });

  useEffect(() => {
    if (live) return;
    fetch("/api/tables")
      .then((r) => r.json())
      .then((d) => setDemoStats((prev) => ({ ...prev, tables: d.data?.length || 0 })))
      .catch(() => {});
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDemoStats((prev) => ({ ...prev, score: d.score || 0 })))
      .catch(() => {});
  }, [live]);

  const tables = live ? (catalog?.tables.length ?? 0) : demoStats.tables;
  const score = live ? (catalog?.governance.score ?? 0) : demoStats.score;
  const columns = live ? (catalog?.governance.metrics.totalColumns ?? 0) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6 border ${
              live
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
            />
            {live
              ? `Connected to ${connection?.database}`
              : catalogLoading
                ? "Connecting…"
                : "Exploring the sample catalog"}
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-linear-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            MetaGuard AI
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Point it at a database and get back what you actually needed to know: where the personal
            data is, what&apos;s undocumented, and what breaks if you change something.
          </p>

          {!live && (
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/connect">
                <Button className="bg-emerald-500/90 hover:bg-emerald-500 text-zinc-950 font-medium cursor-pointer">
                  <Plug className="w-4 h-4 mr-2" />
                  Connect your database
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 cursor-pointer">
                  Try the sample catalog
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className={`grid gap-4 mb-12 mx-auto ${live ? "grid-cols-3 max-w-2xl" : "grid-cols-2 max-w-md"}`}>
          <Card className="p-4 bg-zinc-900 border-zinc-800 text-center">
            <Database className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-zinc-100">{tables}</p>
            <p className="text-xs text-zinc-500">{live ? "Tables in your DB" : "Tables Monitored"}</p>
          </Card>
          {live && (
            <Card className="p-4 bg-zinc-900 border-zinc-800 text-center">
              <FlaskConical className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-zinc-100">{formatCount(columns)}</p>
              <p className="text-xs text-zinc-500">Columns</p>
            </Card>
          )}
          <Card className="p-4 bg-zinc-900 border-zinc-800 text-center">
            <Activity className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
            <p
              className={`text-2xl font-bold ${
                score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"
              }`}
            >
              {score}/100
            </p>
            <p className="text-xs text-zinc-500">Governance Score</p>
          </Card>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!live && (
            <FeatureCard
              href="/connect"
              icon={<Plug className="w-5 h-5 text-sky-400" />}
              accent="sky"
              title="Connect a database"
              body="Paste a Postgres or MySQL connection string. Credentials stay in your browser tab — no account, nothing stored on the server."
              cta="Connect now"
            />
          )}
          <FeatureCard
            href="/pii-scanner"
            icon={<Shield className="w-5 h-5 text-red-400" />}
            accent="red"
            title="PII Scanner"
            body="Classifies every column from its name, its sampled values, and AI — catching personal data even in columns whose names give nothing away."
            cta="Scan tables"
          />
          <FeatureCard
            href="/dashboard"
            icon={<Activity className="w-5 h-5 text-emerald-400" />}
            accent="emerald"
            title="Governance Dashboard"
            body="A single score for how well your schema documents itself, with a ranked list of exactly what's dragging it down."
            cta="View dashboard"
          />
          <FeatureCard
            href="/quality"
            icon={<FlaskConical className="w-5 h-5 text-violet-400" />}
            accent="violet"
            title="Data Quality"
            body="Profiles your tables and generates the completeness, uniqueness and cardinality checks you'd otherwise write by hand."
            cta="Run checks"
          />
          <FeatureCard
            href="/lineage"
            icon={<GitFork className="w-5 h-5 text-blue-400" />}
            accent="blue"
            title="Lineage"
            body="Maps foreign keys into a dependency graph, so you can see what breaks before you drop a table."
            cta="Explore lineage"
          />
          <FeatureCard
            href="/chat"
            icon={<MessageSquare className="w-5 h-5 text-purple-400" />}
            accent="purple"
            title="Metadata Chat"
            body="Ask questions about your schema in plain English. The model sees structure only — never a row of your data."
            cta="Start chatting"
          />
        </div>

        {/* Privacy note */}
        <Card className="mt-10 p-5 bg-zinc-900 border-zinc-800">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 leading-relaxed">
              <span className="text-zinc-300 font-medium">No account, no storage.</span> MetaGuard has
              no user database. Your credentials live in this browser tab&apos;s{" "}
              <span className="font-mono text-zinc-400">sessionStorage</span>, travel with each request
              over HTTPS, open one read-only connection, and are discarded when the request ends.
              Profiling uses aggregate queries only — no cell value is read, displayed, or sent to the
              AI model.{" "}
              <Link href="/connect" className="text-zinc-300 underline underline-offset-2">
                Details
              </Link>
            </p>
          </div>
        </Card>

        {/* Tech stack */}
        <div className="mt-12 text-center">
          <p className="text-xs text-zinc-600 mb-3">BUILT WITH</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Next.js", "TypeScript", "PostgreSQL", "MySQL", "OpenMetadata", "Gemini AI", "Tailwind CSS"].map(
              (tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500"
                >
                  {tech}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  sky: "hover:border-sky-500/30 bg-sky-500/10 border-sky-500/20 text-sky-400",
  red: "hover:border-red-500/30 bg-red-500/10 border-red-500/20 text-red-400",
  emerald: "hover:border-emerald-500/30 bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  violet: "hover:border-violet-500/30 bg-violet-500/10 border-violet-500/20 text-violet-400",
  blue: "hover:border-blue-500/30 bg-blue-500/10 border-blue-500/20 text-blue-400",
  purple: "hover:border-purple-500/30 bg-purple-500/10 border-purple-500/20 text-purple-400",
};

function FeatureCard({
  href,
  icon,
  accent,
  title,
  body,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  accent: keyof typeof ACCENTS;
  title: string;
  body: string;
  cta: string;
}) {
  const classes = ACCENTS[accent].split(" ");
  const hover = classes[0];
  const iconBox = classes.slice(1, 3).join(" ");
  const text = classes[3];

  return (
    <Link href={href}>
      <Card className={`p-6 bg-zinc-900 border-zinc-800 transition-all group cursor-pointer h-full ${hover}`}>
        <div className={`p-2 rounded-lg border w-fit mb-4 ${iconBox}`}>{icon}</div>
        <h3 className="font-semibold text-zinc-100 mb-2">{title}</h3>
        <p className="text-sm text-zinc-500 mb-4">{body}</p>
        <div className={`flex items-center gap-1 text-xs group-hover:gap-2 transition-all ${text}`}>
          {cta} <ArrowRight className="w-3 h-3" />
        </div>
      </Card>
    </Link>
  );
}
