"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plug } from "lucide-react";
import { useConnection } from "@/lib/connection-context";

/** Renders nothing once a database is connected, so pages need no guard. */
export function SampleCatalogNotice({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  if (connection) return null;

  return (
    <Card className="p-4 mb-6 bg-hue-sky/5 border border-hue-sky/20 ring-0 flex-row items-center justify-between gap-4 flex-wrap">
      <p className="flex-1 min-w-64 text-base text-foreground-subtle">{children}</p>
      <Link href="/connect" className="shrink-0">
        <Button size="sm" className="bg-hue-sky/90 hover:bg-hue-sky text-on-accent cursor-pointer">
          <Plug className="w-3.5 h-3.5 mr-1.5" />
          Connect a database
        </Button>
      </Link>
    </Card>
  );
}
