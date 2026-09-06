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
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="w-56 border-r border-zinc-800 p-4 flex flex-col gap-1">
        <Link href="/" className="flex items-center gap-2 px-3 py-4 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="font-bold text-zinc-100">MetaGuard</span>
        </Link>

        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-3 mb-1">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Active data source — every page reads from whatever this says. */}
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <Link
            href="/connect"
            className={`block px-3 py-2.5 rounded-lg transition-colors ${
              pathname === "/connect" ? "bg-zinc-800" : "hover:bg-zinc-900"
            }`}
          >
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Data source</p>
            {!ready ? (
              <div className="h-4" />
            ) : connection ? (
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-200 truncate font-mono">{connection.database}</p>
                  <p className="text-[10px] text-zinc-600 truncate">
                    {catalogLoading ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> reading schema
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
              <div className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300">
                <Plug className="w-3.5 h-3.5" />
                <span className="text-xs">Connect your database</span>
              </div>
            )}
          </Link>
          {ready && !connection && (
            <p className="text-[10px] text-zinc-700 px-3 mt-1.5 flex items-center gap-1">
              <Database className="w-2.5 h-2.5" /> using sample catalog
            </p>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
