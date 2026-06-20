import { normalizeRelationshipState } from "./memory_writer_relationship.js";

export function formatMemoryFacts(facts) {
  if (!facts || facts.length === 0) {
    return "No confirmed long-term facts yet.";
  }

  return facts
    .map((fact) => `- ${fact.key}: ${fact.value} (confidence ${fact.confidence.toFixed(2)})`)
    .join("\n");
}

export function formatRelationshipState(state) {
  const normalized = normalizeRelationshipState(state);
  return [
    `- stage: ${normalized.stage}`,
    `- trust: ${normalized.trust.toFixed(2)}`,
    `- intimacy: ${normalized.intimacy.toFixed(2)}`,
  ].join("\n");
}

export function formatVectorMemories(memories) {
  if (!memories || memories.length === 0) {
    return "No relevant vector memories found.";
  }

  return memories
    .map((memory) => `- ${memory.text} (similarity ${memory.similarity.toFixed(2)})`)
    .join("\n");
}

export function formatReferenceExamples(examples) {
  if (!examples || examples.length === 0) {
    return "No external reference examples selected.";
  }

  return examples
    .map((example) => [
      `- ${example.source || "Reference"}`,
      `  prompt: ${example.prompt || "n/a"}`,
      `  reply: ${example.assistant || "n/a"}`,
      example.note ? `  note: ${example.note}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n");
}
