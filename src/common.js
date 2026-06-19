export const RECENT_MESSAGES_LIMIT = 20;
export const SUMMARY_PROCESS_LIMIT = 50;
export const DUPLICATE_SECONDS = 10;
export const MEMORY_FACT_LIMIT = 12;
export const MEMORY_WRITE_FACT_LIMIT = 8;
export const VECTOR_MEMORY_LIMIT = 6;

export const AUTO_REPLY_SHORT_MIN_SECONDS = 7;
export const AUTO_REPLY_SHORT_MAX_SECONDS = 12;
export const AUTO_REPLY_NORMAL_MIN_SECONDS = 12;
export const AUTO_REPLY_NORMAL_MAX_SECONDS = 18;
export const AUTO_REPLY_LONG_MIN_SECONDS = 17;
export const AUTO_REPLY_LONG_MAX_SECONDS = 25;

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
    },
  });
}

export function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clamp(value, min, max) {
  const number = Number.isFinite(Number(value)) ? Number(value) : min;
  return Math.max(min, Math.min(max, number));
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeStage(stage) {
  const text = cleanText(stage).toLowerCase();

  if (
    ["new", "familiar", "trusted", "light_romantic", "stable_companion"].includes(text)
  ) {
    return text;
  }

  return "new";
}

export function computeRelationshipStage(trust, intimacy) {
  const t = clamp(Number(trust || 0), 0, 1);
  const i = clamp(Number(intimacy || 0), 0, 1);

  if (t >= 0.88 && i >= 0.82) return "stable_companion";
  if (t >= 0.76 && i >= 0.68) return "light_romantic";
  if (t >= 0.62 && i >= 0.5) return "trusted";
  if (t >= 0.35 && i >= 0.25) return "familiar";
  return "new";
}

export function normalizeFactKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseJsonObject(text) {
  if (!text) return null;

  const cleaned = String(text)
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;

  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

