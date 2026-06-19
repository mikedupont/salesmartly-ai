import { cleanText } from "./common.js";
import { upsertVectorMemory } from "./vectorize.js";

export async function writeMemoryVectors({
  env,
  chatUserId,
  customerMessage,
  aiReply,
  summaryHint,
  salesmartlyMsgId,
  embeddingFn,
}) {
  const vectorWrites = [];
  const vectorSeeds = [
    { sourceType: "customer_message", sourceId: String(salesmartlyMsgId || ""), sourceText: customerMessage },
    { sourceType: "assistant_reply", sourceId: String(salesmartlyMsgId || ""), sourceText: aiReply },
    ...(summaryHint ? [{ sourceType: "conversation_summary", sourceId: String(salesmartlyMsgId || ""), sourceText: summaryHint }] : []),
  ];

  for (const seed of vectorSeeds) {
    if (!seed.sourceText || cleanText(seed.sourceText).length < 6) continue;
    const savedVector = await upsertVectorMemory({
      env,
      chatUserId,
      sourceType: seed.sourceType,
      sourceId: seed.sourceId,
      sourceText: seed.sourceText,
      embeddingFn,
    });
    if (savedVector) vectorWrites.push(savedVector);
  }

  return vectorWrites;
}
