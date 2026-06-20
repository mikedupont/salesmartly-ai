import {
  RECENT_MESSAGES_LIMIT,
  DUPLICATE_SECONDS,
  AUTO_REPLY_SHORT_MIN_SECONDS,
  AUTO_REPLY_SHORT_MAX_SECONDS,
  AUTO_REPLY_NORMAL_MIN_SECONDS,
  AUTO_REPLY_NORMAL_MAX_SECONDS,
  AUTO_REPLY_LONG_MIN_SECONDS,
  AUTO_REPLY_LONG_MAX_SECONDS,
  jsonResponse,
  cleanText,
  randomInt,
  sleep,
} from "./common.js";
import {
  initDb,
  upsertCustomer,
  getCustomer,
  saveMessage,
  isDuplicateCustomerMessage,
  getRecentMessages,
  loadMemoryBundle,
  getActiveMemoryFacts,
  saveTrainingSample,
  recordTrainingFeedback,
  updateTrainingSampleAnnotation,
  getTrainingSamples,
  getTrainingStats,
  buildTrainingSftRecord,
  buildTrainingDpoRecords,
  buildTrainingScenarioClass,
  getFlirtFlipSamples,
  getFlirtFlipStats,
  upsertFlirtFlipSamples,
  getEmpatheticDialogueSamples,
  getEmpatheticDialogueStats,
  upsertEmpatheticDialogueSamples,
} from "./db.js";
import {
  FLIRTFLIP_SOURCE_URL,
  EMPATHETIC_DIALOGUES_SOURCE_URL,
  buildFlirtFlipSourceRecords,
  buildEmpatheticDialogueRecord,
} from "./training_sources.js";
import { generateAIReply, generateCustomerSummary, generateMemoryWritePlan, getTextEmbedding, fallbackReply, extractOpenAIText } from "./ai.js";
import { writeMemoryTurn } from "./memory_writer.js";
import { formatMemoryFacts, formatRelationshipState, formatVectorMemories } from "./memory.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { buildMemoryDebugResponse, renderAdminPage, requireAdminKey } from "./admin.js";
import { buildHealthSnapshot } from "./monitoring.js";
import { buildDialogueStrategy } from "./dialogue.js";
import { buildConversationContext } from "./context.js";

const textDecoder = new TextDecoder("utf-8");

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function gunzipArrayBuffer(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
}

function decodeTarField(bytes, start, end) {
  return textDecoder.decode(bytes.slice(start, end)).replace(/\0.*$/, "").trim();
}

function parseTarEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const entries = [];
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = decodeTarField(header, 0, 100);
    const prefix = decodeTarField(header, 345, 500);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = decodeTarField(header, 124, 136);
    const size = Number.parseInt(sizeText || "0", 8) || 0;
    const typeFlag = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (fullName && (typeFlag === "0" || typeFlag === "\0" || typeFlag === "5")) {
      entries.push({
        name: fullName,
        size,
        bytes: bytes.slice(dataStart, dataEnd),
      });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (row.length && row.some((value) => String(value || "").trim() !== "")) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      pushCell();
      continue;
    }
    if (char === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }

  pushCell();
  pushRow();

  if (!rows.length) return [];
  const header = rows.shift().map((value) => String(value || "").trim());
  return rows.map((values) => {
    const record = {};
    for (let index = 0; index < header.length; index += 1) {
      record[header[index]] = values[index] ?? "";
    }
    return record;
  });
}

async function fetchFlirtFlipSourceRecords(limit = 0) {
  const response = await fetch(FLIRTFLIP_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download FlirtFlip dataset: ${response.status} ${response.statusText}`);
  }

  const dataset = await response.json();
  if (!Array.isArray(dataset) || !dataset.length) {
    throw new Error("FlirtFlip dataset is empty or malformed");
  }

  const source = limit > 0 ? dataset.slice(0, limit) : dataset;
  return buildFlirtFlipSourceRecords(source);
}

async function fetchEmpatheticDialogueSourceRecords(limit = 0) {
  const response = await fetch(EMPATHETIC_DIALOGUES_SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to download EmpatheticDialogues archive: ${response.status} ${response.statusText}`);
  }

  const archiveBuffer = await response.arrayBuffer();
  const tarBuffer = await gunzipArrayBuffer(archiveBuffer);
  const entries = parseTarEntries(tarBuffer);
  const splitFiles = [
    ["train", "empatheticdialogues/train.csv"],
    ["validation", "empatheticdialogues/valid.csv"],
    ["test", "empatheticdialogues/test.csv"],
  ];

  const recordsBySplit = new Map();
  for (const [split, fileName] of splitFiles) {
    const entry = entries.find((item) => item.name === fileName);
    if (!entry) {
      throw new Error(`Missing ${fileName} in EmpatheticDialogues archive`);
    }
    const rows = parseCsvRows(textDecoder.decode(entry.bytes));
    const selectedRows = limit > 0 ? rows.slice(0, limit) : rows;
    const records = [];
    for (let index = 0; index < selectedRows.length; index += 1) {
      const record = buildEmpatheticDialogueRecord(selectedRows[index], split, index + 1);
      if (record) {
        records.push(record);
      }
    }
    recordsBySplit.set(split, records);
  }

  return recordsBySplit;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        message: "Salesmartly AI webhook is running",
        health: buildHealthSnapshot(env),
      });
    }

    if (url.pathname === "/") {
      return jsonResponse({
        ok: true,
        message: "Worker is online",
        routes: [
          "/health",
          "/webhook/salesmartly",
          "/admin",
          "/admin/summarize?key=YOUR_KEY",
          "/admin/memory?key=YOUR_KEY&chat_user_id=...",
          "/admin/training?key=YOUR_KEY&chat_user_id=...",
          "/admin/training/export?key=YOUR_KEY&chat_user_id=...&scenario_class=work_fatigue",
          "/admin/flirtflip?key=YOUR_KEY",
          "/admin/flirtflip/export?key=YOUR_KEY&format=jsonl",
          "/admin/flirtflip/import?key=YOUR_KEY",
          "/admin/flirtflip/sync?key=YOUR_KEY",
          "/admin/empathetic?key=YOUR_KEY",
          "/admin/empathetic/export?key=YOUR_KEY&format=jsonl",
          "/admin/empathetic/import?key=YOUR_KEY",
          "/admin/empathetic/sync?key=YOUR_KEY",
          "/admin/training/feedback?key=YOUR_KEY",
          "/admin/training/annotate?key=YOUR_KEY",
        ],
      });
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;
      return renderAdminPage();
    }

    if (url.pathname === "/admin/memory" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const chatUserId = cleanText(url.searchParams.get("chat_user_id") || "");
      if (!chatUserId) {
        return jsonResponse({ ok: false, error: "Missing chat_user_id" }, 400);
      }

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 100);
      };

      await initDb(env);
      const result = await buildMemoryDebugResponse(env, {
        chatUserId,
        query: url.searchParams.get("q") || "",
        includeInactiveFacts: url.searchParams.get("include_inactive") !== "0",
        limits: {
          factsLimit: parseLimit(url.searchParams.get("facts_limit"), 20),
          factHistoryLimit: parseLimit(url.searchParams.get("fact_history_limit"), 30),
          recentMessagesLimit: parseLimit(url.searchParams.get("messages_limit"), 20),
          summaryLimit: parseLimit(url.searchParams.get("summaries_limit"), 10),
          vectorLimit: parseLimit(url.searchParams.get("vector_limit"), 8),
        },
        embeddingFn: (text) => getTextEmbedding(env, text),
      });
      return jsonResponse(result);
    }

    if (url.pathname === "/admin/training" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const chatUserId = cleanText(url.searchParams.get("chat_user_id") || "");
      if (!chatUserId) {
        return jsonResponse({ ok: false, error: "Missing chat_user_id" }, 400);
      }

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 100);
      };

      const status = cleanText(url.searchParams.get("status") || "all").toLowerCase();
      await initDb(env);
      const result = {
        ok: true,
        chatUserId,
        stats: await getTrainingStats(env, chatUserId),
        status,
        samples: await getTrainingSamples(env, chatUserId, parseLimit(url.searchParams.get("limit"), 20), status),
      };
      return jsonResponse(result);
    }

    if (url.pathname === "/admin/flirtflip" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 200);
      };

      await initDb(env);
      const result = {
        ok: true,
        stats: await getFlirtFlipStats(env),
        filters: {
          datasetKind: cleanText(url.searchParams.get("dataset_kind") || url.searchParams.get("datasetKind") || "all").toLowerCase(),
          recordType: cleanText(url.searchParams.get("record_type") || url.searchParams.get("recordType") || "all").toLowerCase(),
          sourceKind: cleanText(url.searchParams.get("source_kind") || url.searchParams.get("sourceKind") || ""),
        },
        samples: await getFlirtFlipSamples(env, parseLimit(url.searchParams.get("limit"), 20), {
          datasetKind: url.searchParams.get("dataset_kind") || url.searchParams.get("datasetKind") || "all",
          recordType: url.searchParams.get("record_type") || url.searchParams.get("recordType") || "all",
          sourceKind: url.searchParams.get("source_kind") || url.searchParams.get("sourceKind") || "",
        }),
      };
      return jsonResponse(result);
    }

    if (url.pathname === "/admin/flirtflip/export" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 1000);
      };

      const format = cleanText(url.searchParams.get("format") || "jsonl").toLowerCase();
      await initDb(env);
      const samples = await getFlirtFlipSamples(env, parseLimit(url.searchParams.get("limit"), 1000), {
        datasetKind: url.searchParams.get("dataset_kind") || url.searchParams.get("datasetKind") || "all",
        recordType: url.searchParams.get("record_type") || url.searchParams.get("recordType") || "all",
        sourceKind: url.searchParams.get("source_kind") || url.searchParams.get("sourceKind") || "",
      });

      if (format === "jsonl") {
        const lines = samples.map((sample) => JSON.stringify(sample.payload || {}));
        return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
          headers: {
            "Content-Type": "application/x-ndjson;charset=UTF-8",
            "Content-Disposition": `attachment; filename="flirtflip-export.jsonl"`,
          },
        });
      }

      return jsonResponse({ ok: true, samples });
    }

    if (url.pathname === "/admin/flirtflip/import" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const replace = !!(body.replace || body.reset);
      const datasetKind = cleanText(body.dataset_kind || body.datasetKind || body.variant || "").toLowerCase();

      let records = [];
      if (Array.isArray(body.records)) {
        records = body.records;
      } else if (typeof body.jsonl === "string") {
        records = body.jsonl
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
      } else if (typeof body.content === "string") {
        records = body.content
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

      const result = await upsertFlirtFlipSamples(env, records, datasetKind || "seed", replace);
      return jsonResponse({
        ok: true,
        inserted: result.inserted,
        replaced: result.replaced,
      });
    }

    if (url.pathname === "/admin/flirtflip/sync" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const replace = !!(body.replace || body.reset);
      const limit = Math.min(Math.max(Number(body.limit || url.searchParams.get("limit") || 0), 0), 5000);
      const records = await fetchFlirtFlipSourceRecords(limit);
      const batches = [
        { datasetKind: "seed", records: records.seedSft },
        { datasetKind: "seed", records: records.seedDpo },
        { datasetKind: "final", records: records.finalSft },
        { datasetKind: "final", records: records.finalDpo },
      ];

      const results = [];
      let firstBatch = true;
      for (const batch of batches) {
        const result = await upsertFlirtFlipSamples(env, batch.records, batch.datasetKind, replace && firstBatch);
        results.push({
          datasetKind: batch.datasetKind,
          recordCount: batch.records.length,
          inserted: result.inserted,
          replaced: result.replaced,
        });
        firstBatch = false;
      }

      return jsonResponse({
        ok: true,
        sourceUrl: FLIRTFLIP_SOURCE_URL,
        limit,
        results,
      });
    }

    if (url.pathname === "/admin/empathetic" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 200);
      };

      await initDb(env);
      const result = {
        ok: true,
        stats: await getEmpatheticDialogueStats(env),
        filters: {
          split: cleanText(url.searchParams.get("split") || url.searchParams.get("dataset_split") || "all").toLowerCase(),
          context: cleanText(url.searchParams.get("context") || ""),
        },
        samples: await getEmpatheticDialogueSamples(env, parseLimit(url.searchParams.get("limit"), 20), {
          split: url.searchParams.get("split") || url.searchParams.get("dataset_split") || "all",
          context: url.searchParams.get("context") || "",
        }),
      };
      return jsonResponse(result);
    }

    if (url.pathname === "/admin/empathetic/export" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const parseLimit = (value, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) return fallback;
        return Math.min(Math.floor(number), 1000);
      };

      const format = cleanText(url.searchParams.get("format") || "jsonl").toLowerCase();
      await initDb(env);
      const samples = await getEmpatheticDialogueSamples(env, parseLimit(url.searchParams.get("limit"), 1000), {
        split: url.searchParams.get("split") || url.searchParams.get("dataset_split") || "all",
        context: url.searchParams.get("context") || "",
      });

      if (format === "jsonl") {
        const lines = samples.map((sample) => JSON.stringify(sample.payload || {}));
        return new Response(lines.join("\n") + (lines.length ? "\n" : ""), {
          headers: {
            "Content-Type": "application/x-ndjson;charset=UTF-8",
            "Content-Disposition": `attachment; filename="empathetic-dialogues-export.jsonl"`,
          },
        });
      }

      return jsonResponse({ ok: true, samples });
    }

    if (url.pathname === "/admin/empathetic/import" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const replace = !!(body.replace || body.reset);
      const split = cleanText(body.split || body.dataset_split || body.variant || "").toLowerCase();

      let records = [];
      if (Array.isArray(body.records)) {
        records = body.records;
      } else if (typeof body.jsonl === "string") {
        records = body.jsonl
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
      } else if (typeof body.content === "string") {
        records = body.content
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

      const result = await upsertEmpatheticDialogueSamples(env, records, split || "train", replace);
      return jsonResponse({
        ok: true,
        inserted: result.inserted,
        replaced: result.replaced,
      });
    }

    if (url.pathname === "/admin/empathetic/sync" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;
      return jsonResponse({
        ok: false,
        error: "EmpatheticDialogues 需要通过 scripts/import_empathetic_dialogues_online.mjs 在线同步；Worker 端直接拉取官方 tar 包不稳定。",
      }, 501);
    }

    if (url.pathname === "/admin/training/export" && request.method === "GET") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      const chatUserId = cleanText(url.searchParams.get("chat_user_id") || "");
      if (!chatUserId) {
        return jsonResponse({ ok: false, error: "Missing chat_user_id" }, 400);
      }

      const format = cleanText(url.searchParams.get("format") || "json").toLowerCase();
      const dataset = cleanText(url.searchParams.get("dataset") || "sft").toLowerCase();
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 1000);
      const requestedScenarioClasses = cleanText(url.searchParams.get("scenario_class") || url.searchParams.get("scenario_classes") || "")
        .split(",")
        .map((item) => cleanText(item).toLowerCase())
        .filter((item) => item && item !== "all");

      await initDb(env);
      const samples = await getTrainingSamples(env, chatUserId, limit);
      const filteredSamples = requestedScenarioClasses.length
        ? samples.filter((sample) => requestedScenarioClasses.includes(buildTrainingScenarioClass(sample)))
        : samples;
      if (format === "jsonl") {
        const lines = [];
        for (const sample of filteredSamples) {
          if (dataset === "dpo") {
            const records = buildTrainingDpoRecords(sample);
            for (const record of records) {
              lines.push(JSON.stringify(record));
            }
            continue;
          }

          if (dataset === "raw") {
            lines.push(JSON.stringify(sample));
            continue;
          }

          lines.push(JSON.stringify(buildTrainingSftRecord(sample)));
        }
        return new Response(lines.join("\n"), {
          headers: {
            "Content-Type": "application/x-ndjson;charset=UTF-8",
            "Content-Disposition": `attachment; filename="training-${dataset}-${chatUserId}${requestedScenarioClasses.length ? "-" + requestedScenarioClasses.join("-") : ""}.jsonl"`,
          },
        });
      }

      return jsonResponse({
        ok: true,
        chatUserId,
        dataset,
        scenarioClasses: requestedScenarioClasses,
        count: filteredSamples.length,
        samples: filteredSamples,
      });
    }

    if (url.pathname === "/admin/training/feedback" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      if (!cleanText(body.chatUserId || body.chat_user_id || "")) {
        return jsonResponse({ ok: false, error: "Missing chat_user_id" }, 400);
      }

      const result = await recordTrainingFeedback({
        env,
        sampleId: body.sampleId || body.sample_id || null,
        chatUserId: cleanText(body.chatUserId || body.chat_user_id || ""),
        feedbackType: cleanText(body.feedbackType || body.feedback_type || "rating"),
        score: body.score,
        note: body.note || "",
      });

      return jsonResponse({ ok: true, result });
    }

    if (url.pathname === "/admin/training/purge" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const confirm = cleanText(body.confirm || body.confirmation || url.searchParams.get("confirm") || "");
      if (confirm !== "DELETE_TRAINING_DATA") {
        return jsonResponse({ ok: false, error: "Missing or invalid confirm token" }, 400);
      }

      const chatUserId = cleanText(body.chatUserId || body.chat_user_id || "");

      if (chatUserId) {
        await env.DB.prepare(`DELETE FROM training_feedback WHERE chat_user_id = ?;`).bind(chatUserId).run();
        await env.DB.prepare(`DELETE FROM training_samples WHERE chat_user_id = ?;`).bind(chatUserId).run();
      } else {
        await env.DB.prepare(`DELETE FROM training_feedback;`).run();
        await env.DB.prepare(`DELETE FROM training_samples;`).run();
      }

      return jsonResponse({
        ok: true,
        message: chatUserId ? "Training data purged for user" : "Training data purged",
        chatUserId: chatUserId || "all",
      });
    }

    if (url.pathname === "/admin/training/annotate" && request.method === "POST") {
      const auth = requireAdminKey(env, request, url);
      if (!auth.ok) return auth.response;

      await initDb(env);
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const chatUserId = cleanText(body.chatUserId || body.chat_user_id || "");
      const sampleId = Number(body.sampleId || body.sample_id || 0);
      if (!chatUserId || !sampleId) {
        return jsonResponse({ ok: false, error: "Missing sample_id or chat_user_id" }, 400);
      }

      const candidateReplies = Array.isArray(body.candidateReplies || body.candidate_replies)
        ? (body.candidateReplies || body.candidate_replies)
        : null;
      const chosenReplyIndex = body.chosenReplyIndex ?? body.chosen_reply_index ?? null;
      const result = await updateTrainingSampleAnnotation({
        env,
        sampleId,
        chatUserId,
        candidateReplies,
        chosenReplyIndex,
        sampleStage: body.sampleStage || body.sample_stage || "labeled",
        feedbackLabel: body.feedbackLabel || body.feedback_label || "",
        feedbackNote: body.feedbackNote || body.feedback_note || "",
        scenarioClass: body.scenarioClass || body.scenario_class || "",
      });

      return jsonResponse({ ok: true, result });
    }

    if (url.pathname === "/admin/summarize") {
      const key = url.searchParams.get("key") || "";
      if (!env.SUMMARY_ADMIN_KEY || key !== env.SUMMARY_ADMIN_KEY) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      }

      await initDb(env);
      const result = await summarizeActiveCustomers(env);
      return jsonResponse({ ok: true, message: "Summary job finished", result });
    }

    if (url.pathname === "/webhook/salesmartly" && request.method === "POST") {
      await initDb(env);

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      if (body.event_type === "reassign") {
        return jsonResponse({ ok: true, message: "Reassign event received, no reply needed" });
      }

      const customerName = extractCustomerName(body);
      const customerRemark = extractCustomerRemark(body);
      const customerMessage = cleanText(extractCustomerMessage(body));
      const sessionId = extractSessionId(body);
      const chatUserId = extractChatUserId(body);
      const relationshipStage = extractRelationshipStage(body);
      const country = extractCountry(body);
      const salesmartlyMsgId = extractSalesmartlyMsgId(body);
      const projectId = extractProjectId(body);
      const sysUserId = extractSysUserId(body);

      if (!chatUserId) {
        return jsonResponse({ ok: false, message: "No chat_user_id found", received: body });
      }

      if (!customerMessage) {
        return jsonResponse({ ok: true, message: "No text customer message found", received: body });
      }

      if (!isTextMessage(body)) {
        return jsonResponse({ ok: true, message: "Non-text message ignored" });
      }

      const isDuplicate = await isDuplicateCustomerMessage({
        env,
        chatUserId,
        content: customerMessage,
        salesmartlyMsgId,
        duplicateSeconds: DUPLICATE_SECONDS,
      });

      if (isDuplicate) {
        return jsonResponse({ ok: true, message: "Duplicate customer message ignored", chatUserId, customerMessage });
      }

      await upsertCustomer({
        env,
        chatUserId,
        name: customerName,
        country,
        remark: customerRemark,
        relationshipStage,
      });

      await saveMessage({
        env,
        chatUserId,
        sessionId,
        role: "customer",
        status: "received",
        content: customerMessage,
        salesmartlyMsgId,
      });

      ctx.waitUntil(
        (async () => {
          try {
            const customer = await getCustomer(env, chatUserId);
            const recentMessages = await getRecentMessages(env, chatUserId, RECENT_MESSAGES_LIMIT);
            const memoryBundle = await loadMemoryBundle(env, {
              chatUserId,
              customer,
              relationshipStage: customer?.relationship_stage || relationshipStage,
              customerMessage,
              embeddingFn: (text) => getTextEmbedding(env, text),
            });
            const dialogueStrategy = buildDialogueStrategy({
              customerMessage,
              customerSummary: memoryBundle.summary,
              memoryFacts: memoryBundle.facts,
              vectorMemories: memoryBundle.vectorMemories,
              relationshipState: memoryBundle.relationshipState,
              recentMessages,
            });
            const contextSnapshot = buildConversationContext({
              customerName,
              customerRemark,
              customerMessage,
              customerSummary: memoryBundle.summary,
              memoryFacts: memoryBundle.facts,
              vectorMemories: memoryBundle.vectorMemories,
              relationshipState: memoryBundle.relationshipState,
              recentMessages,
              formatRecentConversation,
              formatMemoryFacts,
              formatVectorMemories,
              formatRelationshipState,
            });
            const aiReply = await generateAIReply({
              env,
              customerName,
              customerRemark,
              customerMessage,
              relationshipStage: memoryBundle.relationshipState.stage,
              customerSummary: memoryBundle.summary,
              memoryFacts: memoryBundle.facts,
              vectorMemories: memoryBundle.vectorMemories,
              relationshipState: memoryBundle.relationshipState,
              recentMessages,
              formatRecentConversation,
              formatMemoryFacts,
              formatVectorMemories,
              formatRelationshipState,
            });

            await saveTrainingSample({
              env,
              chatUserId,
              sessionId,
              sourceMessageId: salesmartlyMsgId,
              promptVersion: "v1",
              sampleStage: memoryBundle.relationshipState.stage,
              sampleIntent: dialogueStrategy.intent,
              customerInput: customerMessage,
              assistantOutput: aiReply,
              candidateRepliesJson: [],
              chosenReplyIndex: -1,
              questionBudget: dialogueStrategy.questionBudget || 0,
              openingStyle: dialogueStrategy.openingStyle || "",
              closingStyle: dialogueStrategy.closingStyle || "",
              strategySnapshot: dialogueStrategy,
              contextSnapshot,
            });

            await writeMemoryTurn({
              env,
              chatUserId,
              customerName,
              customerRemark,
              customerMessage,
              aiReply,
              customer,
              relationshipStage: memoryBundle.relationshipState.stage,
              relationshipState: memoryBundle.relationshipState,
              memoryFacts: memoryBundle.facts,
              vectorMemories: memoryBundle.vectorMemories,
              recentMessages,
              salesmartlyMsgId,
              generateMemoryWritePlan,
              formatMemoryFacts,
              formatVectorMemories,
              formatRelationshipState,
              getActiveMemoryFacts: (env2, id, limit) => getActiveMemoryFacts(env2, id, limit),
              updateCustomerSummary: async ({ env: env2, chatUserId: id, summary, importantFacts, relationshipStage: stage }) => {
                await env2.DB.prepare(`
                  UPDATE customers
                  SET
                    summary = COALESCE(NULLIF(?, ''), summary),
                    important_facts = ?,
                    relationship_stage = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE chat_user_id = ?;
                `)
                  .bind(summary, importantFacts, stage, id)
                  .run();
              },
              createConversationSummary: async ({ env: env2, chatUserId: id, startMessageId, endMessageId, summaryText }) => {
                await env2.DB.prepare(`
                  INSERT INTO conversation_summaries (
                    chat_user_id,
                    start_message_id,
                    end_message_id,
                    summary_text,
                    created_at
                  )
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP);
                `)
                  .bind(id, startMessageId, endMessageId, summaryText)
                  .run();
              },
              embeddingFn: (text) => getTextEmbedding(env, text),
            });

            if (env.AUTO_REPLY === "true") {
              const delaySeconds = getHumanDelaySeconds(customerMessage);
              await sleep(delaySeconds * 1000);
              const salesmartlySendResult = await sendToSaleSmartly({
                env,
                body,
                sessionId,
                chatUserId,
                reply: aiReply,
              });

              await saveMessage({
                env,
                chatUserId,
                sessionId,
                role: "assistant",
                status: salesmartlySendResult.ok ? "sent" : "failed",
                content: aiReply,
                salesmartlyMsgId: "",
              });
            } else {
              await saveMessage({
                env,
                chatUserId,
                sessionId,
                role: "assistant",
                status: "generated",
                content: aiReply,
                salesmartlyMsgId: "",
              });
            }
          } catch (err) {
            console.log("Webhook background task exception:", err.message);
          }
        })()
      );

      return jsonResponse({
        ok: true,
        message: "Accepted",
        customerName,
        customerRemark,
        customerMessage,
        sessionId,
        chatUserId,
        relationshipStage,
        projectId,
        sysUserId,
        salesmartlyMsgId,
        autoReply: env.AUTO_REPLY === "true",
      });
    }

    return jsonResponse({ ok: false, error: "Not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
    await initDb(env);
    const result = await summarizeActiveCustomers(env);
    console.log("Scheduled summary result:", JSON.stringify(result));
      })()
    );
  },
};

function formatRecentConversation(messages) {
  if (!messages || messages.length === 0) {
    return "No recent conversation yet.";
  }
  return messages
    .map((m) => (m.role === "customer" ? `Customer: ${m.content}` : m.role === "assistant" ? `Mia: ${m.content}` : `${m.role}: ${m.content}`))
    .join("\n");
}

function getHumanDelaySeconds(message) {
  const text = cleanText(message);
  const length = text.length;
  if (length <= 25) return randomInt(AUTO_REPLY_SHORT_MIN_SECONDS, AUTO_REPLY_SHORT_MAX_SECONDS);
  if (length <= 120) return randomInt(AUTO_REPLY_NORMAL_MIN_SECONDS, AUTO_REPLY_NORMAL_MAX_SECONDS);
  return randomInt(AUTO_REPLY_LONG_MIN_SECONDS, AUTO_REPLY_LONG_MAX_SECONDS);
}

async function summarizeActiveCustomers(env) {
  const customersResult = await env.DB.prepare(`
    SELECT
      c.chat_user_id,
      c.name,
      c.country,
      c.remark,
      c.relationship_stage,
      c.summary,
      c.last_summarized_message_id,
      COALESCE(MAX(m.id), 0) AS latest_message_id
    FROM customers c
    JOIN messages m ON m.chat_user_id = c.chat_user_id
    GROUP BY c.chat_user_id
    HAVING latest_message_id > COALESCE(c.last_summarized_message_id, 0)
    ORDER BY c.last_active_at DESC
    LIMIT ?;
  `)
    .bind(50)
    .all();

  const customers = customersResult.results || [];
  const details = [];

  for (const customer of customers) {
    try {
      const lastSummarizedId = Number(customer.last_summarized_message_id || 0);
      const newMessagesResult = await env.DB.prepare(`
        SELECT role, content, created_at
        FROM messages
        WHERE chat_user_id = ?
          AND id > ?
        ORDER BY id ASC
        LIMIT 50;
      `)
        .bind(customer.chat_user_id, lastSummarizedId)
        .all();
      const newMessages = (newMessagesResult.results || []).map((message) => ({
        role: message.role || "",
        content: message.content || "",
        createdAt: message.created_at || "",
      }));

      const result = await generateCustomerSummary({
        env,
        customer,
        oldSummary: customer.summary || "",
        newMessages,
      });

      const latestMessageId = Number(customer.latest_message_id || lastSummarizedId || 0);
      await env.DB.prepare(`
        UPDATE customers
        SET
          summary = COALESCE(NULLIF(?, ''), summary),
          summary_updated_at = CURRENT_TIMESTAMP,
          last_summarized_message_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE chat_user_id = ?;
      `)
        .bind(
          result || customer.summary || "",
          String(latestMessageId || lastSummarizedId || 0),
          customer.chat_user_id
        )
        .run();

      details.push({ chatUserId: customer.chat_user_id, ok: true, summary: result });
    } catch (err) {
      details.push({ chatUserId: customer.chat_user_id, ok: false, error: err.message });
    }
  }

  return { processed: details.length, details };
}

async function sendToSaleSmartly({ env, body, sessionId, chatUserId, reply }) {
  if (!env.SALESMARTLY_ACCESS_TOKEN) {
    return { ok: false, error: "Missing SALESMARTLY_ACCESS_TOKEN" };
  }

  const replyUrl = env.SALESMARTLY_REPLY_URL || "https://msg.salesmartly.com/ai-employee/send-message";
  const projectId = extractProjectId(body);
  const sysUserId = extractSysUserId(body);

  if (!projectId || !sysUserId || !chatUserId) {
    return { ok: false, error: "Missing required SaleSmartly fields", projectId, sysUserId, chatUserId };
  }

  const requestId = `mia_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    sys_user_id: Number(sysUserId),
    project_id: Number(projectId),
    chat_user_id: chatUserId,
    request_id: requestId,
    msg_list: [{ msg_type: "text", msg: { text: reply } }],
  };

  const response = await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SALESMARTLY_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let data = responseText;
  try {
    data = JSON.parse(responseText);
  } catch {}

  if (!response.ok) {
    return { ok: false, status: response.status, error: responseText, sentPayload: payload };
  }

  return { ok: true, status: response.status, data, sentPayload: payload };
}

function isTextMessage(body) {
  const firstMsg = Array.isArray(body.msg_list)
    ? body.msg_list[0]
    : Array.isArray(body.data?.msg_list)
      ? body.data.msg_list[0]
      : null;

  if (firstMsg?.msg_type) return String(firstMsg.msg_type).toLowerCase() === "text";
  if (firstMsg?.type) return String(firstMsg.type).toLowerCase() === "text";

  const type = String(body.message_type || body.msg_type || body.type || body.data?.message_type || body.data?.msg_type || body.data?.type || "").toLowerCase();
  if (!type) return true;
  return !["image", "photo", "audio", "voice", "video", "file", "document", "sticker", "location"].includes(type);
}

function extractCustomerName(body) {
  return body.chat_user_info?.name || body.chat_user_info?.chatUserName || body.chat_user_info?.nickname || body.chat_user_info?.chatUserId || body.customer_name || body.name || body.sender_name || body.data?.customer_name || body.data?.name || body.data?.sender_name || "";
}
function extractCustomerRemark(body) { return body.chat_user_info?.remark || body.remark || body.customer_remark || body.data?.remark || body.data?.customer_remark || ""; }
function extractCountry(body) { return body.chat_user_info?.country || body.country || body.data?.country || ""; }
function extractCustomerMessage(body) {
  if (Array.isArray(body.msg_list)) {
    for (const item of body.msg_list) {
      const msgType = String(item?.msg_type || item?.type || "").toLowerCase();
      if (msgType && msgType !== "text") continue;
      const text = item?.msg?.text || item?.msg?.content || item?.msg?.message || item?.msg?.body || item?.text || item?.content || item?.message || item?.body || item?.payload?.text || item?.payload?.content;
      if (text) return text;
    }
  }
  if (Array.isArray(body.data?.msg_list)) {
    for (const item of body.data.msg_list) {
      const msgType = String(item?.msg_type || item?.type || "").toLowerCase();
      if (msgType && msgType !== "text") continue;
      const text = item?.msg?.text || item?.msg?.content || item?.msg?.message || item?.msg?.body || item?.text || item?.content || item?.message || item?.body || item?.payload?.text || item?.payload?.content;
      if (text) return text;
    }
  }
  return body.message || body.content || body.text || body.msg_content || body.message_content || body.body || body.msg?.content || body.msg?.text || body.msg?.message || body.msg?.message_content || body.data?.message || body.data?.content || body.data?.text || body.data?.msg_content || body.data?.message_content || body.data?.body || "";
}
function extractSessionId(body) { return body.session_id || body.sessionId || body.chat_user_info?.sessionId || body.chat_user_info?.session_id || body.data?.session_id || body.data?.sessionId || ""; }
function extractChatUserId(body) { return body.chat_user_id || body.chatUserId || body.chat_user_info?.chatUserId || body.chat_user_info?.chat_user_id || body.data?.chat_user_id || body.data?.chatUserId || ""; }
function extractRelationshipStage(body) { return body.relationship_stage || body.relationshipStage || body.chat_user_info?.relationship_stage || body.chat_user_info?.relationshipStage || body.data?.relationship_stage || body.data?.relationshipStage || ""; }
function extractSalesmartlyMsgId(body) {
  const firstMsg = Array.isArray(body.msg_list) ? body.msg_list[0] : Array.isArray(body.data?.msg_list) ? body.data.msg_list[0] : null;
  return firstMsg?.sequence_id || firstMsg?.msg_id || firstMsg?.id || body.sequence_id || body.message_id || body.msg_id || body.id || body.data?.sequence_id || body.data?.message_id || body.data?.msg_id || body.data?.id || body.msg?.sequence_id || body.msg?.message_id || body.msg?.msg_id || body.msg?.id || "";
}
function extractProjectId(body) { return body.project_id || body.projectId || body.chat_user_info?.projectId || body.chat_user_info?.project_id || body.data?.project_id || body.data?.projectId || 0; }
function extractSysUserId(body) { return body.current_assign_sys_user_id || body.currentAssignSysUserId || body.sys_user_id || body.sysUserId || body.chat_user_info?.sysUserId || body.chat_user_info?.sys_user_id || body.chat_user_info?.sessionSysUserId || body.chat_user_info?.session_sys_user_id || body.data?.current_assign_sys_user_id || body.data?.currentAssignSysUserId || body.data?.sys_user_id || body.data?.sysUserId || 0; }
