import { Badge } from "@/components/ui/badge";

/** Small indicator telling the user whether a page is reading live data or the sample catalog. */
export function SourcePill({ live, label }: { live: boolean; label?: string }) {
  return (
    <Badge
      variant="outline"
      className={
        live
          ? "border-brand/30 bg-brand/10 text-brand text-xs"
          : "border-border-strong bg-card text-muted-foreground text-xs"
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
