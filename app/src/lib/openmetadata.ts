const OM_BASE = process.env.OPENMETADATA_URL;
const OM_TOKEN = process.env.OPENMETADATA_TOKEN || "";

async function omFetch(endpoint: string, options?: RequestInit) {
  // Defaulting to localhost made a deploy without OpenMetadata look like a
  // hanging request instead of a missing config. Callers fall back to the
  // sample catalog when this throws.
  if (!OM_BASE) throw new Error("OPENMETADATA_URL is not configured");
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

// ── Tables ─────────────────────────────────────────────────────────────────
export async function getTables(limit = 20) {
  return omFetch(`/tables?limit=${limit}&fields=tags,columns`);
}

export async function getTableByFqn(fqn: string) {
  return omFetch(`/tables/name/${encodeURIComponent(fqn)}?fields=columns,tags,profile`);
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

// ── Multi-entity counts ────────────────────────────────────────────────────
export async function getDashboards(limit = 50) {
  return omFetch(`/dashboards?limit=${limit}&fields=tags`);
}

export async function getPipelines(limit = 50) {
  return omFetch(`/pipelines?limit=${limit}&fields=tags`);
}

export async function getTopics(limit = 50) {
  return omFetch(`/topics?limit=${limit}&fields=tags`);
}

export async function getMlModels(limit = 50) {
  return omFetch(`/mlmodels?limit=${limit}&fields=tags`);
}

export async function getContainers(limit = 50) {
  return omFetch(`/containers?limit=${limit}&fields=tags`);
}

// ── Lineage ────────────────────────────────────────────────────────────────
export async function getLineage(fqn: string) {
  return omFetch(`/lineage/table/name/${encodeURIComponent(fqn)}?upstreamDepth=3&downstreamDepth=3`);
}

export async function getEntityLineage(entityType: string, fqn: string) {
  return omFetch(`/lineage/${entityType}/name/${encodeURIComponent(fqn)}?upstreamDepth=3&downstreamDepth=3`);
}

// ── Data Quality ───────────────────────────────────────────────────────────
export async function getTestSuites(limit = 50) {
  return omFetch(`/testSuites?limit=${limit}&fields=tests`);
}

export async function getTestCases(limit = 100) {
  return omFetch(`/testCases?limit=${limit}&fields=testSuite,testDefinition,testCaseResult`);
}

export async function getTestCaseResults(fqn: string, limit = 5) {
  return omFetch(`/testCases/${encodeURIComponent(fqn)}/testCaseResult?limit=${limit}`);
}

// ── Glossary ───────────────────────────────────────────────────────────────
export async function getGlossaries(limit = 50) {
  return omFetch(`/glossaries?limit=${limit}&fields=owner`);
}

export async function getGlossaryTerms(limit = 200) {
  return omFetch(`/glossaryTerms?limit=${limit}&fields=glossary,tags`);
}

export async function addGlossaryTermToColumn(tableId: string, columnIndex: number, termFqn: string) {
  return omFetch(`/tables/${tableId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json-patch+json" },
    body: JSON.stringify([{
      op: "add",
      path: `/columns/${columnIndex}/tags/-`,
      value: { tagFQN: termFqn, source: "Glossary" },
    }]),
  });
}

// ── Activity Feed ──────────────────────────────────────────────────────────
export async function getActivityFeeds(limit = 30) {
  return omFetch(`/feed?limit=${limit}`);
}

// ── Search all ────────────────────────────────────────────────────────────
export async function searchAll(query: string, size = 20) {
  return omFetch(`/search/query?q=${encodeURIComponent(query)}&size=${size}`);
}

// ── Classifications / Tags ────────────────────────────────────────────────
export async function getClassifications(limit = 50) {
  return omFetch(`/classifications?limit=${limit}`);
}

export async function getTagsByClassification(classificationFqn: string) {
  return omFetch(`/tags?parent=${encodeURIComponent(classificationFqn)}&limit=100`);
}
