"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Shield, Activity, MessageSquare, ArrowRight, Database } from "lucide-react";

export default function Home() {
  const [stats, setStats] = useState({ tables: 0, score: 0 });

  useEffect(() => {
    fetch("/api/tables").then(r => r.json()).then(d => {
      setStats(prev => ({ ...prev, tables: d.data?.length || 0 }));
    }).catch(() => {});
    fetch("/api/health").then(r => r.json()).then(d => {
      setStats(prev => ({ ...prev, score: d.score || 0 }));
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connected to OpenMetadata
          </div>
          <h1 className="text-4xl font-bold mb-4 bg-linear-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            MetaGuard AI
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            AI-powered data governance copilot that watches, warns, and auto-fixes metadata issues.
          </p>
        </div>

        {/* Live Stats */}
        <div className="grid grid-cols-2 gap-4 mb-12 max-w-md mx-auto">
          <Card className="p-4 bg-zinc-900 border-zinc-800 text-center">
            <Database className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-zinc-100">{stats.tables}</p>
            <p className="text-xs text-zinc-500">Tables Monitored</p>
          </Card>
          <Card className="p-4 bg-zinc-900 border-zinc-800 text-center">
            <Activity className="w-5 h-5 text-zinc-500 mx-auto mb-2" />
            <p className={`text-2xl font-bold ${stats.score >= 80 ? "text-green-400" : stats.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {stats.score}/100
            </p>
            <p className="text-xs text-zinc-500">Governance Score</p>
          </Card>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/pii-scanner">
            <Card className="p-6 bg-zinc-900 border-zinc-800 hover:border-red-500/30 transition-all group cursor-pointer h-full">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 w-fit mb-4">
                <Shield className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="font-semibold text-zinc-100 mb-2">PII Scanner</h3>
              <p className="text-sm text-zinc-500 mb-4">
                AI scans your table columns and classifies PII automatically. Approve tags with one click.
              </p>
              <div className="flex items-center gap-1 text-xs text-red-400 group-hover:gap-2 transition-all">
                Scan tables <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>

          <Link href="/dashboard">
            <Card className="p-6 bg-zinc-900 border-zinc-800 hover:border-emerald-500/30 transition-all group cursor-pointer h-full">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 w-fit mb-4">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-zinc-100 mb-2">Governance Dashboard</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Real-time governance health score with description, tag, and ownership coverage metrics.
              </p>
              <div className="flex items-center gap-1 text-xs text-emerald-400 group-hover:gap-2 transition-all">
                View dashboard <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>

          <Link href="/chat">
            <Card className="p-6 bg-zinc-900 border-zinc-800 hover:border-purple-500/30 transition-all group cursor-pointer h-full">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 w-fit mb-4">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="font-semibold text-zinc-100 mb-2">Metadata Chat</h3>
              <p className="text-sm text-zinc-500 mb-4">
                Ask questions about your data in plain English. The AI queries OpenMetadata for you.
              </p>
              <div className="flex items-center gap-1 text-xs text-purple-400 group-hover:gap-2 transition-all">
                Start chatting <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </Link>
        </div>

        {/* Tech Stack */}
        <div className="mt-16 text-center">
          <p className="text-xs text-zinc-600 mb-3">BUILT WITH</p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Next.js", "TypeScript", "OpenMetadata", "Gemini AI", "Tailwind CSS", "shadcn/ui"].map((tech) => (
              <span key={tech} className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}