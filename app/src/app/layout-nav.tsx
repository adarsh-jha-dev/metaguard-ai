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
} from "lucide-react";

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

        <div className="mt-auto pt-4 border-t border-zinc-800">
          <div className="px-3 py-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Powered by</p>
            <p className="text-xs text-zinc-500">OpenMetadata + Gemini AI</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
