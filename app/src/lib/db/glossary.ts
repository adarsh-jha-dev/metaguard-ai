import type { Catalog, TableMeta } from "./types";

/**
 * Derives a business glossary from a live schema.
 *
 * A raw database has no glossary to read, but it does contain the vocabulary a
 * team already uses: table names are the business entities, and column names
 * that recur across tables are the shared attributes everyone means the same
 * thing by. Those are extracted here deterministically, so the page works with
 * no AI key at all; Gemini is only ever asked to write the definitions.
 */

export type TermKind = "entity" | "attribute";

export type LiveTerm = {
  /** Stable identity, also used as the React key and by the suggest endpoint. */
  fqn: string;
  name: string;
  description: string;
  kind: TermKind;
  domain: string;
  /** Table FQNs the term was derived from. */
  usedIn: string[];
  /** Raw column names behind an attribute term (`customer_id`, `customerId`, …). */
  sourceColumns: string[];
  dataTypes: string[];
  /** True when the description came from Gemini rather than a database comment. */
  aiGenerated: boolean;
};

export type LiveGlossary = {
  id: string;
  name: string;
  fqn: string;
  description: string;
  kind: TermKind;
  termCount: number;
  terms: LiveTerm[];
};

export type GlossaryReport = {
  glossaries: LiveGlossary[];
  stats: {
    totalGlossaries: number;
    totalTerms: number;
    entityTerms: number;
    attributeTerms: number;
    /** Terms whose definition came from a COMMENT in the database. */
    documentedTerms: number;
    tablesCovered: number;
  };
};

/** Caps so a 500-table schema still produces a glossary a human can read. */
const MAX_ENTITY_TERMS = 150;
const MAX_ATTRIBUTE_TERMS = 80;
/** A column name has to appear in at least this many tables to be a shared term. */
const MIN_ATTRIBUTE_TABLES = 2;

/** Tokens that read badly when naively capitalised. */
const ACRONYMS = new Set([
  "id", "ids", "url", "uri", "ip", "api", "uuid", "guid", "sku", "dob", "ssn", "vat", "iban",
  "utm", "html", "json", "csv", "pdf", "sla", "kpi", "crm", "erp", "b2b", "b2c", "gmv", "arr",
  "mrr", "eu", "us", "uk", "gdpr", "pii", "tz", "db", "fk", "pk", "os", "ua",
]);

function humanize(raw: string): string {
  const tokens = raw
    // customerId → customer Id, HTTPStatus → HTTP Status
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);

  return tokens
    .map((t) => (ACRONYMS.has(t.toLowerCase()) ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1).toLowerCase()))
    .join(" ");
}

/** Deliberately naive — English plurals only, and wrong on irregulars. */
function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length <= 3) return word;
  if (/(ss|us|is)$/.test(lower)) return word;
  if (/ies$/.test(lower)) return word.slice(0, -3) + "y";
  if (/(ches|shes|sses|xes|zes)$/.test(lower)) return word.slice(0, -2);
  if (/s$/.test(lower)) return word.slice(0, -1);
  return word;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Column names that describe plumbing rather than a business concept. */
const NOISE_COLUMNS = new Set(["id", "_id", "row_id", "rowid", "oid", "ctid", "xmin"]);

export function buildGlossary(catalog: Catalog): GlossaryReport {
  const entityTerms: LiveTerm[] = [];
  const bySchema = new Map<string, TableMeta[]>();

  for (const table of catalog.tables) {
    if (!bySchema.has(table.schema)) bySchema.set(table.schema, []);
    bySchema.get(table.schema)!.push(table);
  }

  // ── Entity terms: one per table, grouped into a glossary per schema ───────
  const entityGlossaries: LiveGlossary[] = [];

  for (const [schema, tables] of [...bySchema.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const terms = tables
      // Biggest tables first: a term budget should be spent on what matters.
      .slice()
      .sort((a, b) => b.approxRows - a.approxRows || a.name.localeCompare(b.name))
      .map((table): LiveTerm => ({
        fqn: `glossary.${slug(schema)}.${slug(table.name)}`,
        name: humanize(singularize(table.name)),
        description: table.description.trim(),
        kind: "entity",
        domain: schema,
        usedIn: [table.fullyQualifiedName],
        sourceColumns: [],
        dataTypes: [table.tableType],
        aiGenerated: false,
      }));

    entityGlossaries.push({
      id: `glossary.${slug(schema)}`,
      name: humanize(schema),
      fqn: `glossary.${slug(schema)}`,
      description: `Business entities derived from the ${tables.length} ${
        tables.length === 1 ? "table" : "tables"
      } in schema "${schema}".`,
      kind: "entity",
      termCount: terms.length,
      terms,
    });
    entityTerms.push(...terms);
  }

  // Trim across schemas rather than per schema, so one huge schema cannot
  // starve the others of terms.
  if (entityTerms.length > MAX_ENTITY_TERMS) {
    const keep = new Set(entityTerms.slice(0, MAX_ENTITY_TERMS).map((t) => t.fqn));
    for (const g of entityGlossaries) {
      g.terms = g.terms.filter((t) => keep.has(t.fqn));
      g.termCount = g.terms.length;
    }
  }

  // ── Attribute terms: column names shared by several tables ───────────────
  type Bucket = {
    name: string;
    tables: Set<string>;
    columns: Set<string>;
    types: Set<string>;
    description: string;
  };
  const buckets = new Map<string, Bucket>();

  for (const table of catalog.tables) {
    for (const column of table.columns) {
      // Key off the humanized name so `customerId` and `customer_id` land in
      // the same bucket — they are the same concept spelled two ways.
      const key = slug(humanize(column.name));
      if (!key || NOISE_COLUMNS.has(column.name.toLowerCase())) continue;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          name: humanize(column.name),
          tables: new Set(),
          columns: new Set(),
          types: new Set(),
          description: "",
        };
        buckets.set(key, bucket);
      }
      bucket.tables.add(table.fullyQualifiedName);
      bucket.columns.add(column.name);
      bucket.types.add(column.dataType);
      // The first comment anyone bothered to write wins.
      if (!bucket.description && column.description.trim()) bucket.description = column.description.trim();
    }
  }

  const attributeTerms = [...buckets.entries()]
    .filter(([, b]) => b.tables.size >= MIN_ATTRIBUTE_TABLES)
    .sort((a, b) => b[1].tables.size - a[1].tables.size || a[0].localeCompare(b[0]))
    .slice(0, MAX_ATTRIBUTE_TERMS)
    .map(([key, b]): LiveTerm => ({
      fqn: `glossary.shared.${key}`,
      name: b.name,
      description: b.description,
      kind: "attribute",
      domain: "Shared attributes",
      usedIn: [...b.tables],
      sourceColumns: [...b.columns],
      dataTypes: [...b.types],
      aiGenerated: false,
    }));

  const glossaries: LiveGlossary[] = [...entityGlossaries.filter((g) => g.terms.length > 0)];
  if (attributeTerms.length > 0) {
    glossaries.push({
      id: "glossary.shared",
      name: "Shared attributes",
      fqn: "glossary.shared",
      description: `Column concepts that appear in ${MIN_ATTRIBUTE_TABLES} or more tables — the vocabulary this database already shares.`,
      kind: "attribute",
      termCount: attributeTerms.length,
      terms: attributeTerms,
    });
  }

  const allTerms = glossaries.flatMap((g) => g.terms);

  return {
    glossaries,
    stats: {
      totalGlossaries: glossaries.length,
      totalTerms: allTerms.length,
      entityTerms: allTerms.filter((t) => t.kind === "entity").length,
      attributeTerms: allTerms.filter((t) => t.kind === "attribute").length,
      documentedTerms: allTerms.filter((t) => t.description.length > 0).length,
      tablesCovered: new Set(allTerms.flatMap((t) => t.usedIn)).size,
    },
  };
}

/** Compact context for the definition prompt: what each term was derived from. */
export function describeTermContext(term: LiveTerm, catalog: Catalog): string {
  if (term.kind === "entity") {
    const table = catalog.tables.find((t) => t.fullyQualifiedName === term.usedIn[0]);
    if (!table) return term.name;
    const columns = table.columns.slice(0, 15).map((c) => `${c.name} ${c.dataType}`).join(", ");
    return `${term.name} — from ${table.tableType.toLowerCase()} ${table.schema}.${table.name} (${
      table.columns.length
    } columns: ${columns}${table.columns.length > 15 ? ", …" : ""})`;
  }
  const tables = term.usedIn.map((f) => f.split(".").slice(-1)[0]).slice(0, 8).join(", ");
  return `${term.name} — column ${[...term.sourceColumns].join("/")} (${term.dataTypes
    .slice(0, 3)
    .join("/")}) in ${term.usedIn.length} tables: ${tables}${term.usedIn.length > 8 ? ", …" : ""}`;
}

/** Folds AI-written definitions back into the report, leaving real comments alone. */
export function applyDefinitions(
  report: GlossaryReport,
  definitions: Map<string, string>
): GlossaryReport {
  let applied = 0;
  const glossaries = report.glossaries.map((g) => ({
    ...g,
    terms: g.terms.map((t) => {
      const definition = definitions.get(t.fqn);
      // A comment written by a human beats anything a model invents.
      if (!definition || t.description) return t;
      applied++;
      return { ...t, description: definition, aiGenerated: true };
    }),
  }));

  return {
    glossaries,
    stats: {
      ...report.stats,
      documentedTerms: report.stats.documentedTerms + applied,
    },
  };
}
