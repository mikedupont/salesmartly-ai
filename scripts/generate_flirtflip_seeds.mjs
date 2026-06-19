import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const SOURCE_URL = "https://huggingface.co/datasets/shirshatzman/flirtflip-dataset/resolve/main/flirtflip_dataset.json";

const SYSTEM_PROMPT = "You are Mia, a warm private-chat companion designed for natural, long-term conversations.";

function toJsonl(lines) {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function buildMetadata({ sourceKind, styleTags, scenario }) {
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

function buildSftRecord({ id, original, reply, style, scenario }) {
  return {
    id,
    type: "sft",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: normalize(original) },
      { role: "assistant", content: normalize(reply) },
    ],
    metadata: buildMetadata({
      sourceKind: "flirtflip_seed",
      styleTags: [style, "short", "flirtatious", "respectful"],
      scenario,
    }),
  };
}

function buildDpoRecord({ id, original, chosen, rejected, style, scenario }) {
  return {
    id,
    type: "dpo",
    prompt: `System: ${SYSTEM_PROMPT} User: ${normalize(original)}`,
    chosen: normalize(chosen),
    rejected: normalize(rejected),
    metadata: buildMetadata({
      sourceKind: "flirtflip_seed",
      styleTags: [style, "preference_pair", "flirtatious"],
      scenario,
    }),
  };
}

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download FlirtFlip dataset: ${response.status} ${response.statusText}`);
  }

  const dataset = await response.json();
  if (!Array.isArray(dataset) || !dataset.length) {
    throw new Error("FlirtFlip dataset is empty or malformed");
  }

  const seedSft = [];
  const seedDpo = [];
  const finalSft = [];
  const finalDpo = [];

  for (const row of dataset) {
    const original = normalize(row.original);
    const gentle = normalize(row.gentle);
    const playful = normalize(row.playful);
    const bold = normalize(row.bold);
    const scenario = normalize(row.scenario);
    const baseId = normalize(row.id || "").toLowerCase();

    if (!original || !gentle || !playful || !bold) {
      continue;
    }

    seedSft.push(
      buildSftRecord({
        id: `${baseId}-gentle`,
        original,
        reply: gentle,
        style: "gentle",
        scenario,
      }),
      buildSftRecord({
        id: `${baseId}-playful`,
        original,
        reply: playful,
        style: "playful",
        scenario,
      })
    );

    seedDpo.push(
      buildDpoRecord({
        id: `${baseId}-gentle-vs-bold`,
        original,
        chosen: gentle,
        rejected: bold,
        style: "gentle",
        scenario,
      }),
      buildDpoRecord({
        id: `${baseId}-playful-vs-bold`,
        original,
        chosen: playful,
        rejected: bold,
        style: "playful",
        scenario,
      })
    );

    finalSft.push(
      buildSftRecord({
        id: `${baseId}-gentle`,
        original,
        reply: gentle,
        style: "gentle",
        scenario,
      })
    );

    finalDpo.push(
      buildDpoRecord({
        id: `${baseId}-gentle-vs-bold`,
        original,
        chosen: gentle,
        rejected: bold,
        style: "gentle",
        scenario,
      })
    );
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, "flirtflip_seed_sft.jsonl"), toJsonl(seedSft), "utf8");
  await writeFile(path.join(DATA_DIR, "flirtflip_seed_dpo.jsonl"), toJsonl(seedDpo), "utf8");
  await writeFile(path.join(DATA_DIR, "flirtflip_final_sft.jsonl"), toJsonl(finalSft), "utf8");
  await writeFile(path.join(DATA_DIR, "flirtflip_final_dpo.jsonl"), toJsonl(finalDpo), "utf8");

  console.log(JSON.stringify({
    sourceUrl: SOURCE_URL,
    rows: dataset.length,
    seedSft: seedSft.length,
    seedDpo: seedDpo.length,
    finalSft: finalSft.length,
    finalDpo: finalDpo.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
