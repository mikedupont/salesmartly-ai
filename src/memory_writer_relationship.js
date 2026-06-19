import { clamp, computeRelationshipStage, normalizeStage } from "./common.js";
import { upsertRelationshipState } from "./db.js";

export function normalizeRelationshipState(row) {
  const stage = normalizeStage(row?.stage);
  const trust = clamp(Number(row?.trust ?? row?.relationship_trust ?? 0.25), 0, 1);
  const intimacy = clamp(Number(row?.intimacy ?? row?.relationship_intimacy ?? 0.15), 0, 1);

  return {
    chatUserId: row?.chat_user_id || "",
    stage,
    trust,
    intimacy,
    confidence: clamp(Number(row?.confidence ?? 0.5), 0, 1),
    lastSourceMessageId: String(row?.last_source_message_id || ""),
  };
}

export function applyRelationshipDelta(currentState, delta = {}) {
  const current = normalizeRelationshipState(currentState);
  const trustDelta = clamp(Number(delta.trust || 0), -0.2, 0.2);
  const intimacyDelta = clamp(Number(delta.intimacy || 0), -0.2, 0.2);

  const trust = clamp(current.trust + trustDelta, 0, 1);
  const intimacy = clamp(current.intimacy + intimacyDelta, 0, 1);
  const stage =
    normalizeStage(delta.stage) !== "new"
      ? normalizeStage(delta.stage)
      : computeRelationshipStage(trust, intimacy);

  return {
    ...current,
    trust,
    intimacy,
    stage,
    confidence: clamp(Number(delta.confidence ?? current.confidence ?? 0.5), 0, 1),
  };
}

export async function writeRelationshipMemory({
  env,
  chatUserId,
  relationshipState,
  relationshipDelta,
  salesmartlyMsgId,
}) {
  const nextState = applyRelationshipDelta(relationshipState, relationshipDelta);
  const relationshipRecord = await upsertRelationshipState({
    env,
    chatUserId,
    stage: nextState.stage,
    trust: nextState.trust,
    intimacy: nextState.intimacy,
    confidence: nextState.confidence,
    sourceMessageId: String(salesmartlyMsgId || ""),
  });

  return {
    nextState,
    relationshipRecord,
  };
}
