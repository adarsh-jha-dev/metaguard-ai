"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Check,
  Database,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Plug,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useConnection, type StoredConnection } from "@/lib/connection-context";
import { DEFAULT_PORTS, parseConnectionUrl } from "@/lib/db/url";
import type { Dialect } from "@/lib/db/types";

type TestResult = {
  ok: true;
  version: string;
  dialect: Dialect;
  database: string;
  totalTables: number;
  schemas: { name: string; tableCount: number }[];
};

const BLANK: StoredConnection = {
  dialect: "postgres",
  host: "",
  port: 5432,
  database: "",
  user: "",
  password: "",
  ssl: "require",
  sslRejectUnauthorized: true,
};

export default function ConnectPage() {
  const { connection } = useConnection();
  // Keying on the active connection lets the form seed itself from it on mount
  // and re-seed if it changes, without an effect that copies one into the other.
  return (
    <ConnectForm
      key={connection ? `${connection.host}/${connection.database}` : "new"}
      existing={connection}
    />
  );
}

function ConnectForm({ existing }: { existing: StoredConnection | null }) {
  const router = useRouter();
  const { connection, connect, disconnect, catalog, catalogLoading } = useConnection();

  // An existing connection pre-fills every field except the password, which is
  // never rendered back into the form.
  const [mode, setMode] = useState<"url" | "fields">(existing ? "fields" : "url");
  const [url, setUrl] = useState("");
  const [form, setForm] = useState<StoredConnection>(existing ? { ...existing, password: "" } : BLANK);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const set = <K extends keyof StoredConnection>(key: K, value: StoredConnection[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Resolves whichever input mode is active into a Connection. */
  const buildConnection = useMemo(
    () => (): StoredConnection => {
      if (mode === "url") {
        const parsed = parseConnectionUrl(url);
        return { ...BLANK, ...parsed } as StoredConnection;
      }
      return { ...form, port: Number(form.port) || DEFAULT_PORTS[form.dialect] };
    },
    [mode, url, form]
  );

  async function testConnection() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const candidate = buildConnection();
      const res = await fetch("/api/connect/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: candidate }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError({ message: data.error ?? `Connection failed (${res.status})`, hint: data.hint });
        return;
      }
      setResult(data as TestResult);
      // Normalise the form to whatever actually worked.
      setForm(candidate);
      setMode("fields");
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Connection failed." });
    } finally {
      setTesting(false);
    }
  }

  function finish(schema?: string) {
    const next = {
      ...form,
      schema: schema ?? form.schema,
      label: `${form.database} @ ${form.host}`,
    };
    connect(next);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-hue-sky/10 border border-hue-sky/20">
              <Plug className="w-5 h-5 text-hue-sky" />
            </div>
            <h1 className="text-3xl font-bold">Connect a database</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Point MetaGuard at your own Postgres or MySQL and every tool on the left — PII scanning,
            governance scoring, quality checks, lineage — runs against your real schema instead of the
            sample catalog.
          </p>
        </div>

        {connection && (
          <Card className="p-5 mb-6 bg-brand/5 border-brand/20">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-brand/10 border border-brand/20 mt-0.5">
                  <Check className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Connected to {connection.database}
                    <span className="text-muted-foreground font-normal"> @ {connection.host}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {catalogLoading
                      ? "Reading schema…"
                      : catalog
                        ? `${catalog.tables.length} tables · ${catalog.foreignKeys.length} relationships · governance score ${catalog.governance.score}/100`
                        : "Schema not loaded yet"}
                    {connection.schema ? ` · schema "${connection.schema}"` : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-border-strong text-foreground-subtle hover:bg-critical/10 hover:border-critical/40 cursor-pointer"
                onClick={disconnect}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Disconnect &amp; forget
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Form ───────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-6 bg-card border-border">
              <div className="flex gap-1 p-1 rounded-lg bg-background border border-border w-fit mb-6">
                {(["url", "fields"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground-subtle"
                    }`}
                  >
                    {m === "url" ? "Connection URL" : "Individual fields"}
                  </button>
                ))}
              </div>

              {mode === "url" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Connection string
                  </label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="postgresql://user:password@db.example.com:5432/mydb?sslmode=require"
                    className="bg-background border-border font-mono text-sm"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-sm text-faint-foreground">
                    The URL Supabase, Neon, Railway, PlanetScale and RDS all hand you. It is parsed in
                    your browser and never stored.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Database type">
                      <select
                        value={form.dialect}
                        onChange={(e) => {
                          const dialect = e.target.value as Dialect;
                          setForm((f) => ({ ...f, dialect, port: DEFAULT_PORTS[dialect] }));
                        }}
                        className="w-full h-9 rounded-md bg-background border border-border px-3 text-base text-foreground cursor-pointer"
                      >
                        <option value="postgres">PostgreSQL</option>
                        <option value="mysql">MySQL / MariaDB</option>
                      </select>
                    </Field>
                    <Field label="Port">
                      <Input
                        type="number"
                        value={form.port}
                        onChange={(e) => set("port", Number(e.target.value))}
                        className="bg-background border-border"
                      />
                    </Field>
                  </div>

                  <Field label="Host">
                    <Input
                      value={form.host}
                      onChange={(e) => set("host", e.target.value)}
                      placeholder="db.abcdefgh.supabase.co"
                      className="bg-background border-border font-mono text-sm"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Database">
                      <Input
                        value={form.database}
                        onChange={(e) => set("database", e.target.value)}
                        placeholder="postgres"
                        className="bg-background border-border font-mono text-sm"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Schema (optional)">
                      <Input
                        value={form.schema ?? ""}
                        onChange={(e) => set("schema", e.target.value || undefined)}
                        placeholder="public"
                        className="bg-background border-border font-mono text-sm"
                        autoComplete="off"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Username">
                      <Input
                        value={form.user}
                        onChange={(e) => set("user", e.target.value)}
                        className="bg-background border-border font-mono text-sm"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Password">
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(e) => set("password", e.target.value)}
                          className="bg-background border-border font-mono text-sm pr-9"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-faint-foreground hover:text-muted-foreground cursor-pointer"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SSL mode">
                      <select
                        value={form.ssl}
                        onChange={(e) => set("ssl", e.target.value as StoredConnection["ssl"])}
                        className="w-full h-9 rounded-md bg-background border border-border px-3 text-base text-foreground cursor-pointer"
                      >
                        <option value="require">Require (recommended)</option>
                        <option value="prefer">Prefer — fall back to plaintext</option>
                        <option value="disable">Disable</option>
                      </select>
                    </Field>
                    <Field label="Certificate check">
                      <select
                        value={form.sslRejectUnauthorized === false ? "off" : "on"}
                        onChange={(e) => set("sslRejectUnauthorized", e.target.value === "on")}
                        className="w-full h-9 rounded-md bg-background border border-border px-3 text-base text-foreground cursor-pointer"
                      >
                        <option value="on">Strict</option>
                        <option value="off">Allow self-signed</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mt-6">
                <Button
                  onClick={testConnection}
                  disabled={testing}
                  className="bg-hue-sky/90 hover:bg-hue-sky text-on-accent font-medium cursor-pointer"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Plug className="w-4 h-4 mr-2" /> Test connection
                    </>
                  )}
                </Button>
                {result && (
                  <Button
                    onClick={() => finish()}
                    className="bg-brand/90 hover:bg-brand text-on-accent font-medium cursor-pointer"
                  >
                    Analyse this database
                  </Button>
                )}
              </div>

              {error && (
                <div className="mt-4 p-4 rounded-lg bg-critical/5 border border-critical/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-critical mt-0.5 shrink-0" />
                    <div>
                      <p className="text-base text-critical">{error.message}</p>
                      {error.hint && <p className="text-sm text-muted-foreground mt-1.5">{error.hint}</p>}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {result && (
              <Card className="p-6 bg-card border-brand/20">
                <div className="flex items-center gap-2 mb-4">
                  <Check className="w-4 h-4 text-brand" />
                  <p className="text-base font-medium text-foreground">Connected</p>
                  <Badge variant="outline" className="border-border-strong text-muted-foreground text-xs">
                    read-only
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground font-mono mb-4 break-all">{result.version}</p>

                <p className="text-sm text-muted-foreground mb-2">
                  {result.totalTables} tables visible across {result.schemas.length} schema
                  {result.schemas.length === 1 ? "" : "s"} — pick one to focus on, or analyse everything.
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.schemas.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => finish(s.name)}
                      className="px-3 py-1.5 rounded-md bg-background border border-border hover:border-brand/40 text-sm cursor-pointer transition-colors"
                    >
                      <span className="font-mono text-foreground">{s.name}</span>
                      <span className="text-faint-foreground ml-2">{s.tableCount}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* ── Privacy panel ──────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-6 bg-card border-border">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-brand" />
                <h2 className="text-base font-medium text-foreground">What happens to your credentials</h2>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <Guarantee icon={Lock} title="Never stored on the server">
                  There is no user account and no database behind MetaGuard. Credentials arrive in one
                  request, open one connection, and are gone when the request ends.
                </Guarantee>
                <Guarantee icon={KeyRound} title="Held only in this browser tab">
                  They live in <span className="font-mono text-foreground-subtle">sessionStorage</span>, which
                  the browser wipes when you close the tab. &ldquo;Disconnect &amp; forget&rdquo; clears
                  it immediately.
                </Guarantee>
                <Guarantee icon={Eye} title="Read-only, always">
                  Every session is opened with <span className="font-mono text-foreground-subtle">READ ONLY</span>{" "}
                  set at the transaction level, so MetaGuard cannot modify your data even by accident.
                </Guarantee>
                <Guarantee icon={Database} title="Your rows stay in your database">
                  Profiling runs <span className="text-foreground-subtle">aggregate</span> queries — counts of
                  nulls, distinct values, and pattern matches. No cell value is ever selected, shown, or
                  sent to the AI model. Only column <em>names</em> and types reach Gemini.
                </Guarantee>
              </ul>
            </Card>

            <Card className="p-5 bg-card border-border">
              <h3 className="text-base font-medium text-foreground mb-2">Before you connect</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>
                  Use a <span className="text-foreground-subtle">read-only role</span> if you have one. MetaGuard
                  only ever needs <span className="font-mono">SELECT</span> and catalog access.
                </li>
                <li>
                  Managed databases usually block unknown IPs — you may need to allow public access or
                  allowlist this deployment&apos;s egress IP.
                </li>
                <li>
                  Prefer a staging or sample database for a first run so you can see what the scan does.
                </li>
              </ul>
            </Card>

            <Card className="p-5 bg-card border-border">
              <h3 className="text-base font-medium text-foreground mb-2">No database handy?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Every page falls back to a built-in sample catalog, so you can explore the whole product
                without connecting anything.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-border-strong text-foreground-subtle cursor-pointer"
                onClick={() => {
                  disconnect();
                  router.push("/dashboard");
                }}
              >
                Explore the demo catalog
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Guarantee({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <Icon className="w-3.5 h-3.5 text-faint-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-foreground font-medium mb-0.5">{title}</p>
        <p className="leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
