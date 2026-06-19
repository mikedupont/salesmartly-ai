import { cleanText, normalizeFactKey } from "./common.js";

export function resolveMemoryFactConflicts(proposedFacts = [], existingFacts = []) {
  const existingByKey = new Map();
  for (const fact of existingFacts || []) {
    const key = normalizeFactKey(fact?.key || fact?.fact_key || "");
    const value = cleanText(fact?.value || fact?.fact_value || "");
    if (!key || !value) continue;

    const prior = existingByKey.get(key);
    if (!prior || Number(fact.confidence || 0) > prior.confidence) {
      existingByKey.set(key, {
        key,
        value,
        confidence: Number(fact.confidence || 0),
      });
    }
  }

  const merged = new Map();
  for (const fact of proposedFacts || []) {
    const key = normalizeFactKey(fact?.key || "");
    const value = cleanText(fact?.value || "");
    const confidence = Number(fact?.confidence ?? 0.5);
    if (!key || !value) continue;

    const existing = existingByKey.get(key);
    if (existing && existing.value !== value && confidence <= existing.confidence) {
      continue;
    }

    const previous = merged.get(key);
    if (!previous || confidence >= previous.confidence) {
      merged.set(key, { key, value, confidence });
    }
  }

  return [...merged.values()];
}
