import { clamp } from "./common.js";
import { upsertMemoryFact } from "./db.js";
import { resolveMemoryFactConflicts } from "./memory_writer_conflicts.js";

export async function writeMemoryFacts({
  env,
  chatUserId,
  facts = [],
  existingFacts = [],
  salesmartlyMsgId,
}) {
  const factWrites = [];
  const resolvedFacts = resolveMemoryFactConflicts(facts, existingFacts);

  for (const fact of resolvedFacts || []) {
    const confidence = clamp(Number(fact.confidence ?? 0.5), 0, 1);
    if (confidence < 0.55) continue;

    const saved = await upsertMemoryFact({
      env,
      chatUserId,
      factKey: fact.key,
      factValue: fact.value,
      confidence,
      sourceMessageId: String(salesmartlyMsgId || ""),
      sourceMessageRole: "customer",
    });

    if (saved) factWrites.push(saved);
  }

  return factWrites;
}
