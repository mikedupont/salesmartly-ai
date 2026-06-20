import { pathToFileURL } from "node:url";

async function main() {
  const baseUrl = process.argv[2] || process.env.FLIRTFLIP_WORKER_URL;
  const adminKey = process.argv[3] || process.env.SUMMARY_ADMIN_KEY;
  const replace = String(process.env.FLIRTFLIP_REPLACE || "").toLowerCase() === "1" || String(process.env.FLIRTFLIP_REPLACE || "").toLowerCase() === "true";
  const limit = Number(process.env.FLIRTFLIP_LIMIT || 0);

  if (!baseUrl || !adminKey) {
    throw new Error("Usage: node scripts/import_flirtflip_supplement_online.mjs <worker-url> <admin-key>");
  }

  const response = await fetch(new URL("/admin/flirtflip/supplement/sync", baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    },
    body: JSON.stringify({
      replace,
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0,
    }),
  });

  const data = await response.json().catch(() => ({ ok: false }));
  if (!response.ok || !data.ok) {
    throw new Error(`Import failed: ${response.status} ${JSON.stringify(data)}`);
  }

  console.log(JSON.stringify({ ok: true, ...data }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
