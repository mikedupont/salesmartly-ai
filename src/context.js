import { cleanText } from "./common.js";
import { buildPersonaContext } from "./persona.js";
import { buildMemoryContext } from "./memory_context.js";
import { buildRelationshipContext } from "./relationship_context.js";
import { buildSafetyContext } from "./safety.js";

export function buildConversationContext({
  customerName,
  customerRemark,
  customerMessage,
  customerSummary,
  memoryFacts = [],
  vectorMemories = [],
  relationshipState = {},
  recentMessages = [],
  formatRecentConversation,
  formatMemoryFacts,
  formatVectorMemories,
  formatRelationshipState,
}) {
  const persona = buildPersonaContext();
  const memory = buildMemoryContext({
    customerSummary,
    memoryFacts,
    vectorMemories,
    formatMemoryFacts,
    formatVectorMemories,
  });
  const policy = buildRelationshipContext({
    customerName,
    customerRemark,
    customerMessage,
    customerSummary,
    memoryFacts,
    vectorMemories,
    relationshipState,
    recentMessages,
  });
  const safety = buildSafetyContext({
    customerMessage,
    relationshipState,
    dialogueStrategy: policy.dialogueStrategy,
  });
  const recentConversation = formatRecentConversation(recentMessages);
  const conversation = {
    name: "conversation",
    title: "Conversation",
    text: [
      `Recent conversation:\n${recentConversation}`,
      `Customer latest message:\n${cleanText(customerMessage || "")}`,
    ].join("\n\n"),
  };

  const contextText = [
    "Context Builder output:",
    "",
    `${persona.title}:`,
    persona.text,
    "",
    `${memory.title}:`,
    memory.text,
    "",
      `${policy.title}:`,
      policy.text,
    "",
    `${safety.title}:`,
    safety.text,
    "",
    `${conversation.title}:`,
    conversation.text,
  ].join("\n");

  return {
    persona,
    memory,
    policy,
    relationship: policy,
    safety,
    conversation,
    dialogueStrategy: policy.dialogueStrategy,
    sections: {
      persona: persona.text,
      memory: memory.text,
      policy: policy.text,
      relationship: policy.text,
      safety: safety.text,
      conversation: conversation.text,
    },
    contextText,
  };
}
