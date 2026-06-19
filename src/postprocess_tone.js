export function refineReplyTone(text, { dialogueStrategy } = {}) {
  const reply = String(text || "").trim();
  if (!reply) return reply;

  const tone = dialogueStrategy?.tone || "warm";
  let output = reply;

  if (tone === "gentle") {
    output = output.replace(/(!{2,})/g, "!").replace(/(\.{3,})/g, "...");
  }

  if (tone === "soft") {
    output = output.replace(/(\.{2,})/g, ".").replace(/!+/g, "!");
  }

  if (tone === "clear") {
    output = output.replace(/🙂|😊|😂|😅|😉/g, "");
  }

  output = output
    .replace(/\b(let me know if you need anything|i'?m here if you want to share more|happy to help|i'?d be happy to help|feel free to share more|if you want, i can help)\b[.!?]?\s*$/i, "")
    .replace(/\b(as an? (?:ai|assistant|bot|robot).*)$/i, "")
    .replace(/\b(i'?m here to help)\b[.!?]?\s*$/i, "")
    .replace(/\b(hope that helps)\b[.!?]?\s*$/i, "")
    .replace(/\b(sounds good|that works|let's do that|that makes sense)\b[.!?]?\s*$/i, (match) => {
      return tone === "clear" ? "" : match;
    });

  return output.trim();
}
