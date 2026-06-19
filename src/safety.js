import { cleanText } from "./common.js";

export function buildSafetyContext({ customerMessage, relationshipState, dialogueStrategy }) {
  const rules = [
    "Do not promise real-world meetings, calls, deliveries, photos, or actions you cannot perform.",
    "Use one brief conversational boundary for requests involving money, exact location, private contact details, or other sensitive information.",
    "For sadness, stress, or tiredness, lead with empathy first.",
    "Ask at most one question, and only if it improves the conversation.",
    "If the customer is clearly upset, keep the reply gentle and low-pressure.",
  ];

  const stage = cleanText(relationshipState?.stage || "new");
  if (stage === "new") {
    rules.push("Keep the tone light and do not over-intensify the relationship.");
  }
  if (dialogueStrategy?.shouldAsk) {
    rules.push(`Ask one question only, focused on: ${dialogueStrategy.questionFocus || "the current topic"}.`);
    rules.push(`Keep the question budget at ${Number.isFinite(Number(dialogueStrategy?.questionBudget)) ? dialogueStrategy.questionBudget : 1}.`);
  } else {
    rules.push("Do not force a question when the message already feels complete.");
  }
  if (/累|疲惫|压力|stressed|stress|tired|overwhelmed/i.test(cleanText(customerMessage || ""))) {
    rules.push("Use empathy before advice.");
  }

  return {
    name: "safety",
    title: "Safety Layer",
    text: rules.map((rule) => `- ${rule}`).join("\n"),
    rules,
  };
}
