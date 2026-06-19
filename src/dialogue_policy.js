import { normalizeStage } from "./common.js";
import { analyzeDialogueIntent } from "./dialogue_intent.js";
import { collectDialogueTopics, chooseActiveThread, chooseTopicShift } from "./dialogue_topics.js";
import { collectCommonGround, pickCommonGroundLead } from "./dialogue_common_ground.js";
import { buildEmpathyPlan } from "./dialogue_empathy.js";
import {
  chooseQuestionType,
  chooseQuestionBudget,
  chooseQuestionProbability,
  chooseQuestionCooldown,
  chooseShouldAsk,
  chooseQuestionRhythm,
  buildQuestionFocus,
} from "./dialogue_question.js";
import { choosePace, buildResponsePattern, buildPaceGuide } from "./dialogue_pace.js";

function chooseGoal(intent, shouldAsk) {
  if (intent === "support") return shouldAsk ? "comfort_and_ask" : "comfort";
  if (intent === "practical") return shouldAsk ? "answer_and_clarify" : "answer";
  if (intent === "smalltalk") return shouldAsk ? "warm_start" : "keep_warm";
  return shouldAsk ? "deepen_conversation" : "keep_conversation";
}

function chooseConversationMove({ intent, stage, shouldAsk, topicCandidates, commonGround, latest }) {
  if (intent === "support") {
    if (shouldAsk) return stage === "new" ? "mirror_then_soft_check" : "validate_then_follow_up";
    return "hold_space";
  }
  if (intent === "practical") {
    if (shouldAsk) return "answer_then_clarify";
    return "answer_then_close";
  }
  if (intent === "smalltalk") {
    if (stage === "new") return shouldAsk ? "light_opening" : "light_acknowledgement";
    return shouldAsk ? "light_continuation" : "light_continuity";
  }
  if (commonGround.length > 0) return shouldAsk ? "shared_ground_follow_up" : "shared_ground_continuity";
  if (topicCandidates.length > 1) return "bridge_threads";
  return latest.length > 45 ? "narrow_focus" : "keep_open";
}

function chooseReplyLayer({ intent, stage, shouldAsk, commonGround, trust = 0, intimacy = 0 }) {
  const trustScore = Number.isFinite(Number(trust)) ? Number(trust) : 0;
  const intimacyScore = Number.isFinite(Number(intimacy)) ? Number(intimacy) : 0;
  const partnerLikeReady =
    stage === "stable_companion" ||
    (stage === "trusted" && trustScore >= 0.9 && intimacyScore >= 0.85) ||
    (stage === "light_romantic" && trustScore >= 0.8 && intimacyScore >= 0.7 && commonGround.length > 0);

  if (partnerLikeReady) return "partner_like";

  const flirtReady =
    stage === "light_romantic" ||
    (stage === "trusted" && (shouldAsk || commonGround.length > 0) && trustScore >= 0.7 && intimacyScore >= 0.55);

  if (flirtReady && (intent === "smalltalk" || intent === "explore")) {
    return "light_flirt";
  }

  return "emotional_value";
}

export function buildDialoguePolicy({
  customerMessage,
  customerSummary,
  memoryFacts = [],
  vectorMemories = [],
  relationshipState = {},
  recentMessages = [],
}) {
  const analysis = analyzeDialogueIntent({
    customerMessage,
    customerSummary,
    memoryFacts,
    vectorMemories,
    recentMessages,
  });
  const stage = normalizeStage(relationshipState?.stage || "new");
  const topicCandidates = collectDialogueTopics({
    signalText: analysis.signalText,
    memoryFacts,
    vectorMemories,
  });
  const commonGround = collectCommonGround({
    memoryFacts,
    summary: analysis.summary,
    stage,
    signalText: analysis.signalText,
  });
  const trust = Number(relationshipState?.trust || 0);
  const intimacy = Number(relationshipState?.intimacy || 0);
  const questionBudget = chooseQuestionBudget({
    intent: analysis.intent,
    latest: analysis.latest,
    stage,
    topics: topicCandidates,
    commonGround,
    recentMessages,
  });
  const questionRhythm = chooseQuestionRhythm({
    intent: analysis.intent,
    stage,
    recentMessages,
    topics: topicCandidates,
    commonGround,
  });
  const questionProbability = chooseQuestionProbability({
    intent: analysis.intent,
    stage,
    topics: topicCandidates,
    commonGround,
    recentMessages,
  });
  const questionCooldown = chooseQuestionCooldown({
    stage,
    recentMessages,
    recentAssistantQuestions: recentMessages.filter((message) => message?.role === "assistant" && /[?？]/.test(message?.content || "")).length,
  });
  const shouldAsk = chooseShouldAsk(analysis.intent, analysis.latest, stage, topicCandidates, commonGround, recentMessages);
  const empathy = buildEmpathyPlan({ intent: analysis.intent, stage, shouldAsk });
  const pace = choosePace(analysis.intent, stage, analysis.latest);
  const paceGuide = buildPaceGuide({
    intent: analysis.intent,
    stage,
    shouldAsk,
    latest: analysis.latest,
    questionBudget,
    questionRhythm,
  });
  const questionType = chooseQuestionType(analysis.intent, analysis.latest, commonGround, stage);
  const goal = chooseGoal(analysis.intent, shouldAsk);
  const topicShift = chooseTopicShift(topicCandidates, commonGround, analysis.latest, stage);
  const commonGroundLead = pickCommonGroundLead(commonGround, stage);
  const replyLayer = chooseReplyLayer({
    intent: analysis.intent,
    stage,
    shouldAsk,
    commonGround,
    trust,
    intimacy,
  });

  return {
    intent: analysis.intent,
    replyLayer,
    tone: empathy.tone,
    empathyMode: empathy.empathyMode,
    reactionStyle: empathy.reactionStyle,
    styleHint: empathy.styleHint,
    goal,
    shouldAsk,
    questionBudget,
    questionProbability,
    questionCooldown,
    questionRhythm,
    questionType,
    pace,
    paceGuide,
    casualness: stage === "new" ? "light" : stage === "familiar" ? "natural" : "relaxed",
    topicCandidates: topicCandidates.slice(0, 4),
    topicTrack: {
      primary: topicCandidates[0] || topicShift.primary,
      secondary: topicCandidates[1] || topicShift.secondary,
      motion: topicShift.motion,
    },
    commonGround: commonGround.slice(0, 4),
    commonGroundLead,
    questionFocus: buildQuestionFocus(questionType, topicCandidates, analysis.latest, commonGround),
    responsePattern: buildResponsePattern(analysis.intent, shouldAsk, pace, questionBudget),
    activeThread: chooseActiveThread(topicCandidates, analysis.latest, analysis.summary),
    conversationMove: chooseConversationMove({
      intent: analysis.intent,
      stage,
      shouldAsk,
      topicCandidates,
      commonGround,
      latest: analysis.latest,
    }),
    openingStyle: paceGuide.openingStyle,
    closingStyle: paceGuide.closingStyle,
    openingVariant: paceGuide.openingVariant,
    closingVariant: paceGuide.closingVariant,
    keepMomentum: shouldAsk || analysis.intent === "smalltalk" || analysis.intent === "explore" || commonGround.length > 0,
  };
}

export function formatDialoguePolicy(policy) {
  const safe = policy || {};
  const topics = (safe.topicCandidates || []).join(", ") || "none";
  const commonGround = (safe.commonGround || []).join(", ") || "none";

  return [
    `- intent: ${safe.intent || "support"}`,
    `- reply_layer: ${safe.replyLayer || "emotional_value"}`,
    `- tone: ${safe.tone || "warm"}`,
    `- empathy_mode: ${safe.empathyMode || "balanced_support"}`,
    `- reaction_style: ${safe.reactionStyle || "warm_reaction"}`,
    `- goal: ${safe.goal || "keep_conversation"}`,
    `- should_ask: ${safe.shouldAsk ? "true" : "false"}`,
    `- question_budget: ${Number.isFinite(Number(safe.questionBudget)) ? safe.questionBudget : 0}`,
    `- question_probability: ${Number.isFinite(Number(safe.questionProbability)) ? Number(safe.questionProbability).toFixed(2) : "0.00"}`,
    `- question_cooldown: ${Number.isFinite(Number(safe.questionCooldown)) ? safe.questionCooldown : 0}`,
    `- question_rhythm: ${safe.questionRhythm || "balanced"}`,
    `- question_type: ${safe.questionType || "followup"}`,
    `- pace: ${safe.pace || "balanced"}`,
    `- casualness: ${safe.casualness || "natural"}`,
    `- topic_candidates: ${topics}`,
    `- topic_track: ${(safe.topicTrack && `${safe.topicTrack.primary || "none"} / ${safe.topicTrack.secondary || "none"} / ${safe.topicTrack.motion || "keep_open"}`) || "none"}`,
    `- common_ground: ${commonGround}`,
    `- common_ground_lead: ${safe.commonGroundLead || "none"}`,
    `- question_focus: ${safe.questionFocus || "none"}`,
    `- response_pattern: ${safe.responsePattern || "answer_then_follow_up"}`,
    `- active_thread: ${safe.activeThread || "none"}`,
    `- conversation_move: ${safe.conversationMove || "keep_open"}`,
    `- opening_style: ${safe.openingStyle || "light_entry"}`,
    `- opening_variant: ${safe.openingVariant || "soft_entry"}`,
    `- closing_style: ${safe.closingStyle || "open_finish"}`,
    `- closing_variant: ${safe.closingVariant || "open_finish"}`,
    `- pace_guide: ${(safe.paceGuide && `${safe.paceGuide.pace || "balanced"} / ${safe.paceGuide.length || "medium"} / ${safe.paceGuide.density || "light"}`) || "none"}`,
  ].join("\n");
}
