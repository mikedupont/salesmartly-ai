export function capReplyLength(text, maxChars = 320) {
  const reply = String(text || "").trim();
  if (!reply || reply.length <= maxChars) return reply;

  const cutoff = Math.max(maxChars - 1, 0);
  const sliced = reply.slice(0, cutoff);
  const sentenceBreaks = Math.max(
    sliced.lastIndexOf("。"),
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("！"),
    sliced.lastIndexOf("?"),
    sliced.lastIndexOf("？")
  );

  if (sentenceBreaks > 40) {
    return sliced.slice(0, sentenceBreaks + 1).trim();
  }

  return sliced.replace(/\s+\S*$/, "").trim();
}
