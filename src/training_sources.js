export const FLIRTFLIP_SOURCE_URL =
  "https://huggingface.co/datasets/shirshatzman/flirtflip-dataset/resolve/main/flirtflip_dataset.json";

export const EMPATHETIC_DIALOGUES_SOURCE_URL =
  "https://dl.fbaipublicfiles.com/parlai/empatheticdialogues/empatheticdialogues.tar.gz";

const FLIRTFLIP_SYSTEM_PROMPT = "You are Mia, a warm private-chat companion designed for natural, long-term conversations.";

export function normalizeTrainingText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildFlirtFlipMetadata({ sourceKind, styleTags, scenario }) {
  return {
    schema_version: "training_v1",
    source_kind: sourceKind,
    public_sources: ["FlirtFlip"],
    sample_stage: "trusted",
    sample_intent: "smalltalk",
    style_tags: styleTags,
    clean_stage: "seed",
    scenario,
  };
}

function buildFlirtFlipSftRecord({ id, original, reply, style, scenario }) {
  return {
    id,
    type: "sft",
    messages: [
      { role: "system", content: FLIRTFLIP_SYSTEM_PROMPT },
      { role: "user", content: normalizeTrainingText(original) },
      { role: "assistant", content: normalizeTrainingText(reply) },
    ],
    metadata: buildFlirtFlipMetadata({
      sourceKind: "flirtflip_seed",
      styleTags: [style, "short", "flirtatious", "respectful"],
      scenario,
    }),
  };
}

function buildFlirtFlipDpoRecord({ id, original, chosen, rejected, style, scenario }) {
  return {
    id,
    type: "dpo",
    prompt: `System: ${FLIRTFLIP_SYSTEM_PROMPT} User: ${normalizeTrainingText(original)}`,
    chosen: normalizeTrainingText(chosen),
    rejected: normalizeTrainingText(rejected),
    metadata: buildFlirtFlipMetadata({
      sourceKind: "flirtflip_seed",
      styleTags: [style, "preference_pair", "flirtatious"],
      scenario,
    }),
  };
}

export function buildFlirtFlipSourceRecords(dataset = []) {
  const seedSft = [];
  const seedDpo = [];
  const finalSft = [];
  const finalDpo = [];

  for (const row of Array.isArray(dataset) ? dataset : []) {
    const original = normalizeTrainingText(row?.original);
    const gentle = normalizeTrainingText(row?.gentle);
    const playful = normalizeTrainingText(row?.playful);
    const bold = normalizeTrainingText(row?.bold);
    const scenario = normalizeTrainingText(row?.scenario);
    const baseId = normalizeTrainingText(row?.id || "").toLowerCase();

    if (!original || !gentle || !playful || !bold) {
      continue;
    }

    seedSft.push(
      buildFlirtFlipSftRecord({
        id: `${baseId}-gentle`,
        original,
        reply: gentle,
        style: "gentle",
        scenario,
      }),
      buildFlirtFlipSftRecord({
        id: `${baseId}-playful`,
        original,
        reply: playful,
        style: "playful",
        scenario,
      })
    );

    seedDpo.push(
      buildFlirtFlipDpoRecord({
        id: `${baseId}-gentle-vs-bold`,
        original,
        chosen: gentle,
        rejected: bold,
        style: "gentle",
        scenario,
      }),
      buildFlirtFlipDpoRecord({
        id: `${baseId}-playful-vs-bold`,
        original,
        chosen: playful,
        rejected: bold,
        style: "playful",
        scenario,
      })
    );

    finalSft.push(
      buildFlirtFlipSftRecord({
        id: `${baseId}-gentle`,
        original,
        reply: gentle,
        style: "gentle",
        scenario,
      })
    );

    finalDpo.push(
      buildFlirtFlipDpoRecord({
        id: `${baseId}-gentle-vs-bold`,
        original,
        chosen: gentle,
        rejected: bold,
        style: "gentle",
        scenario,
      })
    );
  }

  return {
    seedSft,
    seedDpo,
    finalSft,
    finalDpo,
  };
}

function cleanEmpatheticText(text = "") {
  let value = String(text || "");
  value = value.replaceAll("_comma_", ",");
  value = value.replaceAll("_period_", ".");
  value = value.replaceAll("_question_", "?");
  value = value.replaceAll("_exclamation_", "!");
  value = value.replaceAll("_apos_", "'");
  return value.replace(/\s+/g, " ").trim();
}

export function buildEmpatheticDialogueRecord(row = {}, split = "train", index = 0) {
  const prompt = cleanEmpatheticText(row.prompt);
  const utterance = cleanEmpatheticText(row.utterance);
  const convId = cleanEmpatheticText(row.conv_id);
  const context = cleanEmpatheticText(row.context);
  const selfeval = cleanEmpatheticText(row.selfeval);
  const tags = cleanEmpatheticText(row.tags);

  if (!prompt || !utterance) {
    return null;
  }

  return {
    id: `ed_${split}_${convId}_${Number(row.utterance_idx || index)}`,
    type: "sft",
    messages: [
      { role: "system", content: "You are Mia, a warm private-chat companion designed for natural, long-term conversations." },
      { role: "user", content: prompt },
      { role: "assistant", content: utterance },
    ],
    metadata: {
      schema_version: "training_v1",
      source_kind: "empathetic_dialogues",
      public_sources: ["EmpatheticDialogues"],
      sample_stage: "seed",
      sample_intent: "support",
      dataset_split: split,
      context,
      conversation_id: convId,
      utterance_idx: Number(row.utterance_idx || index),
      speaker_idx: Number(row.speaker_idx || 0),
      selfeval,
      tags,
    },
  };
}
