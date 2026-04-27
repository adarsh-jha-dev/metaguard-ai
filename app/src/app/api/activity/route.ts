import { getActivityFeeds } from "@/lib/openmetadata";
import { summarizeActivity } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const withSummary = searchParams.get("summary") === "true";

  try {
    const feedData = await getActivityFeeds(30);
    const items: Record<string, unknown>[] = feedData.data || [];

    const normalised = items.map((item) => {
      const about = item.about as string | undefined;
      // Parse entityType from about link like "<#E::table::fqn>"
      let entityType = "entity";
      let entityName = "unknown";
      if (about) {
        const m = about.match(/::([\w]+)::([\w.]+)/);
        if (m) {
          entityType = m[1];
          entityName = m[2];
        }
      }
      const posts = (item.posts as Record<string, unknown>[] | undefined) || [];
      return {
        id: item.id as string,
        entityType,
        entityName,
        type: item.type as string,
        createdBy: item.createdBy as string,
        updatedAt: item.updatedAt as number,
        postCount: posts.length,
        latestMessage: posts[posts.length - 1]?.message as string | undefined,
      };
    });

    let aiSummary: string | undefined;
    if (withSummary && normalised.length > 0) {
      aiSummary = await summarizeActivity(
        normalised.map((n) => ({
          entityType: n.entityType,
          eventType: n.type || "conversation",
          entityName: n.entityName,
          user: n.createdBy,
          timestamp: n.updatedAt ? new Date(n.updatedAt).toISOString() : undefined,
        }))
      ).catch(() => undefined);
    }

    return NextResponse.json({ items: normalised, aiSummary, total: normalised.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
