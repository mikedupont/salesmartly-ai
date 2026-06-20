export const FLIRTFLIP_SOURCE_URL =
  "https://huggingface.co/datasets/shirshatzman/flirtflip-dataset/resolve/main/flirtflip_dataset.json";

export const FLIRTFLIP_SUPPLEMENT_SOURCE_URL =
  "https://huggingface.co/datasets/the-rizz/the-rizz-corpus/resolve/main/the-rizz-corpus.txt";

export const EMPATHETIC_DIALOGUES_SOURCE_URL =
  "https://dl.fbaipublicfiles.com/parlai/empatheticdialogues/empatheticdialogues.tar.gz";

const FLIRTFLIP_SYSTEM_PROMPT = "You are Mia, a warm private-chat companion designed for natural, long-term conversations.";

export function normalizeTrainingText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildFlirtFlipMetadata({ sourceKind, datasetKind, styleTags, scenario, publicSources = ["FlirtFlip"] }) {
  return {
    schema_version: "training_v1",
    source_kind: sourceKind,
    public_sources: Array.isArray(publicSources) ? publicSources : ["FlirtFlip"],
    sample_stage: "trusted",
    sample_intent: "smalltalk",
    style_tags: styleTags,
    clean_stage: datasetKind,
    scenario,
  };
}

function buildFlirtFlipSftRecord({ id, original, reply, style, scenario, datasetKind, sourceKind, publicSources }) {
  return {
    id,
    type: "sft",
    messages: [
      { role: "system", content: FLIRTFLIP_SYSTEM_PROMPT },
      { role: "user", content: normalizeTrainingText(original) },
      { role: "assistant", content: normalizeTrainingText(reply) },
    ],
    metadata: buildFlirtFlipMetadata({
      sourceKind: sourceKind || "flirtflip_seed",
      datasetKind: datasetKind || "seed",
      styleTags: [style, "short", "flirtatious", "respectful"],
      scenario,
      publicSources,
    }),
  };
}

function buildFlirtFlipDpoRecord({ id, original, chosen, rejected, style, scenario, datasetKind, sourceKind, publicSources }) {
  return {
    id,
    type: "dpo",
    prompt: `System: ${FLIRTFLIP_SYSTEM_PROMPT} User: ${normalizeTrainingText(original)}`,
    chosen: normalizeTrainingText(chosen),
    rejected: normalizeTrainingText(rejected),
    metadata: buildFlirtFlipMetadata({
      sourceKind: sourceKind || "flirtflip_seed",
      datasetKind: datasetKind || "seed",
      styleTags: [style, "preference_pair", "flirtatious"],
      scenario,
      publicSources,
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
        datasetKind: "seed",
        sourceKind: "flirtflip_seed",
        publicSources: ["FlirtFlip"],
      }),
      buildFlirtFlipSftRecord({
        id: `${baseId}-playful`,
        original,
        reply: playful,
        style: "playful",
        scenario,
        datasetKind: "seed",
        sourceKind: "flirtflip_seed",
        publicSources: ["FlirtFlip"],
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
        datasetKind: "seed",
        sourceKind: "flirtflip_seed",
        publicSources: ["FlirtFlip"],
      }),
      buildFlirtFlipDpoRecord({
        id: `${baseId}-playful-vs-bold`,
        original,
        chosen: playful,
        rejected: bold,
        style: "playful",
        scenario,
        datasetKind: "seed",
        sourceKind: "flirtflip_seed",
        publicSources: ["FlirtFlip"],
      })
    );

    finalSft.push(
      buildFlirtFlipSftRecord({
        id: `${baseId}-gentle`,
        original,
        reply: gentle,
        style: "gentle",
        scenario,
        datasetKind: "final",
        sourceKind: "flirtflip_final",
        publicSources: ["FlirtFlip"],
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
        datasetKind: "final",
        sourceKind: "flirtflip_final",
        publicSources: ["FlirtFlip"],
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

function parseFlirtFlipCorpusTurns(text = "") {
  const records = [];
  const lines = String(text || "").split(/\r?\n/);
  const turnRe = /^<s>\[INST\]\s*([\s\S]*?)\s*\[\/INST\]\s*([\s\S]*?)<\/s>\s*$/;

  let blockIndex = 0;
  let turnIndex = 0;
  let inSystemBlock = false;
  let systemParts = [];

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    if (line.startsWith("<<SYS>>")) {
      blockIndex += 1;
      turnIndex = 0;
      inSystemBlock = true;
      systemParts = [line.slice("<<SYS>>".length)];
      if (line.includes("<</SYS>>")) {
        systemParts = [line.split("<</SYS>>", 1)[0].slice("<<SYS>>".length)];
        inSystemBlock = false;
      }
      continue;
    }

    if (inSystemBlock) {
      if (line.includes("<</SYS>>")) {
        systemParts.push(line.split("<</SYS>>", 1)[0]);
        inSystemBlock = false;
      } else {
        systemParts.push(line);
      }
      continue;
    }

    const match = line.match(turnRe);
    if (!match) continue;

    const user = normalizeTrainingText(match[1]);
    const assistant = normalizeTrainingText(match[2]);
    if (!user || !assistant) continue;
    if (user.length < 4 || assistant.length < 4) continue;
    if (user.length > 220 || assistant.length > 220) continue;

    turnIndex += 1;
    const system = normalizeTrainingText(systemParts.join(" ")) || FLIRTFLIP_SYSTEM_PROMPT;
    records.push({
      id: `rz${blockIndex}_${turnIndex}`,
      type: "sft",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "assistant", content: assistant },
      ],
      metadata: buildFlirtFlipMetadata({
        sourceKind: "the_rizz_corpus",
        datasetKind: "supplement",
        styleTags: ["flirty", "witty", "light", "kind"],
        scenario: "social_app_chat",
        publicSources: ["the-rizz-corpus"],
      }),
    });
  }

  return records;
}

export function buildFlirtFlipSupplementRecords(text = "") {
  return parseFlirtFlipCorpusTurns(text);
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
