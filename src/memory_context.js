import { cleanText } from "./common.js";

export function buildMemoryContext({
  customerSummary,
  memoryFacts = [],
  vectorMemories = [],
  referenceExamples = [],
  formatMemoryFacts,
  formatVectorMemories,
  formatReferenceExamples,
}) {
  const activeFacts = formatMemoryFacts(memoryFacts);
  const activeVectors = formatVectorMemories(vectorMemories);
  const activeReferences = formatReferenceExamples ? formatReferenceExamples(referenceExamples) : "";
  const sections = [
    `Customer long-term memory: ${customerSummary || "No long-term memory yet."}`,
    `Active facts:\n${activeFacts}`,
    `Relevant memories:\n${activeVectors}`,
    activeReferences ? `Reference examples:\n${activeReferences}` : "",
  ];

  return {
    name: "memory",
    title: "Memory System",
    text: sections.join("\n\n"),
    summary: customerSummary || "",
    facts: memoryFacts,
    vectors: vectorMemories,
    latestMessage: cleanText(customerSummary || ""),
  };
}
