import type { ColumnMeta, ColumnProfile } from "./types";
import { VALUE_PATTERNS } from "./profile";

/**
 * PII classification for a live database.
 *
 * Three independent signals are combined:
 *   1. name   — what the column is called and typed
 *   2. value  — what the sampled data actually looks like (aggregate matches only)
 *   3. ai     — Gemini's read of the column name/type/description
 *
 * Value evidence outranks the other two: it is the only signal that catches PII
 * hiding in a column named `field_7` or `notes`, and the only one that clears a
 * column named `customer_address_type` that holds nothing personal.
 */

export type Classification = "PII.Sensitive" | "PII.NonSensitive" | "NotPII";

export type ColumnVerdict = {
  column: string;
  classification: Classification;
  confidence: number;
  reason: string;
  /** Which signals contributed, so the UI can show why. */
  signals: { name?: string; value?: string; ai?: string };
  evidence: { pattern: string; label: string; matchPercent: number }[];
};

// ── 1. Name heuristics ─────────────────────────────────────────────────────

type NameRule = { test: RegExp; classification: Classification; confidence: number; label: string };

const NAME_RULES: NameRule[] = [
  { test: /(^|_)(ssn|social_?security|sin_?number)($|_)/i, classification: "PII.Sensitive", confidence: 0.97, label: "social security number" },
  { test: /(passport|national_?id|tax_?id|tin|driver_?licen[cs]e|aadhaar|pan_?number)/i, classification: "PII.Sensitive", confidence: 0.95, label: "government identifier" },
  { test: /(credit_?card|card_?number|card_?no|cc_?num|cvv|cvc|pan_?enc)/i, classification: "PII.Sensitive", confidence: 0.96, label: "payment card data" },
  { test: /(iban|bank_?account|account_?number|routing_?number|swift|bic)/i, classification: "PII.Sensitive", confidence: 0.93, label: "bank account details" },
  { test: /(password|passwd|secret|api_?key|access_?token|refresh_?token|private_?key|salt|hash)/i, classification: "PII.Sensitive", confidence: 0.94, label: "credential material" },
  { test: /(e?_?mail)/i, classification: "PII.Sensitive", confidence: 0.94, label: "email address" },
  { test: /(phone|mobile|msisdn|telephone|fax)/i, classification: "PII.Sensitive", confidence: 0.9, label: "phone number" },
  { test: /(first_?name|last_?name|full_?name|given_?name|sur_?name|middle_?name|maiden|^f?name$|^lname$|^fname$)/i, classification: "PII.Sensitive", confidence: 0.9, label: "person's name" },
  { test: /(date_?of_?birth|birth_?date|^dob$|birthday)/i, classification: "PII.Sensitive", confidence: 0.94, label: "date of birth" },
  { test: /(street|address_?line|home_?address|billing_?address|shipping_?address|^address$)/i, classification: "PII.Sensitive", confidence: 0.88, label: "postal address" },
  { test: /(ip_?address|^ip$|device_?id|mac_?address|imei|advertising_?id)/i, classification: "PII.Sensitive", confidence: 0.86, label: "device or network identifier" },
  { test: /(salary|compensation|income|wage|net_?pay|gross_?pay)/i, classification: "PII.Sensitive", confidence: 0.85, label: "compensation data" },
  { test: /(diagnos|medical|health|prescription|blood_?type|disabilit)/i, classification: "PII.Sensitive", confidence: 0.9, label: "health data" },
  { test: /(race|ethnicit|religio|sexual_?orientation|political)/i, classification: "PII.Sensitive", confidence: 0.9, label: "special category data" },
  { test: /(latitude|longitude|geo_?lat|geo_?lon|coordinates)/i, classification: "PII.Sensitive", confidence: 0.8, label: "precise location" },

  { test: /(zip|postal_?code|post_?code)/i, classification: "PII.NonSensitive", confidence: 0.8, label: "postal code" },
  { test: /(^city$|_city$|^state$|_state$|province|^country$|_country$|region|timezone|locale|nationality)/i, classification: "PII.NonSensitive", confidence: 0.78, label: "coarse location" },
  { test: /(gender|^age$|age_?group|marital)/i, classification: "PII.NonSensitive", confidence: 0.78, label: "demographic attribute" },
  { test: /(department|job_?title|role|employer|company_?name)/i, classification: "PII.NonSensitive", confidence: 0.72, label: "organisational attribute" },
  { test: /(user_?agent|referrer|session_?id|cookie)/i, classification: "PII.NonSensitive", confidence: 0.7, label: "web tracking attribute" },
];

export function classifyByName(column: ColumnMeta): { classification: Classification; confidence: number; reason: string } | null {
  // The name and the description are matched separately, never concatenated:
  // several rules anchor on the whole name (`^city$`, `^dob$`, `^ip$`), and
  // joining the two strings would put a space after the name and defeat every
  // one of those anchors.
  const description = column.description?.trim();
  const targets = description ? [column.name, description] : [column.name];

  for (const rule of NAME_RULES) {
    if (targets.some((target) => rule.test.test(target))) {
      return {
        classification: rule.classification,
        confidence: rule.confidence,
        reason: `Column name suggests ${rule.label}`,
      };
    }
  }
  return null;
}

// ── 2. Value evidence ──────────────────────────────────────────────────────

/** Minimum share of non-null sampled values that must match before we trust a pattern. */
const PATTERN_THRESHOLDS: Record<string, { min: number; classification: Classification; confidence: number }> = {
  email: { min: 0.4, classification: "PII.Sensitive", confidence: 0.99 },
  ssn: { min: 0.25, classification: "PII.Sensitive", confidence: 0.99 },
  iban: { min: 0.4, classification: "PII.Sensitive", confidence: 0.93 },
  credit_card: { min: 0.4, classification: "PII.Sensitive", confidence: 0.9 },
  ipv4: { min: 0.5, classification: "PII.Sensitive", confidence: 0.9 },
  phone: { min: 0.6, classification: "PII.Sensitive", confidence: 0.82 },
};

/**
 * The phone pattern is deliberately loose, so it also matches things a stricter
 * pattern already identified — `123-45-6789` is an SSN, not a phone number.
 * When a more specific pattern matched at least as often, the loose one is
 * dropped from the evidence rather than shown as a second finding.
 */
const SUBSUMED_BY: Record<string, string[]> = {
  phone: ["ssn", "credit_card", "iban"],
  credit_card: ["ssn"],
};

export function classifyByValues(
  column: ColumnMeta,
  profile: ColumnProfile | undefined
): { classification: Classification; confidence: number; reason: string; evidence: ColumnVerdict["evidence"] } | null {
  if (!profile) return null;

  const evidence: ColumnVerdict["evidence"] = [];
  let best: { classification: Classification; confidence: number; reason: string } | null = null;

  for (const pattern of VALUE_PATTERNS) {
    const share = profile.patternHits[pattern.key];
    if (!share) continue;

    const threshold = PATTERN_THRESHOLDS[pattern.key];
    if (!threshold || share < threshold.min) continue;

    const subsumers = SUBSUMED_BY[pattern.key] ?? [];
    if (subsumers.some((key) => (profile.patternHits[key] ?? 0) >= share)) continue;

    evidence.push({
      pattern: pattern.key,
      label: pattern.label,
      matchPercent: Math.round(share * 100),
    });

    // A numeric column matching the card pattern is often just a long ID.
    const numericPenalty =
      pattern.key === "credit_card" && !/CHAR|TEXT|STRING/i.test(profile.dataType) ? 0.25 : 0;
    const confidence = Math.max(threshold.confidence - numericPenalty, 0.5);

    if (!best || confidence > best.confidence) {
      best = {
        classification: threshold.classification,
        confidence,
        // Phrased as a pattern match rather than "looks like an X" — it is a
        // claim about shape, and it sidesteps English articles ("an IP address"
        // but "a US social security number") that no spelling rule gets right.
        reason: `${Math.round(share * 100)}% of ${profile.sampledRows.toLocaleString()} sampled values match the ${pattern.label} pattern`,
      };
    }
  }

  if (!best) return null;
  return { ...best, evidence };
}

// ── 3. Merge ───────────────────────────────────────────────────────────────

const RANK: Record<Classification, number> = { "PII.Sensitive": 2, "PII.NonSensitive": 1, NotPII: 0 };

export function mergeVerdict(
  column: ColumnMeta,
  profile: ColumnProfile | undefined,
  ai: { classification?: string; confidence?: number; reason?: string } | undefined
): ColumnVerdict {
  const byName = classifyByName(column);
  const byValue = classifyByValues(column, profile);
  const aiVerdict =
    ai && isClassification(ai.classification)
      ? { classification: ai.classification, confidence: ai.confidence ?? 0.7, reason: ai.reason ?? "" }
      : null;

  const signals: ColumnVerdict["signals"] = {};
  if (byName) signals.name = byName.reason;
  if (byValue) signals.value = byValue.reason;
  else if (profile && profile.sampledRows > 0 && profile.nullPercent >= 100) {
    // Worth surfacing, but not worth overriding the verdict: a column that is
    // empty today can still be the one that fills with personal data tomorrow.
    signals.value = `Every one of the ${profile.sampledRows.toLocaleString()} sampled values is NULL`;
  }
  if (aiVerdict?.reason) signals.ai = aiVerdict.reason;

  // A column whose values are overwhelmingly UUIDs is an identifier, not PII,
  // regardless of what it happens to be named.
  const uuidShare = profile?.patternHits.uuid ?? 0;
  if (uuidShare > 0.9 && !byValue) {
    return {
      column: column.name,
      classification: "NotPII",
      confidence: 0.92,
      reason: "Values are UUIDs — a surrogate identifier, not personal data",
      signals,
      evidence: [],
    };
  }

  const candidates = [byValue, byName, aiVerdict].filter(Boolean) as {
    classification: Classification;
    confidence: number;
    reason: string;
  }[];

  if (candidates.length === 0) {
    return {
      column: column.name,
      classification: "NotPII",
      confidence: 0.75,
      reason: "No personal-data signal in the column name, type, or sampled values",
      signals,
      evidence: [],
    };
  }

  // Take the most severe classification any signal reached.
  const winner = candidates.reduce((a, b) =>
    RANK[b.classification] > RANK[a.classification] ||
    (RANK[b.classification] === RANK[a.classification] && b.confidence > a.confidence)
      ? b
      : a
  );

  // Agreement between independent signals raises confidence.
  const agreeing = candidates.filter((c) => c.classification === winner.classification).length;
  const confidence = Math.min(winner.confidence + (agreeing - 1) * 0.03, 0.99);

  const reason = byValue && byValue.classification === winner.classification ? byValue.reason : winner.reason;

  return {
    column: column.name,
    classification: winner.classification,
    confidence,
    reason,
    signals,
    evidence: byValue?.evidence ?? [],
  };
}

function isClassification(v: unknown): v is Classification {
  return v === "PII.Sensitive" || v === "PII.NonSensitive" || v === "NotPII";
}
