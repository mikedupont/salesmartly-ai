export function choosePace(intent, stage, latest) {
  if (intent === "support") return "slow";
  if (stage === "new") return "balanced";
  if (stage === "trusted" || stage === "light_romantic" || stage === "stable_companion") return "natural";
  if (latest.length < 20) return "light";
  return "balanced";
}

function chooseOpeningVariant({ intent, stage, shouldAsk, questionRhythm }) {
  if (intent === "support") {
    if (shouldAsk) return questionRhythm === "active" ? "warm_checkin" : "gentle_hold";
    return stage === "new" ? "soft_acknowledgement" : "grounded_acknowledgement";
  }

  if (intent === "practical") {
    return shouldAsk ? "answer_then_gently_probe" : "clear_direct_reply";
  }

  if (intent === "smalltalk") {
    if (shouldAsk) return questionRhythm === "active" ? "easy_bridge" : "light_bridge";
    return stage === "new" ? "easy_entry" : "casual_reaction";
  }

  if (stage === "light_romantic" || stage === "stable_companion") {
    return shouldAsk ? "soft_flirt_bridge" : "warm_continuity";
  }

  return shouldAsk ? "gentle_open_loop" : "short_continuity";
}

function chooseClosingVariant({ intent, stage, shouldAsk, questionRhythm }) {
  if (shouldAsk) {
    if (questionRhythm === "active") return "open_loop";
    if (intent === "support") return "soft_open";
    return "natural_open";
  }

  if (intent === "support") return stage === "new" ? "quiet_stop" : "hold_space";
  if (intent === "practical") return "clean_stop";
  if (stage === "light_romantic" || stage === "stable_companion") return "warm_finish";
  return "leave_room";
}

export function buildResponsePattern(intent, shouldAsk, pace, questionBudget = shouldAsk ? 1 : 0) {
  if (!shouldAsk) {
    if (intent === "support") return "empathy_then_hold_space";
    if (intent === "practical") return "answer_then_close_softly";
    return pace === "slow" ? "short_warm_acknowledgement" : "answer_first";
  }

  if (questionBudget <= 0) {
    if (intent === "support") return "empathy_then_hold_space";
    if (intent === "smalltalk") return "warm_opening";
    return "answer_first";
  }

  if (intent === "support") return "empathy_then_single_question";
  if (intent === "practical") return "answer_then_single_clarifier";
  if (intent === "smalltalk") return "warm_opener_then_followup";
  return "answer_then_single_followup";
}

export function buildPaceGuide({
  intent,
  stage,
  shouldAsk,
  latest,
  questionBudget = shouldAsk ? 1 : 0,
  questionRhythm = "balanced",
}) {
  const pace = choosePace(intent, stage, latest);
  const length = shouldAsk ? (pace === "slow" ? "short" : "medium") : pace === "slow" ? "short" : "medium";
  const density = shouldAsk ? (questionBudget > 0 ? "balanced" : "light") : "light";
  const openness = shouldAsk ? "keep_a_natural_opening" : "leave_a_soft_end";
  const openingStyle =
    intent === "support"
      ? "empathy_first"
      : intent === "practical"
        ? "answer_first"
        : stage === "new"
          ? "light_entry"
          : "easy_entry";
  const closingStyle = chooseClosingVariant({ intent, stage, shouldAsk, questionRhythm });

  return {
    pace,
    length,
    density,
    openness,
    openingStyle,
    closingStyle,
    openingVariant: chooseOpeningVariant({ intent, stage, shouldAsk, questionRhythm }),
    closingVariant: closingStyle,
    questionRhythm,
    pattern: buildResponsePattern(intent, shouldAsk, pace, questionBudget),
  };
}
