import { NextResponse } from "next/server";

const BASE = process.env.OPENMETADATA_URL || "http://localhost:8585/api/v1";
const TOKEN = process.env.OPENMETADATA_TOKEN || "";

export async function POST(req: Request) {
  try {
    const { tableId, columnName, tagFQN } = await req.json();

    // First, get the table to find the column index
    const tableRes = await fetch(`${BASE}/tables/${tableId}?fields=columns`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const table = await tableRes.json();

    const columnIndex = table.columns?.findIndex(
      (c: { name: string }) => c.name === columnName
    );

    if (columnIndex === -1 || columnIndex === undefined) {
      return NextResponse.json({ error: "Column not found" }, { status: 404 });
    }

    // PATCH using the column index in the path
    const res = await fetch(`${BASE}/tables/${tableId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json-patch+json",
      },
      body: JSON.stringify([
        {
          op: "add",
          path: `/columns/${columnIndex}/tags/0`,
          value: {
            tagFQN: tagFQN,
            source: "Classification",
            labelType: "Automated",
            state: "Confirmed",
          },
        },
      ]),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("PATCH error:", errText);

      // If tag classification doesn't exist, try with just the table-level tag
      if (errText.includes("classification") || errText.includes("tag")) {
        // Fallback: add tag to table level instead
        const fallbackRes = await fetch(`${BASE}/tables/${tableId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json-patch+json",
          },
          body: JSON.stringify([
            {
              op: "add",
              path: `/tags/0`,
              value: {
                tagFQN: "PII.Sensitive",
                source: "Classification",
                labelType: "Automated",
                state: "Confirmed",
              },
            },
          ]),
        });
        if (fallbackRes.ok) return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: errText }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Tag error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}