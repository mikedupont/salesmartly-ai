export function applyReplyBoundaries(text, { dialogueStrategy, relationshipStage } = {}) {
  const reply = String(text || "").trim();
  if (!reply) return reply;

  const stage = String(relationshipStage || dialogueStrategy?.stage || "").toLowerCase();
  const supportsQuestion = !!dialogueStrategy?.shouldAsk;

  let output = reply;
  if (!supportsQuestion) {
    output = output.replace(/[?？]+/g, ".");
  }

  if (stage === "new") {
    output = output.replace(/(^|\n)\s*[\-•]\s*/g, "$1");
  }

  output = output
    .replace(/(?:^|\s)(?:let me know if you want to share more|i'?m here if you want to share more|happy to help|i'?d be happy to help|feel free to share more|if you want, i can help)([.!?])?$/i, "")
    .replace(/(?:^|\s)(?:as an? (?:ai|assistant|bot|robot)[^.!\n]*)$/i, "")
    .replace(/(?:^|\s)(?:i'?m here to help)([.!?])?$/i, "");

  output = output
    .replace(/(?:^|\s)(?:i['’]?m|i am)\s+(?:just\s+)?(?:an?\s+)?(?:ai|bot|robot|virtual(?:\s+assistant)?|assistant|real person)[^.!\n]*([.!?])?/i, "")
    .replace(/(?:^|\s)(?:as an?\s+(?:ai|bot|robot|assistant))[^.!\n]*([.!?])?/i, "");

  return output;
}
