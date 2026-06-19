export function buildEmpathyPlan({ intent, stage }) {
  const tone = chooseDialogueTone(intent, stage);
  const empathyMode = chooseEmpathyMode(intent, stage);

  return {
    tone,
    empathyMode,
    reactionStyle: chooseReactionStyle(intent, stage),
    styleHint: buildStyleHint(intent, stage),
  };
}

export function chooseDialogueTone(intent, stage) {
  if (intent === "support") return stage === "new" ? "gentle" : "warm";
  if (intent === "practical") return "clear";
  if (intent === "smalltalk") return "light";
  if (stage === "light_romantic" || stage === "stable_companion") return "soft";
  return "warm";
}

export function chooseEmpathyMode(intent, stage) {
  if (intent === "support") return stage === "new" ? "acknowledge" : "hold_space";
  if (intent === "smalltalk") return "light_reaction";
  if (intent === "practical") return "clarify_first";
  if (stage === "light_romantic" || stage === "stable_companion") return "soft_continuity";
  return "balanced_support";
}

function buildStyleHint(intent, stage) {
  if (intent === "support") return stage === "new" ? "gentle_and_short" : "warm_and_grounded";
  if (intent === "practical") return "clear_and_useful";
  if (intent === "smalltalk") return "light_and_easy";
  if (stage === "light_romantic" || stage === "stable_companion") return "soft_and_continuous";
  return "warm_and_open";
}

export function chooseReactionStyle(intent, stage) {
  if (intent === "support") return stage === "new" ? "mirror_then_soft_check" : "validate_then_continue";
  if (intent === "practical") return "answer_first";
  if (intent === "smalltalk") return stage === "new" ? "light_opening" : "easy_reaction";
  if (stage === "light_romantic" || stage === "stable_companion") return "soft_continuity";
  return "warm_reaction";
}
