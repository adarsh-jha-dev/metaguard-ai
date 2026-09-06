import { Badge } from "@/components/ui/badge";

/** Small indicator telling the user whether a page is reading live data or the sample catalog. */
export function SourcePill({ live, label }: { live: boolean; label?: string }) {
  return (
    <Badge
      variant="outline"
      className={
        live
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]"
          : "border-zinc-700 bg-zinc-900 text-zinc-500 text-[10px]"
      }
    >
      {live ? `live · ${label}` : "sample catalog"}
    </Badge>
  );
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
