import { cleanText } from "./common.js";

const RELATIONSHIP_TOPIC_HINTS = [
  { match: ["work", "job", "office", "developer", "engineer", "programmer", "加班", "工作", "项目", "老板"], topic: "work" },
  { match: ["sleep", "insomnia", "night", "rest", "失眠", "睡", "作息", "晚上"], topic: "sleep" },
  { match: ["gym", "fitness", "run", "training", "exercise", "健身", "跑步", "训练", "运动"], topic: "fitness" },
  { match: ["food", "cook", "coffee", "meal", "吃", "咖啡", "做饭"], topic: "daily_life" },
  { match: ["lonely", "miss", "relationship", "romantic", "love", "想你", "孤单", "感情", "喜欢"], topic: "emotion" },
  { match: ["weekend", "holiday", "travel", "trip", "周末", "休息", "旅行"], topic: "life_rhythm" },
];

export function collectDialogueTopics({ signalText = "", memoryFacts = [], vectorMemories = [] }) {
  const topics = new Set();
  const text = cleanText(signalText).toLowerCase();

  for (const hint of RELATIONSHIP_TOPIC_HINTS) {
    if (hint.match.some((word) => text.includes(String(word).toLowerCase()))) {
      topics.add(hint.topic);
    }
  }

  for (const fact of memoryFacts) {
    const factText = cleanText(`${fact.key} ${fact.value}`).toLowerCase();
    for (const hint of RELATIONSHIP_TOPIC_HINTS) {
      if (hint.match.some((word) => factText.includes(String(word).toLowerCase()))) {
        topics.add(hint.topic);
      }
    }
  }

  for (const memory of vectorMemories) {
    const memoryText = cleanText(`${memory.sourceType || ""} ${memory.text || ""}`).toLowerCase();
    for (const hint of RELATIONSHIP_TOPIC_HINTS) {
      if (hint.match.some((word) => memoryText.includes(String(word).toLowerCase()))) {
        topics.add(hint.topic);
      }
    }
  }

  if (!topics.size && text) {
    if (text.length > 20) topics.add("current_mood");
    if (/[?？]/.test(text)) topics.add("clarification");
  }

  return [...topics];
}

export function chooseActiveThread(topics, latest, summary) {
  return topics[0] || inferTopicFromText(latest) || inferTopicFromText(summary) || "conversation";
}

export function chooseTopicShift(topics = [], commonGround = [], latest = "", stage = "new") {
  const primary = topics[0] || inferTopicFromText(latest) || inferTopicFromText(commonGround.join(" ")) || "conversation";
  const secondary = topics[1] || commonGround[0] || "";

  let motion = "keep_open";
  if (stage === "new") motion = commonGround.length > 0 ? "soft_bridge" : "light_opening";
  else if (topics.length > 1) motion = "bridge_threads";
  else if (commonGround.length > 0) motion = "stay_with_shared_ground";
  else if (/[?？]/.test(latest)) motion = "narrow_then_answer";

  return {
    primary,
    secondary,
    motion,
  };
}

export function inferTopicFromText(text) {
  const t = cleanText(text).toLowerCase();
  for (const hint of RELATIONSHIP_TOPIC_HINTS) {
    if (hint.match.some((word) => t.includes(String(word).toLowerCase()))) return hint.topic;
  }
  return "";
}
