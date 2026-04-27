import { getTables, getDashboards, getPipelines, getTopics, getMlModels } from "@/lib/openmetadata";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [tables, dashboards, pipelines, topics, models] = await Promise.allSettled([
      getTables(100),
      getDashboards(100),
      getPipelines(100),
      getTopics(100),
      getMlModels(100),
    ]);

    const count = (r: PromiseSettledResult<Record<string, unknown>>) =>
      r.status === "fulfilled" ? ((r.value.data as unknown[]) || []).length : 0;

    return NextResponse.json({
      tables: count(tables),
      dashboards: count(dashboards),
      pipelines: count(pipelines),
      topics: count(topics),
      mlModels: count(models),
      total: count(tables) + count(dashboards) + count(pipelines) + count(topics) + count(models),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
