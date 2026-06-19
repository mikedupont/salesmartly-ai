import { cleanText } from "./common.js";

export function collectCommonGround({ memoryFacts = [], summary = "", stage = "new", signalText = "" }) {
  const items = [];
  const factsText = memoryFacts.map((fact) => `${fact.key} ${fact.value}`).join(" ").toLowerCase();
  const merged = cleanText(`${summary} ${signalText}`.toLowerCase());

  if (factsText.includes("night") || factsText.includes("晚上") || merged.includes("晚上")) {
    items.push("night chats");
  }
  if (factsText.includes("work") || factsText.includes("工作") || merged.includes("工作")) {
    items.push("work rhythm");
  }
  if (factsText.includes("fitness") || factsText.includes("健身") || merged.includes("健身")) {
    items.push("fitness recovery");
  }
  if (stage === "trusted" || stage === "light_romantic" || stage === "stable_companion") {
    items.push("shared continuity");
  }
  if (/累|疲惫|压力|stress|tired|busy/i.test(merged)) {
    items.push("fatigue and pressure");
  }
  if (/night|晚上|late|深夜/i.test(merged)) {
    items.push("quiet night rhythm");
  }
  if (/coffee|咖啡|tea|茶/i.test(merged)) {
    items.push("small daily comfort");
  }
  if (/weekend|周末|holiday|休息/i.test(merged)) {
    items.push("slower weekend pace");
  }

  return [...new Set(items)];
}

export function pickCommonGroundLead(commonGround = [], stage = "new") {
  const lead = commonGround[0] || "";
  if (!lead) return stage === "new" ? "small shared rhythm" : "shared rhythm";

  if (lead === "fatigue and pressure") return "what feels heaviest right now";
  if (lead === "work rhythm") return "the part of work that is draining the most";
  if (lead === "quiet night rhythm") return "the quiet side of the day";
  if (lead === "small daily comfort") return "the little things that make the day easier";
  if (lead === "slower weekend pace") return "the slower pace you prefer";

  return lead;
}
