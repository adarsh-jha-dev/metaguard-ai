"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, Sparkles, MessageSquare, Database, LayoutDashboard, Workflow, Radio, RefreshCw } from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import LiveActivity from "./live-activity";

type FeedItem = {
  id: string;
  entityType: string;
  entityName: string;
  type: string;
  createdBy?: string;
  updatedAt?: number;
  postCount: number;
  latestMessage?: string;
};

const entityIcon = (type: string) => {
  switch (type) {
    case "table": return <Database className="w-3.5 h-3.5 text-hue-blue" />;
    case "dashboard": return <LayoutDashboard className="w-3.5 h-3.5 text-hue-purple" />;
    case "pipeline": return <Workflow className="w-3.5 h-3.5 text-hue-orange" />;
    case "topic": return <Radio className="w-3.5 h-3.5 text-hue-cyan" />;
    default: return <Database className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const typeColor = (type: string) => {
  if (type?.includes("Announcement")) return "border-warn/30 text-warn bg-warn/5";
  if (type?.includes("Task")) return "border-hue-blue/30 text-hue-blue bg-hue-blue/5";
  return "border-border-strong text-muted-foreground bg-muted/40";
};

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ActivityPage() {
  const { connection } = useConnection();
  if (connection) return <LiveActivity />;
  return <OpenMetadataActivity />;
}

function OpenMetadataActivity() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [total, setTotal] = useState(0);

  const load = (withSummary = false) => {
    setLoading(true);
    if (withSummary) setSummarizing(true);
    fetch(`/api/activity${withSummary ? "?summary=true" : ""}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
        if (withSummary && d.aiSummary) setAiSummary(d.aiSummary);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setSummarizing(false);
      });
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-hue-cyan/10 border border-hue-cyan/20">
                <Activity className="w-5 h-5 text-hue-cyan" />
              </div>
              <h1 className="text-3xl font-bold">Activity Feed</h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(false)}
              disabled={loading}
              className="border-border-strong text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <p className="text-muted-foreground">
            Real-time conversations, tasks, and announcements from your OpenMetadata instance.
          </p>
        </div>

        {/* AI Summary Card */}
        <Card className="p-5 border-border bg-card mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-hue-cyan" />
              <h2 className="font-semibold">AI Activity Summary</h2>
            </div>
            <Button
              size="sm"
              onClick={() => load(true)}
              disabled={summarizing || loading || items.length === 0}
              className="bg-hue-cyan hover:bg-hue-cyan/85 text-on-accent"
            >
              {summarizing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Summarizing…</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Summarize Activity</>
              )}
            </Button>
          </div>
          {aiSummary ? (
            <p className="text-base text-foreground-subtle leading-relaxed">{aiSummary}</p>
          ) : (
            <p className="text-base text-faint-foreground">
              {items.length === 0
                ? "No recent activity found."
                : "Click \"Summarize Activity\" to get an AI-generated overview of recent events."}
            </p>
          )}
        </Card>

        {/* Stats */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-base text-muted-foreground">{total} feed items</span>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-10 border-border bg-card text-center text-muted-foreground">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No activity feed items found.</p>
            <p className="text-sm mt-1">Start conversations and create tasks in OpenMetadata to see them here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className="p-4 border-border bg-card hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-lg bg-muted border border-border-strong shrink-0">
                    {entityIcon(item.entityType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-base font-medium text-foreground truncate">{item.entityName}</span>
                      <Badge variant="outline" className="text-xs border-border-strong text-muted-foreground">
                        {item.entityType}
                      </Badge>
                      {item.type && (
                        <Badge variant="outline" className={`text-xs ${typeColor(item.type)}`}>
                          {item.type}
                        </Badge>
                      )}
                    </div>
                    {item.latestMessage && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-1.5">{item.latestMessage}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-faint-foreground">
                      {item.createdBy && <span>by {item.createdBy}</span>}
                      {item.updatedAt && <span>{timeAgo(item.updatedAt)}</span>}
                      {item.postCount > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {item.postCount} {item.postCount === 1 ? "reply" : "replies"}
                        </span>
                      )}
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
