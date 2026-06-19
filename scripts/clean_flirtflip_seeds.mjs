import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");

function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

function keepOnlyGentleSft(rows) {
  return rows.filter((row) => String(row?.id || "").includes("-gentle"));
}

function keepOnlyGentleDpo(rows) {
  return rows.filter((row) => String(row?.id || "").includes("-gentle-vs-bold"));
}

async function main() {
  const seedSft = parseJsonl(await readFile(path.join(DATA_DIR, "flirtflip_seed_sft.jsonl"), "utf8"));
  const seedDpo = parseJsonl(await readFile(path.join(DATA_DIR, "flirtflip_seed_dpo.jsonl"), "utf8"));

  const finalSft = keepOnlyGentleSft(seedSft).map((row) => ({
    ...row,
    metadata: {
      ...row.metadata,
      clean_stage: "final",
    },
  }));

  const finalDpo = keepOnlyGentleDpo(seedDpo).map((row) => ({
    ...row,
    metadata: {
      ...row.metadata,
      clean_stage: "final",
    },
  }));

  await writeFile(path.join(DATA_DIR, "flirtflip_final_sft.jsonl"), toJsonl(finalSft), "utf8");
  await writeFile(path.join(DATA_DIR, "flirtflip_final_dpo.jsonl"), toJsonl(finalDpo), "utf8");

  console.log(JSON.stringify({
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
