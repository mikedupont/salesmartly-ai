import { cleanText } from "./common.js";

export function normalizeReplyText(text) {
  const normalized = cleanText(text || "");
  return normalized
    .replace(/^Mia:\s*/i, "")
    .replace(/^(?:i['’]?m\s+(?:an?\s+)?(?:ai|a robot|a bot|virtual conversational representative)[^.!\n]*)[.!\n]?\s*/i, "")
    .replace(/^(?:as an?\s+(?:ai|bot|robot)[^.!\n]*)[.!\n]?\s*/i, "");
}
