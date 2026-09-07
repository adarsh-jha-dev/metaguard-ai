"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Activity,
  MessageSquare,
  Home,
  FlaskConical,
  GitFork,
  BookOpen,
  Bell,
  Plug,
  Database,
  Loader2,
} from "lucide-react";
import { useConnection } from "@/lib/connection-context";
import { ThemeToggle } from "@/components/theme-toggle";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: Activity },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/pii-scanner", label: "PII Scanner", icon: Shield },
      { href: "/glossary", label: "Glossary AI", icon: BookOpen },
      { href: "/quality", label: "Data Quality", icon: FlaskConical },
    ],
  },
  {
    label: "Explore",
    items: [
      { href: "/lineage", label: "Lineage", icon: GitFork },
      { href: "/activity", label: "Activity", icon: Bell },
      { href: "/chat", label: "Chat", icon: MessageSquare },
    ],
  },
];

export default function LayoutNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { connection, catalog, catalogLoading, ready } = useConnection();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-border bg-sidebar p-4 flex flex-col gap-1">
        <Link href="/" className="flex items-center gap-2.5 px-3 py-4 mb-2">
          <div className="w-9 h-9 rounded-lg bg-brand/15 ring-1 ring-brand/25 flex items-center justify-center">
            <Shield className="w-4.5 h-4.5 text-brand" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-foreground">MetaGuard</span>
        </Link>

        <nav className="flex flex-col gap-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-medium text-faint-foreground uppercase tracking-wider px-3 mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-base transition-colors ${
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand" />
                      )}
                      <Icon className={`w-4.5 h-4.5 ${active ? "text-brand" : ""}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Active data source — every page reads from whatever this says. */}
        <div className="mt-auto pt-4 flex flex-col gap-3">
          <ThemeToggle />
          <div className="border-t border-border pt-3">
            <Link
              href="/connect"
              className={`block px-3 py-2.5 rounded-lg transition-colors ${
                pathname === "/connect" ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <p className="text-xs font-medium text-faint-foreground uppercase tracking-wider mb-1.5">
                Data source
              </p>
              {!ready ? (
                <div className="h-5" />
              ) : connection ? (
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand mt-2 shrink-0 animate-pulse" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate font-mono">{connection.database}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {catalogLoading ? (
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> reading schema
                        </span>
                      ) : catalog ? (
                        `${catalog.tables.length} tables · live`
                      ) : (
                        connection.host
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                  <Plug className="w-4 h-4" />
                  <span className="text-sm">Connect your database</span>
                </div>
              )}
            </Link>
            {ready && !connection && (
              <p className="text-xs text-faint-foreground px-3 mt-1.5 flex items-center gap-1.5">
                <Database className="w-3 h-3" /> using sample catalog
              </p>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
