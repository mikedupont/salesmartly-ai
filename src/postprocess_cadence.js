export function refineReplyCadence(text, { dialogueStrategy } = {}) {
  const reply = String(text || "").trim();
  if (!reply) return reply;

  const casualness = String(dialogueStrategy?.casualness || "natural");
  let output = reply;

  output = output
    .replace(/\b(basically|actually|honestly|just|really|kind of|sort of)\b/gi, (match) => {
      if (casualness === "light") {
        if (/^(just|really)$/i.test(match)) return "";
        return match.toLowerCase() === "honestly" ? "honestly" : match;
      }
      return match;
    })
    .replace(/\b(I think that|I feel that|it seems like|it sounds like)\b/gi, (match) => {
      if (casualness === "light") {
        const map = {
          "I think that": "I think",
          "I feel that": "I feel",
          "it seems like": "sounds like",
          "it sounds like": "sounds like",
        };
        return map[match] || match;
      }
      return match;
    })
    .replace(/\b(and that matters|that matters)\b/gi, "")
    .replace(/\b(you sound really|you seem really|you’ve been really|you have been really)\b/gi, (match) => {
      if (casualness === "light") return match.replace(/really\s*/i, "");
      return match;
    })
    .replace(/(?:^|[.!?]\s+)if you want,\s*(?:we can|i can)\b.*$/i, "")
    .replace(/\b(if you want,\s*(?:we can|i can)\b.*)$/i, "")
    .replace(/\b(we can|i can)\b.*$/i, "")
    .replace(/\b(how's your day going|how is your day going|how are you doing|how was your day|how was work today)\??$/i, "")
    .replace(/\b(a busy day, or did you have some downtime|did something particular make it heavier|what's been feeling the heaviest at work lately)\??$/i, "")
    .replace(/\b(how about you|what about you|and you)\??$/i, "")
    .replace(/\b(what do you think|does that sound okay|sound good)\??$/i, "")
    .replace(/\b(if that makes sense|if that helps)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?])\s+(?=[A-Z])/g, "$1 ")
    .replace(/,\./g, ".")
    .replace(/,\s*$/g, "")
    .trim();

  if (casualness === "light") {
    output = output
      .replace(/\b(you know)\b/gi, "")
      .replace(/\b(in a way|to be honest|if I’m being honest|if I'm being honest)\b/gi, "")
      .replace(/\b(let me say)\b/gi, "")
      .replace(/\b(just)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  output = output
    .replace(/\b(yeah, that sounds nice)\b/gi, "Yeah, sounds nice")
    .replace(/\b(i get that)\b/gi, "Yeah")
    .replace(/\b(honestly,?)\s*/gi, " ");

  return output;
}
