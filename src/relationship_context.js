import { buildDialoguePolicy, formatDialoguePolicy } from "./dialogue.js";

export function buildRelationshipContext({
  customerName,
  customerRemark,
  customerMessage,
  customerSummary,
  memoryFacts = [],
  vectorMemories = [],
  relationshipState = {},
  recentMessages = [],
}) {
  const dialogueStrategy = buildDialoguePolicy({
    customerMessage,
    customerSummary,
    memoryFacts,
    vectorMemories,
    relationshipState,
    recentMessages,
  });

  return {
    name: "relationship",
    title: "Dialogue Policy Engine",
    dialogueStrategy,
    text: [
      `Current relationship stage: ${relationshipState?.stage || "new"}`,
      `Current relationship state:\n${formatRelationshipState(relationshipState)}`,
      `Dialogue policy:\n${formatDialoguePolicy(dialogueStrategy)}`,
      `Customer name: ${customerName || "there"}`,
      `Customer note/remark: ${customerRemark || "No remark"}`,
    ].join("\n\n"),
  };
}

function formatRelationshipState(state) {
  return [
    `- stage: ${state?.stage || "new"}`,
    `- trust: ${Number(state?.trust || 0).toFixed(2)}`,
    `- intimacy: ${Number(state?.intimacy || 0).toFixed(2)}`,
  ].join("\n");
}
