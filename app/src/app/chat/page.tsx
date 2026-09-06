"use client";

import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, Loader2, Sparkles, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useConnection } from "@/lib/connection-context";
import { SourcePill } from "@/components/source-pill";

type Message = {
  role: "user" | "assistant";
  content: string;
  intent?: string;
};

const EXAMPLE_PROMPTS = [
  "Which tables have PII columns?",
  "Show me all columns in the customers table",
  "What tables have no description?",
  "What happens if I drop the customers table?",
  "List all tables and their column counts",
];

const LIVE_EXAMPLE_PROMPTS = [
  "Which columns in this database look like personal data?",
  "Which tables have no primary key?",
  "How do the biggest tables relate to each other?",
  "What would break if I dropped the users table?",
  "Summarise this schema for someone joining the team",
];

export default function Chat() {
  const { connection, call } = useConnection();
  const live = Boolean(connection);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const msg = text || input;
    if (!msg.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      // When a database is connected the question is answered against its real
      // schema; otherwise it falls back to the OpenMetadata/demo catalog.
      const data = live
        ? await call<{ answer: string; narrowed?: boolean; tablesConsidered?: number }>(
            "/api/connect/chat",
            { message: msg }
          ).catch((e: Error) => ({ error: e.message }) as { error: string })
        : await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          }).then((r) => r.json());

      if ("error" in data && data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            intent: live
              ? data.narrowed
                ? `${data.tablesConsidered} relevant tables`
                : "live schema"
              : data.intent,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <MessageSquare className="w-5 h-5 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold">Metadata Chat</h1>
            <SourcePill live={live} label={connection?.database} />
          </div>
          <p className="text-zinc-400">
            {live
              ? `Ask about ${connection?.database} in plain English. Gemini sees your schema — table names, columns, types, comments and foreign keys — never any row data.`
              : "Ask questions about your data in plain English — powered by AI and OpenMetadata."}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Sparkles className="w-10 h-10 text-purple-500/30 mb-4" />
              <p className="text-zinc-500 mb-6">Try one of these questions:</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {(live ? LIVE_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 hover:border-purple-500/30 transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                </div>
              )}
              <Card
                className={`max-w-[80%] p-4 ${
                  msg.role === "user"
                    ? "bg-zinc-800 border-zinc-700"
                    : "bg-zinc-900 border-zinc-800"
                }`}
              >
                {msg.intent && (
                  <Badge
                    variant="outline"
                    className="mb-2 text-[10px] border-purple-500/30 text-purple-400"
                  >
                    {msg.intent}
                  </Badge>
                )}
                {msg.role === "assistant" ? (
                  <div className="text-sm text-zinc-200 leading-relaxed prose prose-invert prose-sm max-w-none
                    prose-headings:text-zinc-100 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                    prose-h3:text-base prose-h2:text-lg
                    prose-p:text-zinc-300 prose-p:my-1.5
                    prose-strong:text-zinc-100
                    prose-code:text-purple-300 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
                    prose-table:border-collapse prose-table:w-full prose-table:my-3
                    prose-th:bg-zinc-800 prose-th:text-zinc-300 prose-th:text-xs prose-th:font-medium prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-zinc-700
                    prose-td:text-zinc-400 prose-td:text-xs prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-zinc-800
                    prose-li:text-zinc-300 prose-li:my-0.5
                    prose-ul:my-2 prose-ol:my-2
                    prose-a:text-purple-400 prose-a:no-underline hover:prose-a:underline
                    prose-blockquote:border-purple-500/30 prose-blockquote:text-zinc-400
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-200">{msg.content}</div>
                )}
              </Card>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <Card className="p-4 bg-zinc-900 border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {live ? "Reading your schema..." : "Querying OpenMetadata..."}
                </div>
              </Card>
            </div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about your metadata..."
            className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}