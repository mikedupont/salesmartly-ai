import { normalizeReplyText } from "./postprocess_normalize.js";
import { enforceQuestionBudget } from "./postprocess_questions.js";
import { capReplyLength } from "./postprocess_length.js";
import { refineReplyTone } from "./postprocess_tone.js";
import { applyReplyBoundaries } from "./postprocess_boundary.js";
import { refineReplyCadence } from "./postprocess_cadence.js";

export function postProcessAIReply(text, { dialogueStrategy, relationshipStage } = {}) {
  const shouldAsk = !!dialogueStrategy?.shouldAsk;
  const questionBudget = Number.isFinite(Number(dialogueStrategy?.questionBudget))
    ? Number(dialogueStrategy.questionBudget)
    : shouldAsk
      ? 1
      : 0;
  const lengthLimit = shouldAsk ? 280 : 340;

  return capReplyLength(
    enforceQuestionBudget(
        applyReplyBoundaries(
          refineReplyCadence(
            refineReplyTone(
              normalizeReplyText(text),
              { dialogueStrategy }
            ),
            { dialogueStrategy }
        ),
      { dialogueStrategy, relationshipStage }
      ),
      { shouldAsk, questionBudget }
    ),
    lengthLimit
  );
}
