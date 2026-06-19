import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function parseJsonl(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function postBatch({ baseUrl, adminKey, split, records, replace }) {
  const response = await fetch(new URL("/admin/empathetic/import", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({
      split,
      replace,
      records,
    }),
  });

  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(`Import failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const baseUrl = process.argv[2] || process.env.EMPATHETIC_WORKER_URL;
  const adminKey = process.argv[3] || process.env.SUMMARY_ADMIN_KEY;
  const replace = String(process.env.EMPATHETIC_REPLACE || "").toLowerCase() === "1" || String(process.env.EMPATHETIC_REPLACE || "").toLowerCase() === "true";
  const limit = Number(process.env.EMPATHETIC_LIMIT || 0);

  if (!baseUrl || !adminKey) {
    throw new Error("Usage: node scripts/import_empathetic_dialogues_online.mjs <worker-url> <admin-key>");
  }

  const generator = spawnSync("python3", [
    "scripts/generate_empathetic_dialogues_seed.py",
    "--output",
    "-",
    ...(Number.isFinite(limit) && limit > 0 ? ["--limit", String(Math.floor(limit))] : []),
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });

  if (generator.status !== 0) {
    throw new Error(generator.stderr || generator.stdout || `Generator failed with code ${generator.status}`);
  }

  const records = parseJsonl(generator.stdout);
  const splitGroups = new Map();
  for (const record of records) {
    const split = String(record?.metadata?.dataset_split || "train").toLowerCase();
    if (!splitGroups.has(split)) splitGroups.set(split, []);
    splitGroups.get(split).push(record);
  }

  const results = [];
  for (const [split, splitRecords] of splitGroups.entries()) {
    const groups = chunk(splitRecords, 200);
    let imported = 0;
    for (const [index, group] of groups.entries()) {
      const response = await postBatch({
        baseUrl,
        adminKey,
        split,
        records: group,
        replace: replace && split === "train" && index === 0,
      });
      imported += Number(response.inserted || 0);
    }
    results.push({ split, imported });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
