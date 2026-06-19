import { MEMORY_FACT_LIMIT } from "./common.js";
import { getActiveMemoryFacts } from "./db.js";
import { writeMemoryFacts } from "./memory_writer_facts.js";
import { writeMemoryVectors } from "./memory_writer_vectors.js";
import { writeRelationshipMemory } from "./memory_writer_relationship.js";
import { writeMemorySummary } from "./memory_writer_summary.js";

export async function writeMemoryTurn({
  env,
  chatUserId,
  customerName,
  customerRemark,
  customerMessage,
  aiReply,
  customer,
  relationshipStage,
  relationshipState,
  memoryFacts,
  vectorMemories,
  recentMessages,
  salesmartlyMsgId,
  generateMemoryWritePlan,
  formatMemoryFacts,
  formatVectorMemories,
  formatRelationshipState,
  getActiveMemoryFacts: getActiveFacts = getActiveMemoryFacts,
  updateCustomerSummary,
  createConversationSummary,
  embeddingFn,
}) {
  const plan = await generateMemoryWritePlan({
    env,
    customerName,
    customerRemark,
    customerMessage,
    aiReply,
    customer,
    relationshipStage,
    relationshipState,
    memoryFacts,
    vectorMemories,
    recentMessages,
    formatMemoryFacts,
    formatVectorMemories,
    formatRelationshipState,
  });

  if (!plan) {
    return { ok: false, skipped: true, reason: "No memory plan" };
  }

  const factWrites = await writeMemoryFacts({
    env,
    chatUserId,
    facts: plan.facts || [],
    existingFacts: memoryFacts || [],
    salesmartlyMsgId,
  });

  const vectorWrites = await writeMemoryVectors({
    env,
    chatUserId,
    customerMessage,
    aiReply,
    summaryHint: plan.summary_hint,
    salesmartlyMsgId,
    embeddingFn,
  });

  const { nextState, relationshipRecord } = await writeRelationshipMemory({
    env,
    chatUserId,
    relationshipState,
    relationshipDelta: plan.relationship_delta,
    salesmartlyMsgId,
  });

  const activeFacts = await getActiveFacts(env, chatUserId, MEMORY_FACT_LIMIT);
  const trustShift = Math.abs(Number(nextState.trust || 0) - Number(relationshipState?.trust || 0));
  const intimacyShift = Math.abs(Number(nextState.intimacy || 0) - Number(relationshipState?.intimacy || 0));
  const shouldPersistSummary =
    plan.source === "llm" ||
    factWrites.length > 0 ||
    vectorWrites.length > 0 ||
    trustShift + intimacyShift >= 0.04;

  const summaryResult = await writeMemorySummary({
    env,
    chatUserId,
    customer,
    plan,
    activeFacts,
    relationshipRecord,
    shouldPersistSummary,
    updateCustomerSummary,
    createConversationSummary,
    salesmartlyMsgId,
  });

  return {
    ok: true,
    factsWritten: factWrites.length,
    vectorsWritten: vectorWrites.length,
    relationshipState: relationshipRecord,
    summaryText: summaryResult.summaryText,
  };
}
