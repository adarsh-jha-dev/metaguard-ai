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
  BookOpen,
  Bell,
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-6 border ${
              live
                ? "bg-brand/10 border-brand/20 text-brand"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${live ? "bg-brand animate-pulse" : "bg-faint-foreground"}`}
            />
            {live
              ? `Connected to ${connection?.database}`
              : catalogLoading
                ? "Connecting…"
                : "Exploring the sample catalog"}
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            MetaGuard AI
          </h1>
          <p className="text-muted-foreground text-xl max-w-xl mx-auto">
            Point it at a database and get back what you actually needed to know: where the personal
            data is, what&apos;s undocumented, and what breaks if you change something.
          </p>

          {!live && (
            <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
              <Link href="/connect">
                <Button className="bg-brand/90 hover:bg-brand text-on-accent font-medium cursor-pointer">
                  <Plug className="w-4 h-4 mr-2" />
                  Connect your database
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" className="border-border-strong text-foreground-subtle cursor-pointer">
                  Try the sample catalog
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className={`grid gap-4 mb-12 mx-auto ${live ? "grid-cols-3 max-w-2xl" : "grid-cols-2 max-w-md"}`}>
          <Card className="p-4 bg-card border-border text-center">
            <Database className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-3xl font-bold text-foreground">{tables}</p>
            <p className="text-sm text-muted-foreground">{live ? "Tables in your DB" : "Tables Monitored"}</p>
          </Card>
          {live && (
            <Card className="p-4 bg-card border-border text-center">
              <FlaskConical className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-3xl font-bold text-foreground">{formatCount(columns)}</p>
              <p className="text-sm text-muted-foreground">Columns</p>
            </Card>
          )}
          <Card className="p-4 bg-card border-border text-center">
            <Activity className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p
              className={`text-3xl font-bold ${
                score >= 80 ? "text-ok" : score >= 50 ? "text-warn" : "text-critical"
              }`}
            >
              {score}/100
            </p>
            <p className="text-sm text-muted-foreground">Governance Score</p>
          </Card>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!live && (
            <FeatureCard
              href="/connect"
              icon={<Plug className="w-5 h-5 text-hue-sky" />}
              accent="sky"
              title="Connect a database"
              body="Paste a Postgres or MySQL connection string. Credentials stay in your browser tab — no account, nothing stored on the server."
              cta="Connect now"
            />
          )}
          <FeatureCard
            href="/pii-scanner"
            icon={<Shield className="w-5 h-5 text-critical" />}
            accent="red"
            title="PII Scanner"
            body="Classifies every column from its name, its sampled values, and AI — catching personal data even in columns whose names give nothing away."
            cta="Scan tables"
          />
          <FeatureCard
            href="/dashboard"
            icon={<Activity className="w-5 h-5 text-brand" />}
            accent="emerald"
            title="Governance Dashboard"
            body="A single score for how well your schema documents itself, with a ranked list of exactly what's dragging it down."
            cta="View dashboard"
          />
          <FeatureCard
            href="/quality"
            icon={<FlaskConical className="w-5 h-5 text-hue-violet" />}
            accent="violet"
            title="Data Quality"
            body="Profiles your tables and generates the completeness, uniqueness and cardinality checks you'd otherwise write by hand."
            cta="Run checks"
          />
          <FeatureCard
            href="/lineage"
            icon={<GitFork className="w-5 h-5 text-hue-blue" />}
            accent="blue"
            title="Lineage"
            body="Maps foreign keys into a dependency graph, so you can see what breaks before you drop a table."
            cta="Explore lineage"
          />
          <FeatureCard
            href="/glossary"
            icon={<BookOpen className="w-5 h-5 text-hue-amber" />}
            accent="amber"
            title="Glossary AI"
            body="Derives a business glossary from your own schema — every table an entity, every shared column an attribute — and writes the definitions you never got round to."
            cta="Build a glossary"
          />
          <FeatureCard
            href="/activity"
            icon={<Bell className="w-5 h-5 text-hue-cyan" />}
            accent="cyan"
            title="Activity Feed"
            body="Reads your database's own statistics to show what's been written, what needs vacuuming, and which tables are scanned end to end."
            cta="See activity"
          />
          <FeatureCard
            href="/chat"
            icon={<MessageSquare className="w-5 h-5 text-hue-purple" />}
            accent="purple"
            title="Metadata Chat"
            body="Ask questions about your schema in plain English. The model sees structure only — never a row of your data."
            cta="Start chatting"
          />
        </div>

        {/* Privacy note */}
        <Card className="mt-10 p-5 bg-card border-border">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-brand mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground-subtle font-medium">No account, no storage.</span> MetaGuard has
              no user database. Your credentials live in this browser tab&apos;s{" "}
              <span className="font-mono text-muted-foreground">sessionStorage</span>, travel with each request
              over HTTPS, open one read-only connection, and are discarded when the request ends.
              Profiling uses aggregate queries only — no cell value is read, displayed, or sent to the
              AI model.{" "}
              <Link href="/connect" className="text-foreground-subtle underline underline-offset-2">
                Details
              </Link>
            </p>
          </div>
        </Card>

        {/* Tech stack */}
        <div className="mt-12 text-center">
          <p className="text-sm text-faint-foreground mb-3">BUILT WITH</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Next.js", "TypeScript", "PostgreSQL", "MySQL", "OpenMetadata", "Gemini AI", "Tailwind CSS"].map(
              (tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 text-sm bg-card border border-border rounded-full text-muted-foreground"
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
  sky: "hover:border-hue-sky/30 bg-hue-sky/10 border-hue-sky/20 text-hue-sky",
  red: "hover:border-critical/30 bg-critical/10 border-critical/20 text-critical",
  emerald: "hover:border-brand/30 bg-brand/10 border-brand/20 text-brand",
  violet: "hover:border-hue-violet/30 bg-hue-violet/10 border-hue-violet/20 text-hue-violet",
  blue: "hover:border-hue-blue/30 bg-hue-blue/10 border-hue-blue/20 text-hue-blue",
  purple: "hover:border-hue-purple/30 bg-hue-purple/10 border-hue-purple/20 text-hue-purple",
  amber: "hover:border-hue-amber/30 bg-hue-amber/10 border-hue-amber/20 text-hue-amber",
  cyan: "hover:border-hue-cyan/30 bg-hue-cyan/10 border-hue-cyan/20 text-hue-cyan",
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
    <Link href={href} className="h-full">
      <Card
        className={`gap-3 p-5 bg-card border border-border ring-0 transition-colors group cursor-pointer h-full ${hover}`}
      >
        <div className={`p-2 rounded-lg border w-fit ${iconBox}`}>{icon}</div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="text-base text-muted-foreground leading-relaxed">{body}</p>
        <div
          className={`mt-auto flex items-center gap-1.5 text-sm font-medium group-hover:gap-2.5 transition-all ${text}`}
        >
          {cta} <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </Card>
    </Link>
  );
}
