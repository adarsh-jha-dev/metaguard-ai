const OM_BASE = process.env.OPENMETADATA_URL || "http://localhost:8585/api/v1";
const OM_TOKEN = process.env.OPENMETADATA_TOKEN || ""; // JWT token from OM

async function omFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${OM_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OM_TOKEN}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`OM API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Core functions you'll use everywhere
export async function getTables(limit = 20) {
  return omFetch(`/tables?limit=${limit}&fields=tags,columns`);
}

export async function getTableByFqn(fqn: string) {
  return omFetch(`/tables/name/${encodeURIComponent(fqn)}?fields=columns,tags,profile`);
}
export async function getLineage(fqn: string) {
  return omFetch(`/lineage/table/name/${fqn}?upstreamDepth=3&downstreamDepth=3`);
}

export async function searchTables(query: string) {
  return omFetch(`/search/query?q=${encodeURIComponent(query)}&index=table_search_index&size=10`);
}

export async function addTagToColumn(tableId: string, columnFqn: string, tagFqn: string) {
  return omFetch(`/tables/${tableId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify([{
      op: "add",
      path: `/columns/${columnFqn}/tags/-`,
      value: { tagFQN: tagFqn, source: "Classification" },
    }]),
  });
}