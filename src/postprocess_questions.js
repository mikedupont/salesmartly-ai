function countQuestionMarks(text) {
  return String(text || "").match(/[?？]/g)?.length || 0;
}

export function enforceQuestionBudget(text, { shouldAsk = false, questionBudget = shouldAsk ? 1 : 0 } = {}) {
  const reply = String(text || "").trim();
  if (!reply) return reply;

  if (!shouldAsk || questionBudget <= 0) {
    return reply.replace(/[?？]+/g, ".");
  }

  let seenQuestion = 0;
  let output = "";
  for (const char of reply) {
    if (char === "?" || char === "？") {
      if (seenQuestion >= questionBudget) {
        output += ".";
      } else {
        output += char;
        seenQuestion += 1;
      }
      continue;
    }
    output += char;
  }

  const totalQuestions = countQuestionMarks(output);
  if (totalQuestions > questionBudget) {
    let questionSeen = 0;
    let reduced = "";
    for (const char of output) {
      if (char === "?" || char === "？") {
        if (questionSeen >= questionBudget) {
          reduced += ".";
        } else {
          reduced += char;
          questionSeen += 1;
        }
        continue;
      }
      reduced += char;
    }
    return reduced;
  }

  return output;
}
