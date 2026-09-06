"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import { useConnection } from "@/lib/connection-context";

/**
 * Glossaries and activity feeds are OpenMetadata concepts — a raw database has
 * neither. Rather than hide these pages when a database is connected, say so.
 */
export function OpenMetadataOnlyNotice({ feature }: { feature: string }) {
  const { connection } = useConnection();
  if (!connection) return null;

  return (
    <Card className="p-4 mb-6 bg-amber-500/5 border-amber-500/20">
      <div className="flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-400 leading-relaxed">
          You&apos;re connected to <span className="font-mono text-zinc-200">{connection.database}</span>,
          but {feature} lives in OpenMetadata — a raw database has nothing equivalent to read. This page
          still shows the OpenMetadata catalog.{" "}
          <Link href="/pii-scanner" className="text-zinc-300 underline underline-offset-2">
            PII Scanner
          </Link>
          ,{" "}
          <Link href="/quality" className="text-zinc-300 underline underline-offset-2">
            Data Quality
          </Link>{" "}
          and{" "}
          <Link href="/lineage" className="text-zinc-300 underline underline-offset-2">
            Lineage
          </Link>{" "}
          all run against your live schema.
        </p>
      </div>
    </Card>
  );
}
