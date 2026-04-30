import { getTables } from "@/lib/openmetadata";
import { DEMO_TABLES } from "@/lib/demo-data";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await getTables();
    if (data.data && data.data.length > 0) return NextResponse.json(data);
    return NextResponse.json(DEMO_TABLES);
  } catch {
    return NextResponse.json(DEMO_TABLES);
  }
}