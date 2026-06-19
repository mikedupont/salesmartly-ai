import { cleanText, MEMORY_WRITE_FACT_LIMIT } from "./common.js";

export async function writeMemorySummary({
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
}) {
  const summaryText = shouldPersistSummary
    ? cleanText(plan.summary_hint || "") || customer?.summary || ""
    : customer?.summary || "";

  await updateCustomerSummary({
    env,
    chatUserId,
    summary: summaryText,
    importantFacts: JSON.stringify((activeFacts || []).slice(0, MEMORY_WRITE_FACT_LIMIT)),
    relationshipStage: relationshipRecord.stage,
  });

  if (shouldPersistSummary && plan.summary_hint) {
    await createConversationSummary({
      env,
      chatUserId,
      startMessageId: String(salesmartlyMsgId || ""),
      endMessageId: String(salesmartlyMsgId || ""),
      summaryText: cleanText(plan.summary_hint),
    });
  }

  return {
    summaryText,
  };
}
