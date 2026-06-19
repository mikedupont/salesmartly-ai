import { cleanText } from "./common.js";

const SUPPORT_WORDS = [
  "tired",
  "exhausted",
  "stress",
  "stressed",
  "pressure",
  "busy",
  "overwhelmed",
  "累",
  "疲惫",
  "压力",
  "烦",
  "难受",
  "撑不住",
  "想哭",
  "失眠",
];

const PRACTICAL_WORDS = [
  "how",
  "what",
  "when",
  "where",
  "why",
  "which",
  "should",
  "need",
  "help",
  "怎么办",
  "怎么",
  "如何",
  "可以",
  "建议",
  "帮我",
];

const GREETING_WORDS = [
  "hi",
  "hello",
  "hey",
  "morning",
  "evening",
  "嗨",
  "你好",
  "在吗",
  "早",
  "晚安",
];

export function analyzeDialogueIntent({
  customerMessage,
  customerSummary,
  memoryFacts = [],
  vectorMemories = [],
  recentMessages = [],
}) {
  const latest = cleanText(customerMessage || "");
  const summary = cleanText(customerSummary || "");
  const signalText = cleanText([
    latest,
    summary,
    ...memoryFacts.map((fact) => `${fact.key} ${fact.value}`),
    ...vectorMemories.map((memory) => `${memory.sourceType || ""} ${memory.text || ""}`),
    ...recentMessages.map((message) => message?.content || ""),
  ].join(" "));

  return {
    latest,
    summary,
    signalText,
    intent: detectDialogueIntent(latest, signalText),
  };
}

export function detectDialogueIntent(latest, signalText) {
  if (hasAny(signalText, SUPPORT_WORDS)) return "support";
  if (hasAny(latest, PRACTICAL_WORDS)) return "practical";
  if (hasAny(latest, GREETING_WORDS)) return "smalltalk";
  if (/[?？]/.test(latest)) return "explore";
  if (latest.length <= 8) return "smalltalk";
  return "explore";
}

export function hasAny(text, words) {
  const lower = cleanText(text).toLowerCase();
  return words.some((word) => lower.includes(String(word).toLowerCase()));
}

