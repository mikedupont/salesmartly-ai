import { hasAny } from "./dialogue_intent.js";
import { cleanText } from "./common.js";

function countQuestionMarks(text) {
  return String(text || "").match(/[?？]/g)?.length || 0;
}

function countRecentAssistantQuestions(recentMessages = []) {
  return (recentMessages || []).reduce((count, message) => {
    if (message?.role !== "assistant") return count;
    return count + (countQuestionMarks(message?.content) > 0 ? 1 : 0);
  }, 0);
}

function countAssistantMessagesSinceLastQuestion(recentMessages = []) {
  let assistantCount = 0;

  for (let index = (recentMessages || []).length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    if (message?.role !== "assistant") continue;

    assistantCount += 1;
    if (countQuestionMarks(message?.content) > 0) {
      return assistantCount - 1;
    }
  }

  return assistantCount;
}

function getLastAssistantReply(recentMessages = []) {
  const reversed = [...(recentMessages || [])].reverse();
  return reversed.find((message) => message?.role === "assistant")?.content || "";
}

export function chooseQuestionRhythm({
  intent,
  stage,
  recentMessages = [],
  topics = [],
  commonGround = [],
}) {
  const recentAssistantQuestions = countRecentAssistantQuestions(recentMessages);
  const questionGap = countAssistantMessagesSinceLastQuestion(recentMessages);

  if (recentAssistantQuestions >= 2) return "restrained";
  if (stage === "new" && questionGap === 0) return "balanced";
  if (questionGap >= 3) {
    if (intent === "support" || intent === "smalltalk") return "active";
    if (topics.length > 0 || commonGround.length > 0) return "active";
    return "balanced";
  }
  if (questionGap === 2) {
    if (intent === "support" || intent === "smalltalk") return "active";
    return "balanced";
  }
  if (questionGap === 1) return "balanced";
  if (intent === "support" && stage !== "new") return "balanced";
  if (topics.length > 0 || commonGround.length > 0) return "balanced";
  return "restrained";
}

export function chooseQuestionBudget({
  intent,
  latest,
  stage,
  topics = [],
  commonGround = [],
  recentMessages = [],
}) {
  const recentAssistantQuestions = countRecentAssistantQuestions(recentMessages);
  const recentQuestionBurst = countRecentAssistantQuestions((recentMessages || []).slice(-8));
  const lastAssistantReply = getLastAssistantReply(recentMessages);
  const questionMarks = countQuestionMarks(latest);
  const shortLatest = cleanText(latest).length <= 18;
  const lastReplyAsked = countQuestionMarks(lastAssistantReply) > 0;
  const questionGap = countAssistantMessagesSinceLastQuestion(recentMessages);
  const questionRhythm = chooseQuestionRhythm({
    intent,
    stage,
    recentMessages,
    topics,
    commonGround,
  });

  if (recentQuestionBurst >= 2 && questionGap < 3) return 0;
  if (lastReplyAsked && stage === "new") return 0;

  if (intent === "support") {
    if (stage === "new" && recentAssistantQuestions >= 1) return 0;
    if (questionRhythm === "active" && questionGap >= 2) return 1;
    if (questionGap >= 3) return 1;
    return 1;
  }

  if (intent === "practical") {
    if (questionMarks > 0 || shortLatest) return 1;
    return 0;
  }

  if (intent === "smalltalk") {
    if (stage === "new") {
      if (questionMarks > 0 || topics.length > 0 || commonGround.length > 0) return 1;
      return 0;
    }

    if (recentAssistantQuestions > 0 && topics.length === 0 && commonGround.length === 0) {
      return 0;
    }

    if (questionRhythm === "active" && (topics.length > 0 || commonGround.length > 0 || questionGap >= 2)) {
      return 1;
    }

    return topics.length > 0 || commonGround.length > 0 ? 1 : 0;
  }

  if (stage === "new") {
    return questionMarks > 0 || topics.length > 0 || commonGround.length > 0 ? 1 : 0;
  }

  return questionMarks > 0 || topics.length > 0 || commonGround.length > 0 ? 1 : 0;
}

export function chooseQuestionCooldown({
  stage = "new",
  recentMessages = [],
  recentAssistantQuestions = 0,
}) {
  const lastAssistantReply = getLastAssistantReply(recentMessages);
  const lastReplyAsked = countQuestionMarks(lastAssistantReply) > 0;
  const questionGap = countAssistantMessagesSinceLastQuestion(recentMessages);
  const recentQuestionBurst = countRecentAssistantQuestions((recentMessages || []).slice(-8));
  if (stage === "new") {
    if (lastReplyAsked) return 2;
    if (recentAssistantQuestions > 0) return 1;
    return 0;
  }
  if (lastReplyAsked) return 1;
  if (questionGap >= 3) return 0;
  if (recentQuestionBurst > 1 && questionGap < 2) return 1;
  return 0;
}

export function chooseQuestionType(intent, latest, commonGround, stage = "new") {
  if (intent === "support") {
    if (stage === "new") return hasAny(latest, ["work", "工作", "job"]) ? "soft_clarify" : "soft_checkin";
    return hasAny(latest, ["work", "工作", "job"]) ? "clarify" : "comfort_followup";
  }
  if (intent === "practical") return "clarify";
  if (intent === "smalltalk") return commonGround.length ? "light_followup" : stage === "new" ? "optional" : "open";
  return latest.length > 60 ? "focused" : "open";
}

export function chooseShouldAsk(intent, latest, stage, topics, commonGround, recentMessages = []) {
  const budget = chooseQuestionBudget({
    intent,
    latest,
    stage,
    topics,
    commonGround,
    recentMessages,
  });

  return budget > 0;
}

export function buildQuestionFocus(questionType, topics, latest, commonGround = []) {
  const topic = topics[0] || inferTopicFromText(latest) || "current topic";
  const shared = commonGround[0] || "";

  if (questionType === "clarify") return `clarify ${topic}`;
  if (questionType === "soft_clarify") return `gently clarify the part about ${topic}`;
  if (questionType === "comfort_followup") return `how it feels around ${topic}`;
  if (questionType === "soft_checkin") return `a low-pressure check-in around ${topic || shared || "the moment"}`;
  if (questionType === "light_followup") return `easy follow-up on ${shared || topic}`;
  if (questionType === "focused") return `narrow the main thread around ${topic}`;
  if (questionType === "optional") return `only ask if it feels natural around ${shared || topic}`;
  return `invite the customer to continue about ${topic}`;
}

export function chooseQuestionProbability({
  intent,
  stage,
  topics = [],
  commonGround = [],
  recentMessages = [],
}) {
  const lastAssistantReply = getLastAssistantReply(recentMessages);
  const lastReplyAsked = countQuestionMarks(lastAssistantReply) > 0;
  const recentAssistantQuestions = countRecentAssistantQuestions(recentMessages);
  const questionGap = countAssistantMessagesSinceLastQuestion(recentMessages);
  const questionRhythm = chooseQuestionRhythm({
    intent,
    stage,
    recentMessages,
    topics,
    commonGround,
  });

  let probability = 0.5;
  if (intent === "support") probability = 0.6;
  if (intent === "practical") probability = 0.55;
  if (intent === "smalltalk") probability = stage === "new" ? 0.3 : 0.45;
  if (commonGround.length > 0) probability += 0.1;
  if (topics.length > 1) probability += 0.05;
  if (recentAssistantQuestions > 0) probability -= 0.2;
  if (lastReplyAsked) probability -= 0.25;
  if (stage === "new") probability -= 0.05;
  if (questionRhythm === "active") probability += 0.15;
  if (questionRhythm === "balanced") probability += 0.05;
  if (questionRhythm === "restrained") probability -= 0.1;
  if (questionGap >= 3) probability += 0.08;
  return Math.max(0, Math.min(1, probability));
}

function inferTopicFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("work") || lower.includes("工作") || lower.includes("job")) return "work";
  if (lower.includes("sleep") || lower.includes("睡") || lower.includes("night")) return "sleep";
  if (lower.includes("fitness") || lower.includes("健身") || lower.includes("gym")) return "fitness";
  return "";
}
