import {
  cleanText,
  clamp,
  MEMORY_FACT_LIMIT,
  normalizeFactKey,
  normalizeStage,
} from "./common.js";
import { getRelevantVectorMemoriesByTexts } from "./vectorize.js";

const REFERENCE_SOURCE_TARGETS = [
  { source: "empathetic", limit: 6 },
  { source: "flirtflip", limit: 3 },
  { source: "real", limit: 1 },
];

export async function initDb(env) {
  if (!env.DB) {
    throw new Error("Missing D1 binding: DB");
  }

  async function ensureColumn(table, column, definition) {
    const info = await env.DB.prepare(`PRAGMA table_info(${table});`).all();
    const columns = new Set((info.results || []).map((row) => row.name));
    if (!columns.has(column)) {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`).run();
    }
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_user_id TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      country TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      relationship_stage TEXT DEFAULT 'new',
      summary TEXT DEFAULT '',
      important_facts TEXT DEFAULT '',
      last_active_at TEXT DEFAULT CURRENT_TIMESTAMP,
      summary_updated_at TEXT DEFAULT '',
      last_summarized_message_id TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_user_id TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      role TEXT NOT NULL,
      status TEXT DEFAULT '',
      content TEXT NOT NULL,
      salesmartly_msg_id TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_user_id
    ON messages(chat_user_id, id);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_session
    ON messages(session_id);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_duplicate
    ON messages(chat_user_id, role, content, created_at);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_msg_id
    ON messages(salesmartly_msg_id);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_customers_active
    ON customers(last_active_at);
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS memory_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_user_id TEXT NOT NULL,
      fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      status TEXT DEFAULT 'active',
      source_message_id TEXT DEFAULT '',
      source_message_role TEXT DEFAULT 'customer',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_memory_facts_user_key
    ON memory_facts(chat_user_id, fact_key);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_memory_facts_user_status
    ON memory_facts(chat_user_id, status);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_memory_facts_user_created
    ON memory_facts(chat_user_id, created_at);
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS relationship_state (
      chat_user_id TEXT PRIMARY KEY,
      stage TEXT DEFAULT 'new',
      trust REAL DEFAULT 0.25,
      intimacy REAL DEFAULT 0.15,
      confidence REAL DEFAULT 0.5,
      last_source_message_id TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_user_id TEXT NOT NULL,
      start_message_id TEXT DEFAULT '',
      end_message_id TEXT DEFAULT '',
      summary_text TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS flirtflip_samples (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL DEFAULT 'sft',
      dataset_kind TEXT NOT NULL DEFAULT 'seed',
      source_kind TEXT DEFAULT '',
      sample_stage TEXT DEFAULT '',
      sample_intent TEXT DEFAULT '',
      scenario TEXT DEFAULT '',
      style_tags_json TEXT DEFAULT '[]',
      public_sources_json TEXT DEFAULT '[]',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_flirtflip_dataset_kind
    ON flirtflip_samples(dataset_kind, record_type, id);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_flirtflip_source_kind
    ON flirtflip_samples(source_kind, dataset_kind);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_flirtflip_created_at
    ON flirtflip_samples(created_at);
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS empathetic_dialogues_samples (
      id TEXT PRIMARY KEY,
      split TEXT NOT NULL DEFAULT 'train',
      source_kind TEXT DEFAULT 'empathetic_dialogues',
      conv_id TEXT DEFAULT '',
      utterance_idx INTEGER DEFAULT 0,
      context TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      speaker_idx INTEGER DEFAULT 0,
      utterance TEXT DEFAULT '',
      selfeval TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_empathetic_dialogues_split
    ON empathetic_dialogues_samples(split, id);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_empathetic_dialogues_source_kind
    ON empathetic_dialogues_samples(source_kind, split);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_empathetic_dialogues_created_at
    ON empathetic_dialogues_samples(created_at);
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS training_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_user_id TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      source_message_id TEXT DEFAULT '',
      prompt_version TEXT DEFAULT 'v1',
      sample_stage TEXT DEFAULT 'new',
      sample_intent TEXT DEFAULT '',
      customer_input TEXT NOT NULL,
      assistant_output TEXT NOT NULL,
      candidate_replies_json TEXT DEFAULT '[]',
      chosen_reply_index INTEGER DEFAULT -1,
      question_budget INTEGER DEFAULT 0,
      opening_style TEXT DEFAULT '',
      closing_style TEXT DEFAULT '',
      strategy_snapshot_json TEXT DEFAULT '{}',
      context_snapshot_json TEXT DEFAULT '{}',
      feedback_score REAL DEFAULT NULL,
      feedback_label TEXT DEFAULT '',
      feedback_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await ensureColumn("training_samples", "scenario_class", "TEXT DEFAULT ''");

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_training_samples_user_created
    ON training_samples(chat_user_id, created_at);
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_training_samples_user_stage
    ON training_samples(chat_user_id, sample_stage, sample_intent);
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS training_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER DEFAULT NULL,
      chat_user_id TEXT NOT NULL,
      feedback_type TEXT DEFAULT 'rating',
      score REAL DEFAULT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_training_feedback_user_created
    ON training_feedback(chat_user_id, created_at);
  `).run();

}

export async function upsertCustomer({
  env,
  chatUserId,
  name,
  country,
  remark,
  relationshipStage,
}) {
  const existing = await env.DB.prepare(`
    SELECT chat_user_id
    FROM customers
    WHERE chat_user_id = ?
    LIMIT 1;
  `)
    .bind(chatUserId)
    .first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE customers
      SET
        name = COALESCE(NULLIF(?, ''), name),
        country = COALESCE(NULLIF(?, ''), country),
        remark = COALESCE(NULLIF(?, ''), remark),
        relationship_stage = COALESCE(NULLIF(?, ''), relationship_stage),
        last_active_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE chat_user_id = ?;
    `)
      .bind(name || "", country || "", remark || "", relationshipStage || "", chatUserId)
      .run();
  } else {
    await env.DB.prepare(`
      INSERT INTO customers (
        chat_user_id,
        name,
        country,
        remark,
        relationship_stage,
        last_active_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `)
      .bind(chatUserId, name || "", country || "", remark || "", relationshipStage || "new")
      .run();
  }
}

export async function getCustomer(env, chatUserId) {
  return await env.DB.prepare(`
    SELECT *
    FROM customers
    WHERE chat_user_id = ?
    LIMIT 1;
  `)
    .bind(chatUserId)
    .first();
}

export async function saveMessage({
  env,
  chatUserId,
  sessionId,
  role,
  status,
  content,
  salesmartlyMsgId,
}) {
  const text = cleanText(content);
  if (!text) return null;

  return await env.DB.prepare(`
    INSERT INTO messages (
      chat_user_id,
      session_id,
      role,
      status,
      content,
      salesmartly_msg_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
  `)
    .bind(chatUserId, sessionId || "", role, status, text, salesmartlyMsgId ? String(salesmartlyMsgId) : "")
    .run();
}

export async function isDuplicateCustomerMessage({
  env,
  chatUserId,
  content,
  salesmartlyMsgId,
  duplicateSeconds = 10,
}) {
  const text = cleanText(content);
  if (!text) return true;

  if (salesmartlyMsgId) {
    const byMsgId = await env.DB.prepare(`
      SELECT id
      FROM messages
      WHERE chat_user_id = ?
        AND role = 'customer'
        AND salesmartly_msg_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId, String(salesmartlyMsgId))
      .first();

    if (byMsgId) return true;
  }

  const byContent = await env.DB.prepare(`
    SELECT id
    FROM messages
    WHERE chat_user_id = ?
      AND role = 'customer'
      AND content = ?
      AND datetime(created_at) >= datetime('now', ?)
    ORDER BY id DESC
    LIMIT 1;
  `)
    .bind(chatUserId, text, `-${duplicateSeconds} seconds`)
    .first();

  return !!byContent;
}

export async function getRecentMessages(env, chatUserId, limit = 20) {
  const result = await env.DB.prepare(`
    SELECT role, status, content, created_at
    FROM messages
    WHERE chat_user_id = ?
    ORDER BY id DESC
    LIMIT ?;
  `)
    .bind(chatUserId, limit)
    .all();

  return (result.results || []).reverse();
}

export async function getLatestConversationSummary(env, chatUserId) {
  const row = await env.DB.prepare(`
    SELECT summary_text
    FROM conversation_summaries
    WHERE chat_user_id = ?
    ORDER BY id DESC
    LIMIT 1;
  `)
    .bind(chatUserId)
    .first();

  return cleanText(row?.summary_text || "");
}

export async function getActiveMemoryFacts(env, chatUserId, limit = MEMORY_FACT_LIMIT) {
  const result = await env.DB.prepare(`
    SELECT fact_key, fact_value, confidence, updated_at
    FROM memory_facts
    WHERE chat_user_id = ?
      AND status = 'active'
    ORDER BY confidence DESC, updated_at DESC, id DESC
    LIMIT ?;
  `)
    .bind(chatUserId, limit)
    .all();

  return (result.results || []).map((row) => ({
    key: row.fact_key,
    value: row.fact_value,
    confidence: Number(row.confidence || 0),
    updatedAt: row.updated_at || "",
  }));
}

export async function getMemoryFactsHistory(env, chatUserId, limit = 30) {
  const result = await env.DB.prepare(`
    SELECT id, fact_key, fact_value, confidence, status, source_message_id, source_message_role, created_at, updated_at
    FROM memory_facts
    WHERE chat_user_id = ?
    ORDER BY id DESC
    LIMIT ?;
  `)
    .bind(chatUserId, limit)
    .all();

  return (result.results || []).map((row) => ({
    id: Number(row.id || 0),
    key: row.fact_key,
    value: row.fact_value,
    confidence: Number(row.confidence || 0),
    status: row.status || "active",
    sourceMessageId: String(row.source_message_id || ""),
    sourceMessageRole: row.source_message_role || "customer",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  }));
}

export async function getConversationSummaries(env, chatUserId, limit = 10) {
  const result = await env.DB.prepare(`
    SELECT id, start_message_id, end_message_id, summary_text, created_at
    FROM conversation_summaries
    WHERE chat_user_id = ?
    ORDER BY id DESC
    LIMIT ?;
  `)
    .bind(chatUserId, limit)
    .all();

  return (result.results || []).map((row) => ({
    id: Number(row.id || 0),
    startMessageId: String(row.start_message_id || ""),
    endMessageId: String(row.end_message_id || ""),
    summaryText: cleanText(row.summary_text || ""),
    createdAt: row.created_at || "",
  }));
}

function normalizeFlirtFlipDatasetKind(value = "") {
  const text = cleanText(value).toLowerCase();
  if (["seed", "final"].includes(text)) return text;
  return "";
}

function normalizeFlirtFlipRecord(raw = {}, fallbackDatasetKind = "") {
  const metadata = raw?.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const recordType = cleanText(raw?.type || "").toLowerCase();
  if (!["sft", "dpo"].includes(recordType)) return null;

  const id = cleanText(raw?.id || "");
  if (!id) return null;

  const datasetKind = normalizeFlirtFlipDatasetKind(fallbackDatasetKind || metadata.clean_stage || "") || "seed";
  const styleTags = Array.isArray(metadata.style_tags) ? metadata.style_tags.map((item) => cleanText(item)).filter(Boolean) : [];
  const publicSources = Array.isArray(metadata.public_sources) ? metadata.public_sources.map((item) => cleanText(item)).filter(Boolean) : [];

  return {
    id,
    recordType,
    datasetKind,
    sourceKind: cleanText(metadata.source_kind || ""),
    sampleStage: cleanText(metadata.sample_stage || ""),
    sampleIntent: cleanText(metadata.sample_intent || ""),
    scenario: cleanText(metadata.scenario || ""),
    styleTagsJson: JSON.stringify(styleTags),
    publicSourcesJson: JSON.stringify(publicSources),
    payloadJson: JSON.stringify(raw),
  };
}

function buildFlirtFlipPreview(payload = {}) {
  if (payload.type === "sft") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const userMessage = messages.find((item) => item?.role === "user")?.content || "";
    const assistantMessage = messages.find((item) => item?.role === "assistant")?.content || "";
    return {
      user: cleanText(userMessage),
      assistant: cleanText(assistantMessage),
      prompt: cleanText(userMessage),
      chosen: cleanText(assistantMessage),
      rejected: "",
    };
  }

  return {
    user: cleanText(payload.prompt || ""),
    assistant: cleanText(payload.chosen || ""),
    prompt: cleanText(payload.prompt || ""),
    chosen: cleanText(payload.chosen || ""),
    rejected: cleanText(payload.rejected || ""),
  };
}

export async function upsertFlirtFlipSamples(env, records = [], fallbackDatasetKind = "", replace = false) {
  if (!Array.isArray(records) || !records.length) {
    return { inserted: 0, replaced: false };
  }

  const normalized = records.map((record) => normalizeFlirtFlipRecord(record, fallbackDatasetKind)).filter(Boolean);
  if (!normalized.length) {
    return { inserted: 0, replaced: false };
  }

  if (replace) {
    await env.DB.prepare(`DELETE FROM flirtflip_samples;`).run();
  }

  const batchSize = 50;
  let inserted = 0;
  for (let index = 0; index < normalized.length; index += batchSize) {
    const chunk = normalized.slice(index, index + batchSize);
    const statements = chunk.map((item) =>
      env.DB.prepare(`
        INSERT INTO flirtflip_samples (
          id,
          record_type,
          dataset_kind,
          source_kind,
          sample_stage,
          sample_intent,
          scenario,
          style_tags_json,
          public_sources_json,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          record_type = excluded.record_type,
          dataset_kind = excluded.dataset_kind,
          source_kind = excluded.source_kind,
          sample_stage = excluded.sample_stage,
          sample_intent = excluded.sample_intent,
          scenario = excluded.scenario,
          style_tags_json = excluded.style_tags_json,
          public_sources_json = excluded.public_sources_json,
          payload_json = excluded.payload_json,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(
        item.id,
        item.recordType,
        item.datasetKind,
        item.sourceKind,
        item.sampleStage,
        item.sampleIntent,
        item.scenario,
        item.styleTagsJson,
        item.publicSourcesJson,
        item.payloadJson
      )
    );
    await env.DB.batch(statements);
    inserted += chunk.length;
  }

  return { inserted, replaced: !!replace };
}

export async function getFlirtFlipStats(env) {
  const [totals, datasetKinds, recordTypes, latest] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,
        COUNT(DISTINCT dataset_kind) AS dataset_kind_count,
        COUNT(DISTINCT record_type) AS record_type_count
      FROM flirtflip_samples;
    `)
      .first(),
    env.DB.prepare(`
      SELECT dataset_kind, COUNT(*) AS count
      FROM flirtflip_samples
      GROUP BY dataset_kind
      ORDER BY dataset_kind ASC;
    `)
      .all(),
    env.DB.prepare(`
      SELECT record_type, COUNT(*) AS count
      FROM flirtflip_samples
      GROUP BY record_type
      ORDER BY record_type ASC;
    `)
      .all(),
    env.DB.prepare(`
      SELECT id, record_type, dataset_kind, source_kind, sample_stage, sample_intent, scenario, payload_json, created_at, updated_at
      FROM flirtflip_samples
      ORDER BY updated_at DESC, id DESC
      LIMIT 1;
    `)
      .first(),
  ]);

  return {
    total: Number(totals?.total_count || 0),
    datasetKinds: (datasetKinds?.results || []).map((item) => ({
      datasetKind: item.dataset_kind || "",
      count: Number(item.count || 0),
    })),
    recordTypes: (recordTypes?.results || []).map((item) => ({
      recordType: item.record_type || "",
      count: Number(item.count || 0),
    })),
    latest: latest
      ? {
          id: latest.id || "",
          recordType: latest.record_type || "",
          datasetKind: latest.dataset_kind || "",
          sourceKind: latest.source_kind || "",
          sampleStage: latest.sample_stage || "",
          sampleIntent: latest.sample_intent || "",
          scenario: latest.scenario || "",
          createdAt: latest.created_at || "",
          updatedAt: latest.updated_at || "",
          preview: buildFlirtFlipPreview(safeJsonObject(latest.payload_json)),
        }
      : null,
  };
}

export async function getFlirtFlipSamples(env, limit = 20, filters = {}) {
  const normalizedDatasetKind = cleanText(filters.datasetKind || filters.dataset_kind || "").toLowerCase();
  const normalizedRecordType = cleanText(filters.recordType || filters.record_type || "").toLowerCase();
  const normalizedSourceKind = cleanText(filters.sourceKind || filters.source_kind || "").toLowerCase();

  const conditions = [];
  const params = [];
  if (normalizedDatasetKind && normalizedDatasetKind !== "all") {
    conditions.push("dataset_kind = ?");
    params.push(normalizedDatasetKind);
  }
  if (normalizedRecordType && normalizedRecordType !== "all") {
    conditions.push("record_type = ?");
    params.push(normalizedRecordType);
  }
  if (normalizedSourceKind) {
    conditions.push("source_kind LIKE ?");
    params.push(`%${normalizedSourceKind}%`);
  }

  params.push(limit);

  const result = await env.DB.prepare(`
    SELECT *
    FROM flirtflip_samples
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?;
  `)
    .bind(...params)
    .all();

  return (result.results || []).map((row) => {
    const payload = safeJsonObject(row.payload_json);
    const preview = buildFlirtFlipPreview(payload);
    return {
      id: row.id || "",
      recordType: row.record_type || "",
      datasetKind: row.dataset_kind || "",
      sourceKind: row.source_kind || "",
      sampleStage: row.sample_stage || "",
      sampleIntent: row.sample_intent || "",
      scenario: row.scenario || "",
      styleTags: safeJsonArray(row.style_tags_json),
      publicSources: safeJsonArray(row.public_sources_json),
      preview,
      payload,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  });
}

function normalizeEmpatheticDialogueSplit(value = "") {
  const text = cleanText(value).toLowerCase();
  if (["train", "validation", "test"].includes(text)) return text;
  return "train";
}

function normalizeEmpatheticDialogueRecord(raw = {}, fallbackSplit = "") {
  const metadata = raw?.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata) ? raw.metadata : {};
  const recordType = cleanText(raw?.type || "").toLowerCase();
  if (recordType && recordType !== "sft") return null;

  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  const userMessage = messages.find((item) => item?.role === "user")?.content || "";
  const assistantMessage = messages.find((item) => item?.role === "assistant")?.content || "";
  const id = cleanText(raw?.id || "");
  if (!id || !userMessage || !assistantMessage) return null;

  const split = normalizeEmpatheticDialogueSplit(fallbackSplit || metadata.split || "");
  return {
    id,
    split,
    sourceKind: cleanText(metadata.source_kind || "empathetic_dialogues") || "empathetic_dialogues",
    convId: cleanText(metadata.conversation_id || metadata.conv_id || ""),
    utteranceIdx: Number.isFinite(Number(metadata.utterance_idx)) ? Number(metadata.utterance_idx) : 0,
    context: cleanText(metadata.context || ""),
    prompt: cleanText(userMessage),
    speakerIdx: Number.isFinite(Number(metadata.speaker_idx)) ? Number(metadata.speaker_idx) : 0,
    utterance: cleanText(assistantMessage),
    selfeval: cleanText(metadata.selfeval || ""),
    tags: cleanText(metadata.tags || ""),
    payloadJson: JSON.stringify(raw),
  };
}

function buildEmpatheticDialoguePreview(payload = {}) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const userMessage = messages.find((item) => item?.role === "user")?.content || "";
  const assistantMessage = messages.find((item) => item?.role === "assistant")?.content || "";
  return {
    user: cleanText(userMessage),
    assistant: cleanText(assistantMessage),
    prompt: cleanText(userMessage),
    chosen: cleanText(assistantMessage),
    rejected: "",
  };
}

export async function upsertEmpatheticDialogueSamples(env, records = [], fallbackSplit = "", replace = false) {
  if (!Array.isArray(records) || !records.length) {
    return { inserted: 0, replaced: false };
  }

  const normalized = records.map((record) => normalizeEmpatheticDialogueRecord(record, fallbackSplit)).filter(Boolean);
  if (!normalized.length) {
    return { inserted: 0, replaced: false };
  }

  if (replace) {
    await env.DB.prepare(`DELETE FROM empathetic_dialogues_samples;`).run();
  }

  const batchSize = 50;
  let inserted = 0;
  for (let index = 0; index < normalized.length; index += batchSize) {
    const chunk = normalized.slice(index, index + batchSize);
    const statements = chunk.map((item) =>
      env.DB.prepare(`
        INSERT INTO empathetic_dialogues_samples (
          id,
          split,
          source_kind,
          conv_id,
          utterance_idx,
          context,
          prompt,
          speaker_idx,
          utterance,
          selfeval,
          tags,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          split = excluded.split,
          source_kind = excluded.source_kind,
          conv_id = excluded.conv_id,
          utterance_idx = excluded.utterance_idx,
          context = excluded.context,
          prompt = excluded.prompt,
          speaker_idx = excluded.speaker_idx,
          utterance = excluded.utterance,
          selfeval = excluded.selfeval,
          tags = excluded.tags,
          payload_json = excluded.payload_json,
          updated_at = CURRENT_TIMESTAMP;
      `).bind(
        item.id,
        item.split,
        item.sourceKind,
        item.convId,
        item.utteranceIdx,
        item.context,
        item.prompt,
        item.speakerIdx,
        item.utterance,
        item.selfeval,
        item.tags,
        item.payloadJson
      )
    );
    await env.DB.batch(statements);
    inserted += chunk.length;
  }

  return { inserted, replaced: !!replace };
}

export async function getEmpatheticDialogueStats(env) {
  const [totals, splitCounts, latest] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS total_count
      FROM empathetic_dialogues_samples;
    `)
      .first(),
    env.DB.prepare(`
      SELECT split, COUNT(*) AS count
      FROM empathetic_dialogues_samples
      GROUP BY split
      ORDER BY split ASC;
    `)
      .all(),
    env.DB.prepare(`
      SELECT id, split, source_kind, conv_id, utterance_idx, context, prompt, speaker_idx, utterance, selfeval, tags, payload_json, created_at, updated_at
      FROM empathetic_dialogues_samples
      ORDER BY updated_at DESC, id DESC
      LIMIT 1;
    `)
      .first(),
  ]);

  return {
    total: Number(totals?.total_count || 0),
    splitCounts: (splitCounts?.results || []).map((item) => ({
      split: item.split || "",
      count: Number(item.count || 0),
    })),
    latest: latest
      ? {
          id: latest.id || "",
          split: latest.split || "",
          sourceKind: latest.source_kind || "",
          convId: latest.conv_id || "",
          utteranceIdx: Number(latest.utterance_idx || 0),
          context: latest.context || "",
          prompt: latest.prompt || "",
          speakerIdx: Number(latest.speaker_idx || 0),
          utterance: latest.utterance || "",
          selfeval: latest.selfeval || "",
          tags: latest.tags || "",
          createdAt: latest.created_at || "",
          updatedAt: latest.updated_at || "",
          preview: buildEmpatheticDialoguePreview(safeJsonObject(latest.payload_json)),
        }
      : null,
  };
}

export async function getEmpatheticDialogueSamples(env, limit = 20, filters = {}) {
  const normalizedSplit = cleanText(filters.split || filters.datasetSplit || "").toLowerCase();
  const normalizedContext = cleanText(filters.context || "").toLowerCase();

  const conditions = [];
  const params = [];
  if (normalizedSplit && normalizedSplit !== "all") {
    conditions.push("split = ?");
    params.push(normalizedSplit);
  }
  if (normalizedContext) {
    conditions.push("context LIKE ?");
    params.push(`%${normalizedContext}%`);
  }

  params.push(limit);

  const result = await env.DB.prepare(`
    SELECT *
    FROM empathetic_dialogues_samples
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?;
  `)
    .bind(...params)
    .all();

  return (result.results || []).map((row) => {
    const payload = safeJsonObject(row.payload_json);
    const preview = buildEmpatheticDialoguePreview(payload);
    return {
      id: row.id || "",
      split: row.split || "",
      sourceKind: row.source_kind || "",
      convId: row.conv_id || "",
      utteranceIdx: Number(row.utterance_idx || 0),
      context: row.context || "",
      prompt: row.prompt || "",
      speakerIdx: Number(row.speaker_idx || 0),
      utterance: row.utterance || "",
      selfeval: row.selfeval || "",
      tags: row.tags || "",
      preview,
      payload,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    };
  });
}

export async function saveTrainingSample({
  env,
  chatUserId,
  sessionId = "",
  sourceMessageId = "",
  promptVersion = "v1",
  sampleStage = "new",
  sampleIntent = "",
  customerInput,
  assistantOutput,
  candidateRepliesJson = [],
  chosenReplyIndex = -1,
  questionBudget = 0,
  openingStyle = "",
  closingStyle = "",
  scenarioClass = "",
  strategySnapshot = {},
  contextSnapshot = {},
}) {
  const input = cleanText(customerInput);
  const output = cleanText(assistantOutput);
  if (!chatUserId || !input || !output) return null;
  const nextScenarioClass = cleanText(scenarioClass || buildTrainingScenarioClass({
    sampleStage,
    sampleIntent,
    customerInput: input,
    assistantOutput: output,
    strategySnapshot,
    contextSnapshot,
  }));

  await env.DB.prepare(`
    INSERT INTO training_samples (
      chat_user_id,
      session_id,
      source_message_id,
      prompt_version,
      sample_stage,
      sample_intent,
      customer_input,
      assistant_output,
      candidate_replies_json,
      chosen_reply_index,
      question_budget,
      opening_style,
      closing_style,
      scenario_class,
      strategy_snapshot_json,
      context_snapshot_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `)
    .bind(
      chatUserId,
      sessionId || "",
      String(sourceMessageId || ""),
      promptVersion || "v1",
      sampleStage || "new",
      sampleIntent || "",
      input,
      output,
      JSON.stringify(Array.isArray(candidateRepliesJson) ? candidateRepliesJson : []),
      Number.isFinite(Number(chosenReplyIndex)) ? Number(chosenReplyIndex) : -1,
      Number.isFinite(Number(questionBudget)) ? Number(questionBudget) : 0,
      openingStyle || "",
      closingStyle || "",
      nextScenarioClass || "",
      JSON.stringify(strategySnapshot || {}),
      JSON.stringify(contextSnapshot || {})
    )
    .run();

  return {
    chatUserId,
    sessionId,
    sourceMessageId: String(sourceMessageId || ""),
    promptVersion: promptVersion || "v1",
    sampleStage: sampleStage || "new",
    sampleIntent: sampleIntent || "",
    scenarioClass: nextScenarioClass,
    customerInput: input,
    assistantOutput: output,
  };
}

export async function recordTrainingFeedback({
  env,
  sampleId = null,
  chatUserId,
  feedbackType = "rating",
  score = null,
  note = "",
}) {
  if (!chatUserId) return null;

  await env.DB.prepare(`
    INSERT INTO training_feedback (
      sample_id,
      chat_user_id,
      feedback_type,
      score,
      note,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
  `)
    .bind(sampleId ? Number(sampleId) : null, chatUserId, feedbackType || "rating", Number.isFinite(Number(score)) ? Number(score) : null, cleanText(note || ""))
    .run();

  if (sampleId) {
    await env.DB.prepare(`
      UPDATE training_samples
      SET
        feedback_score = COALESCE(?, feedback_score),
        feedback_label = CASE WHEN ? != '' THEN ? ELSE feedback_label END,
        feedback_note = CASE WHEN ? != '' THEN ? ELSE feedback_note END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `)
      .bind(
        Number.isFinite(Number(score)) ? Number(score) : null,
        cleanText(feedbackType || ""),
        cleanText(feedbackType || ""),
        cleanText(note || ""),
        cleanText(note || ""),
        Number(sampleId)
      )
      .run();
  }

  return {
    sampleId: sampleId ? Number(sampleId) : null,
    chatUserId,
    feedbackType: feedbackType || "rating",
    score: Number.isFinite(Number(score)) ? Number(score) : null,
    note: cleanText(note || ""),
  };
}

export async function updateTrainingSampleAnnotation({
  env,
  sampleId,
  chatUserId,
  candidateReplies = null,
  chosenReplyIndex = null,
  sampleStage = "",
  feedbackLabel = "",
  feedbackNote = "",
  scenarioClass = "",
}) {
  if (!sampleId || !chatUserId) return null;

  const replies = Array.isArray(candidateReplies)
    ? candidateReplies.map((item) => cleanText(item)).filter(Boolean)
    : null;
  const chosenIndex = Number.isFinite(Number(chosenReplyIndex)) ? Number(chosenReplyIndex) : null;
  const stage = cleanText(sampleStage || "");
  const label = cleanText(feedbackLabel || "");
  const note = cleanText(feedbackNote || "");
  const nextScenarioClass = cleanText(scenarioClass || "");

  await env.DB.prepare(`
    UPDATE training_samples
    SET
      candidate_replies_json = COALESCE(?, candidate_replies_json),
      chosen_reply_index = COALESCE(?, chosen_reply_index),
      sample_stage = CASE WHEN ? != '' THEN ? ELSE sample_stage END,
      feedback_label = CASE WHEN ? != '' THEN ? ELSE feedback_label END,
      feedback_note = CASE WHEN ? != '' THEN ? ELSE feedback_note END,
      scenario_class = CASE WHEN ? != '' THEN ? ELSE scenario_class END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND chat_user_id = ?;
  `)
    .bind(
      replies ? JSON.stringify(replies) : null,
      chosenIndex,
      stage,
      stage,
      label,
      label,
      note,
      note,
      nextScenarioClass,
      nextScenarioClass,
      Number(sampleId),
      chatUserId
    )
    .run();

  return {
    sampleId: Number(sampleId),
    chatUserId,
    candidateReplies: replies,
    chosenReplyIndex: chosenIndex,
    sampleStage: stage,
    feedbackLabel: label,
    feedbackNote: note,
    scenarioClass: nextScenarioClass,
  };
}

export async function getTrainingSamples(env, chatUserId, limit = 20, status = "all") {
  const normalizedStatus = cleanText(status || "all").toLowerCase();
  const conditions = ["chat_user_id = ?"];
  const params = [chatUserId];

  if (normalizedStatus === "labeled") {
    conditions.push("chosen_reply_index >= 0");
  } else if (normalizedStatus === "unlabeled") {
    conditions.push("(chosen_reply_index < 0 OR candidate_replies_json = '[]')");
  }

  params.push(limit);

  const result = await env.DB.prepare(`
    SELECT *
    FROM training_samples
    WHERE ${conditions.join(" AND ")}
    ORDER BY id DESC
    LIMIT ?;
  `)
    .bind(...params)
    .all();

  return (result.results || []).map((row) => ({
    id: Number(row.id || 0),
    chatUserId: row.chat_user_id || "",
    sessionId: row.session_id || "",
    sourceMessageId: row.source_message_id || "",
    promptVersion: row.prompt_version || "v1",
    sampleStage: row.sample_stage || "new",
    sampleIntent: row.sample_intent || "",
    scenarioClass: TRAINING_SCENARIO_CLASSES.includes(cleanText(row.scenario_class || "").toLowerCase())
      ? cleanText(row.scenario_class || "")
      : buildTrainingScenarioClass({
          sampleStage: row.sample_stage || "new",
          sampleIntent: row.sample_intent || "",
          replyLayer: safeJsonObject(row.strategy_snapshot_json)?.replyLayer || "",
          openingStyle: row.opening_style || "",
          closingStyle: row.closing_style || "",
          customerInput: row.customer_input || "",
          assistantOutput: row.assistant_output || "",
          strategySnapshot: safeJsonObject(row.strategy_snapshot_json),
          contextSnapshot: safeJsonObject(row.context_snapshot_json),
        }),
    customerInput: cleanText(row.customer_input || ""),
    assistantOutput: cleanText(row.assistant_output || ""),
    candidateReplies: safeJsonArray(row.candidate_replies_json),
    chosenReplyIndex: Number(row.chosen_reply_index || -1),
    questionBudget: Number(row.question_budget || 0),
    openingStyle: row.opening_style || "",
    closingStyle: row.closing_style || "",
    strategySnapshot: safeJsonObject(row.strategy_snapshot_json),
    contextSnapshot: safeJsonObject(row.context_snapshot_json),
    feedbackScore: row.feedback_score === null || row.feedback_score === undefined ? null : Number(row.feedback_score),
    feedbackLabel: row.feedback_label || "",
    feedbackNote: row.feedback_note || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  }));
}

export async function getTrainingStats(env, chatUserId) {
  const [sampleCounts, feedbackCounts, scenarioCounts, latestSample, latestFeedback] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN chosen_reply_index >= 0 THEN 1 ELSE 0 END) AS labeled_count,
        SUM(CASE WHEN feedback_score IS NOT NULL THEN 1 ELSE 0 END) AS scored_count,
        AVG(CASE WHEN feedback_score IS NOT NULL THEN feedback_score ELSE NULL END) AS avg_score
      FROM training_samples
      WHERE chat_user_id = ?;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,
        AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) AS avg_score
      FROM training_feedback
      WHERE chat_user_id = ?;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT scenario_class, COUNT(*) AS count
      FROM training_samples
      WHERE chat_user_id = ? AND scenario_class != ''
      GROUP BY scenario_class
      ORDER BY count DESC, scenario_class ASC;
    `)
      .bind(chatUserId)
      .all(),
    env.DB.prepare(`
      SELECT id, prompt_version, sample_stage, sample_intent, created_at
      FROM training_samples
      WHERE chat_user_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT id, sample_id, feedback_type, score, note, created_at
      FROM training_feedback
      WHERE chat_user_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId)
      .first(),
  ]);

  return {
    sampleCounts: {
      total: Number(sampleCounts?.total_count || 0),
      labeled: Number(sampleCounts?.labeled_count || 0),
      scored: Number(sampleCounts?.scored_count || 0),
      avgScore: sampleCounts?.avg_score === null || sampleCounts?.avg_score === undefined ? null : Number(sampleCounts.avg_score),
    },
    feedbackCounts: {
      total: Number(feedbackCounts?.total_count || 0),
      avgScore: feedbackCounts?.avg_score === null || feedbackCounts?.avg_score === undefined ? null : Number(feedbackCounts.avg_score),
    },
    scenarioCounts: (scenarioCounts?.results || []).map((item) => ({
      scenarioClass: item.scenario_class || "",
      count: Number(item.count || 0),
    })),
    latestSample: latestSample
      ? {
          id: Number(latestSample.id || 0),
          promptVersion: latestSample.prompt_version || "v1",
          sampleStage: latestSample.sample_stage || "new",
          sampleIntent: latestSample.sample_intent || "",
          createdAt: latestSample.created_at || "",
        }
      : null,
    latestFeedback: latestFeedback
      ? {
          id: Number(latestFeedback.id || 0),
          sampleId: latestFeedback.sample_id === null ? null : Number(latestFeedback.sample_id),
          feedbackType: latestFeedback.feedback_type || "rating",
          score: latestFeedback.score === null || latestFeedback.score === undefined ? null : Number(latestFeedback.score),
          note: cleanText(latestFeedback.note || ""),
          createdAt: latestFeedback.created_at || "",
        }
      : null,
  };
}

export const TRAINING_SCENARIO_CLASSES = [
  "calm_checkin",
  "work_fatigue",
  "sleep_and_night",
  "weekend_rhythm",
  "practical_decision",
  "emotional_tension",
  "low_pressure_support",
  "light_flirt",
  "mutual_affection",
  "partner_like_continuity",
  "cooldown_and_repair",
  "deep_continuity",
];

function mergeTrainingText(sample = {}) {
  return cleanText([
    sample.customerInput || sample.customer_input || "",
    sample.customerSummary || sample.customer_summary || "",
    sample.assistantOutput || sample.assistant_output || "",
    sample.replyLayer || sample.reply_layer || sample.strategySnapshot?.replyLayer || "",
    sample.sampleIntent || sample.sample_intent || sample.strategySnapshot?.intent || "",
    sample.openingStyle || sample.opening_style || "",
    sample.closingStyle || sample.closing_style || "",
    ...(Array.isArray(sample.memoryFacts || sample.memory_facts)
      ? (sample.memoryFacts || sample.memory_facts).map((fact) => `${fact?.key || ""} ${fact?.value || ""}`)
      : []),
    ...(Array.isArray(sample.recentMessages || sample.recent_messages)
      ? (sample.recentMessages || sample.recent_messages).map((message) => message?.content || "")
      : []),
  ].join(" ")).toLowerCase();
}

function hasAnyText(text, words) {
  const value = cleanText(text).toLowerCase();
  return words.some((word) => value.includes(String(word).toLowerCase()));
}

export function buildTrainingScenarioClass(sample = {}) {
  const manualScenarioClass = cleanText(sample.scenarioClass || sample.scenario_class || "").toLowerCase();
  if (TRAINING_SCENARIO_CLASSES.includes(manualScenarioClass)) {
    return manualScenarioClass;
  }

  const text = mergeTrainingText(sample);
  const stage = cleanText(sample.sampleStage || sample.sample_stage || sample.strategySnapshot?.stage || "new");
  const intent = cleanText(sample.sampleIntent || sample.sample_intent || sample.strategySnapshot?.intent || "support");
  const replyLayer = cleanText(sample.replyLayer || sample.reply_layer || sample.strategySnapshot?.replyLayer || "emotional_value");
  const flirtationLevel = cleanText(sample.flirtationLevel || sample.flirtation_level || sample.labels?.flirtation_level || "");

  if (
    replyLayer === "partner_like" ||
    stage === "stable_companion" ||
    (stage === "trusted" || stage === "light_romantic") && hasAnyText(text, ["together", "my girl", "my woman", "my partner", "us", "we are", "our thing"])
  ) {
    if (hasAnyText(text, ["remember when", "last time", "again", "still", "as you said", "you said before", "we talked", "earlier", "before"])) {
      return "deep_continuity";
    }
    return "partner_like_continuity";
  }

  if (
    replyLayer === "light_flirt" ||
    flirtationLevel === "light" ||
    flirtationLevel === "medium" ||
    stage === "light_romantic" ||
    (stage === "trusted" && hasAnyText(text, ["cute", "handsome", "miss you", "missed you", "thinking of you", "a little flirty", "tease", "smile"]))
  ) {
    return "light_flirt";
  }

  if (
    hasAnyText(text, ["sorry", "apolog", "not talk", "distance", "pulled back", "cold", "ignored", "still upset", "repair", "cool down", "cooldown", "make up", "reconnect"]) &&
    (stage === "trusted" || stage === "familiar" || stage === "light_romantic")
  ) {
    return "cooldown_and_repair";
  }

  if (
    hasAnyText(text, ["remember", "last time", "again", "still", "you said", "we talked", "last week", "last night", "the other day", "as you said", "you mentioned", "earlier today"]) &&
    (stage === "trusted" || stage === "familiar" || stage === "light_romantic")
  ) {
    return "deep_continuity";
  }

  if (intent === "practical" || hasAnyText(text, ["should i", "should we", "which one", "what do you think", "how should i", "best way", "next step", "decision", "choose", "option", "recommend"])) {
    return "practical_decision";
  }

  if (hasAnyText(text, ["sleep", "sleeping", "insomnia", "night", "late", "bed", "wake up", "up at night", "cant sleep", "can’t sleep", "restless", "dream", "quiet night"])) {
    return "sleep_and_night";
  }

  if (hasAnyText(text, ["work", "job", "office", "shift", "overtime", "deadline", "boss", "pressure", "busy", "drained", "exhausted", "stressed", "tired", "burned out", "burnt out"])) {
    return "work_fatigue";
  }

  if (hasAnyText(text, ["lonely", "alone", "miss", "sad", "down", "frustrated", "irritated", "angry", "overwhelmed", "heavy", "rough", "low", "empty", "not great", "off today", "bad mood"])) {
    return "emotional_tension";
  }

  if (hasAnyText(text, ["weekend", "coffee", "movie", "walk", "game", "golf", "sports", "football", "baseball", "cook", "dinner", "morning", "evening", "quiet", "relax", "rest", "routine"])) {
    return "weekend_rhythm";
  }

  if (intent === "support") {
    if (stage === "new" || hasAnyText(text, ["hi", "hello", "hey", "checking in", "just saying hi", "good morning", "good evening"])) {
      return "calm_checkin";
    }

    if (hasAnyText(text, ["i do not want to talk much", "don't want to talk much", "not a big deal", "just need a moment", "need something simple", "keep it light", "low key", "easy", "quiet"])) {
      return "low_pressure_support";
    }

    if (stage === "trusted" || stage === "light_romantic") {
      return "mutual_affection";
    }

    return "low_pressure_support";
  }

  if (intent === "smalltalk") {
    if (stage === "trusted" || stage === "light_romantic" || stage === "stable_companion") {
      return "mutual_affection";
    }
    return "calm_checkin";
  }

  if (stage === "trusted" || stage === "light_romantic" || stage === "stable_companion") {
    return "mutual_affection";
  }

  return "calm_checkin";
}

export function buildTrainingSystemPrompt(sample = {}) {
  const stage = cleanText(sample.sampleStage || sample.strategySnapshot?.stage || "new");
  const intent = cleanText(sample.sampleIntent || sample.strategySnapshot?.intent || "support");
  const replyLayer = cleanText(sample.replyLayer || sample.strategySnapshot?.replyLayer || "emotional_value");
  const scenarioClass = cleanText(sample.scenarioClass || sample.scenario_class || buildTrainingScenarioClass(sample));
  const openingStyle = cleanText(sample.openingStyle || sample.strategySnapshot?.openingStyle || "natural");
  const closingStyle = cleanText(sample.closingStyle || sample.strategySnapshot?.closingStyle || "open_finish");
  const questionBudget = Number.isFinite(Number(sample.questionBudget)) ? Number(sample.questionBudget) : 0;

  return [
    "You are Mia, a warm private-chat companion for 45+ American men.",
    "Reply in natural English for a private chat, with short, human-sounding phrasing.",
    `Relationship stage: ${stage}.`,
    `Conversation intent: ${intent}.`,
    `Reply layer: ${replyLayer}.`,
    `Scenario class: ${scenarioClass}.`,
    `Opening style: ${openingStyle}.`,
    `Closing style: ${closingStyle}.`,
    `Question budget: ${questionBudget}.`,
    "Avoid AI tone, customer support tone, and stock closings.",
    "Prefer one short response that feels easy to continue.",
  ].join(" ");
}

export function buildTrainingAudienceProfile(sample = {}) {
  return {
    age_band: cleanText(sample.ageBand || sample.age_band || "45_plus"),
    locale: cleanText(sample.locale || "en_US"),
    gender: cleanText(sample.gender || "male"),
    tone_preference: Array.isArray(sample.tonePreference || sample.tone_preference)
      ? (sample.tonePreference || sample.tone_preference).map((item) => cleanText(item)).filter(Boolean)
      : ["calm", "respectful", "adult", "low_pressure"],
  };
}

export function buildTrainingRelationshipProfile(sample = {}) {
  return {
    stage: cleanText(sample.sampleStage || sample.sample_stage || sample.strategySnapshot?.stage || "new"),
    mode: cleanText(sample.replyLayer || sample.reply_layer || sample.strategySnapshot?.replyLayer || "emotional_value"),
    intimacy_band: cleanText(sample.intimacyBand || sample.intimacy_band || "low"),
    flirtation_band: cleanText(sample.flirtationLevel || sample.flirtation_level || "none"),
  };
}

export function buildTrainingConversationGoal(sample = {}) {
  const replyLayer = cleanText(sample.replyLayer || sample.reply_layer || sample.strategySnapshot?.replyLayer || "emotional_value");
  return {
    primary: cleanText(sample.primaryGoal || sample.primary_goal || "provide_emotional_value"),
    secondary: cleanText(sample.secondaryGoal || sample.secondary_goal || "keep_conversation_open"),
    reply_layer: replyLayer,
  };
}

export function buildTrainingContext(sample = {}) {
  const memoryFacts = Array.isArray(sample.memoryFacts || sample.memory_facts)
    ? (sample.memoryFacts || sample.memory_facts).map((fact) => ({
        key: cleanText(fact?.key || ""),
        value: cleanText(fact?.value || ""),
      })).filter((fact) => fact.key || fact.value)
    : [];
  const recentMessages = Array.isArray(sample.recentMessages || sample.recent_messages)
    ? (sample.recentMessages || sample.recent_messages).map((message) => ({
        role: cleanText(message?.role || ""),
        content: cleanText(message?.content || ""),
      })).filter((message) => message.role || message.content)
    : [];

  return {
    customer_input: cleanText(sample.customerInput || sample.customer_input || ""),
    customer_summary: cleanText(sample.customerSummary || sample.customer_summary || ""),
    memory_facts: memoryFacts,
    recent_messages: recentMessages,
  };
}

export function buildTrainingResponse(sample = {}) {
  return {
    assistant_output: cleanText(sample.assistantOutput || sample.assistant_output || ""),
    candidate_replies: getTrainingCandidateReplies(sample),
    chosen_reply_index: Number.isFinite(Number(sample.chosenReplyIndex ?? sample.chosen_reply_index)) ? Number(sample.chosenReplyIndex ?? sample.chosen_reply_index) : -1,
    question_budget: Number.isFinite(Number(sample.questionBudget ?? sample.question_budget)) ? Number(sample.questionBudget ?? sample.question_budget) : 0,
    opening_style: cleanText(sample.openingStyle || sample.opening_style || ""),
    closing_style: cleanText(sample.closingStyle || sample.closing_style || ""),
  };
}

export function buildTrainingLabels(sample = {}) {
  return {
    sample_stage: cleanText(sample.sampleStage || sample.sample_stage || "new"),
    sample_intent: cleanText(sample.sampleIntent || sample.sample_intent || ""),
    emotional_goal: cleanText(sample.emotionalGoal || sample.emotional_goal || ""),
    flirtation_level: cleanText(sample.flirtationLevel || sample.flirtation_level || ""),
    relationship_move: cleanText(sample.relationshipMove || sample.relationship_move || ""),
    quality_label: cleanText(sample.qualityLabel || sample.quality_label || ""),
    feedback_score: sample.feedbackScore ?? sample.feedback_score ?? null,
    feedback_label: cleanText(sample.feedbackLabel || sample.feedback_label || ""),
    feedback_note: cleanText(sample.feedbackNote || sample.feedback_note || ""),
  };
}

export function buildTrainingCompanionRecord(sample = {}) {
  const metadata = buildTrainingMetadata(sample);
  return {
    schema_version: "companion_v1",
    product_track: metadata.product_track || "45plus_us_men",
    scenario_class: metadata.scenario_class || buildTrainingScenarioClass(sample),
    audience_profile: buildTrainingAudienceProfile(sample),
    relationship_profile: buildTrainingRelationshipProfile(sample),
    conversation_goal: buildTrainingConversationGoal(sample),
    context: buildTrainingContext(sample),
    response: buildTrainingResponse(sample),
    labels: buildTrainingLabels(sample),
    strategy_snapshot: sample.strategySnapshot || sample.strategy_snapshot || {},
    context_snapshot: sample.contextSnapshot || sample.context_snapshot || {},
    metadata,
  };
}

export function buildTrainingSftRecord(sample = {}) {
  const messages = [
    { role: "system", content: buildTrainingSystemPrompt(sample) },
    { role: "user", content: cleanText(sample.customerInput || "") },
    { role: "assistant", content: cleanText(sample.assistantOutput || "") },
  ];

  return {
    id: Number(sample.id || 0),
    type: "sft",
    ...buildTrainingCompanionRecord(sample),
    messages,
  };
}

export function buildTrainingDpoRecords(sample = {}) {
  const candidates = getTrainingCandidateReplies(sample);
  const chosenIndex = Number.isFinite(Number(sample.chosenReplyIndex)) ? Number(sample.chosenReplyIndex) : -1;
  const prompt = buildTrainingPrompt(sample);
  const chosen = cleanText(candidates[chosenIndex] || sample.assistantOutput || "");

  if (!prompt || !chosen || candidates.length < 2 || chosenIndex < 0) {
    return [];
  }

  return candidates
    .map((candidate, index) => {
      if (index === chosenIndex) return null;
      const rejected = cleanText(candidate || "");
      if (!rejected || rejected === chosen) return null;
      return {
        id: Number(sample.id || 0),
        type: "dpo",
        ...buildTrainingCompanionRecord(sample),
        prompt,
        chosen,
        rejected,
      };
    })
    .filter(Boolean);
}

export function buildTrainingPrompt(sample = {}) {
  const system = buildTrainingSystemPrompt(sample);
  const user = cleanText(sample.customerInput || "");
  if (!system || !user) return "";
  return `${system}\n\nUser: ${user}`;
}

export function buildTrainingMetadata(sample = {}) {
  return {
    schema_version: "training_v1",
    export_source: "salesmartly-ai",
    product_track: cleanText(sample.productTrack || sample.product_track || "45plus_us_men"),
    scenario_class: cleanText(sample.scenarioClass || sample.scenario_class || buildTrainingScenarioClass(sample)),
    chat_user_id: cleanText(sample.chatUserId || sample.chat_user_id || ""),
    session_id: cleanText(sample.sessionId || sample.session_id || ""),
    source_message_id: cleanText(sample.sourceMessageId || sample.source_message_id || ""),
    prompt_version: cleanText(sample.promptVersion || sample.prompt_version || "v1"),
    sample_stage: cleanText(sample.sampleStage || sample.sample_stage || "new"),
    sample_intent: cleanText(sample.sampleIntent || sample.sample_intent || ""),
    question_budget: Number.isFinite(Number(sample.questionBudget)) ? Number(sample.questionBudget) : 0,
    opening_style: cleanText(sample.openingStyle || sample.opening_style || ""),
    closing_style: cleanText(sample.closingStyle || sample.closing_style || ""),
    reply_layer: cleanText(sample.replyLayer || sample.reply_layer || sample.strategySnapshot?.replyLayer || ""),
    emotional_goal: cleanText(sample.emotionalGoal || sample.emotional_goal || ""),
    flirtation_level: cleanText(sample.flirtationLevel || sample.flirtation_level || ""),
    relationship_move: cleanText(sample.relationshipMove || sample.relationship_move || ""),
    feedback_score: sample.feedbackScore ?? sample.feedback_score ?? null,
    feedback_label: cleanText(sample.feedbackLabel || sample.feedback_label || ""),
    feedback_note: cleanText(sample.feedbackNote || sample.feedback_note || ""),
  };
}

export function getTrainingCandidateReplies(sample = {}) {
  if (Array.isArray(sample.candidateReplies)) {
    return sample.candidateReplies.map((item) => cleanText(item)).filter(Boolean);
  }

  if (Array.isArray(sample.candidateRepliesJson)) {
    return sample.candidateRepliesJson.map((item) => cleanText(item)).filter(Boolean);
  }

  if (typeof sample.candidateReplies === "string") {
    return safeJsonArray(sample.candidateReplies).map((item) => cleanText(item)).filter(Boolean);
  }

  if (typeof sample.candidateRepliesJson === "string") {
    return safeJsonArray(sample.candidateRepliesJson).map((item) => cleanText(item)).filter(Boolean);
  }

  return [];
}

export function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function getMemoryStats(env, chatUserId) {
  const [messageCounts, factCounts, summaryCount, latestMessage, latestFact, latestSummary] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) AS customer_count,
        SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) AS assistant_count,
        MIN(created_at) AS first_message_at,
        MAX(created_at) AS last_message_at
      FROM messages
      WHERE chat_user_id = ?;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status = 'superseded' THEN 1 ELSE 0 END) AS superseded_count
      FROM memory_facts
      WHERE chat_user_id = ?;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total_count
      FROM conversation_summaries
      WHERE chat_user_id = ?;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT id, role, content, created_at
      FROM messages
      WHERE chat_user_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT id, fact_key, fact_value, confidence, status, created_at
      FROM memory_facts
      WHERE chat_user_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId)
      .first(),
    env.DB.prepare(`
      SELECT id, summary_text, created_at
      FROM conversation_summaries
      WHERE chat_user_id = ?
      ORDER BY id DESC
      LIMIT 1;
    `)
      .bind(chatUserId)
      .first(),
  ]);

  return {
    messageCounts: {
      total: Number(messageCounts?.total_count || 0),
      customer: Number(messageCounts?.customer_count || 0),
      assistant: Number(messageCounts?.assistant_count || 0),
      firstMessageAt: messageCounts?.first_message_at || "",
      lastMessageAt: messageCounts?.last_message_at || "",
    },
    factCounts: {
      total: Number(factCounts?.total_count || 0),
      active: Number(factCounts?.active_count || 0),
      superseded: Number(factCounts?.superseded_count || 0),
    },
    summaryCount: Number(summaryCount?.total_count || 0),
    latestMessage: latestMessage
      ? {
          id: Number(latestMessage.id || 0),
          role: latestMessage.role || "",
          content: cleanText(latestMessage.content || ""),
          createdAt: latestMessage.created_at || "",
        }
      : null,
    latestFact: latestFact
      ? {
          id: Number(latestFact.id || 0),
          key: latestFact.fact_key || "",
          value: latestFact.fact_value || "",
          confidence: Number(latestFact.confidence || 0),
          status: latestFact.status || "active",
          createdAt: latestFact.created_at || "",
        }
      : null,
    latestSummary: latestSummary
      ? {
          id: Number(latestSummary.id || 0),
          summaryText: cleanText(latestSummary.summary_text || ""),
          createdAt: latestSummary.created_at || "",
        }
      : null,
  };
}

export async function getRelationshipState(env, chatUserId, fallbackStage = "new") {
  const row = await env.DB.prepare(`
    SELECT *
    FROM relationship_state
    WHERE chat_user_id = ?
    LIMIT 1;
  `)
    .bind(chatUserId)
    .first();

  if (row) return normalizeRelationshipState(row);

  const seeded = seedRelationshipState(fallbackStage);
  await env.DB.prepare(`
    INSERT INTO relationship_state (
      chat_user_id,
      stage,
      trust,
      intimacy,
      confidence,
      last_source_message_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `)
    .bind(chatUserId, seeded.stage, seeded.trust, seeded.intimacy, seeded.confidence)
    .run();

  return seeded;
}

export async function upsertRelationshipState({
  env,
  chatUserId,
  stage,
  trust,
  intimacy,
  confidence = 0.5,
  sourceMessageId = "",
}) {
  const safeState = normalizeRelationshipState({
    chat_user_id: chatUserId,
    stage,
    trust,
    intimacy,
    confidence,
    last_source_message_id: sourceMessageId,
  });

  await env.DB.prepare(`
    INSERT INTO relationship_state (
      chat_user_id,
      stage,
      trust,
      intimacy,
      confidence,
      last_source_message_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_user_id) DO UPDATE SET
      stage = excluded.stage,
      trust = excluded.trust,
      intimacy = excluded.intimacy,
      confidence = excluded.confidence,
      last_source_message_id = excluded.last_source_message_id,
      updated_at = CURRENT_TIMESTAMP;
  `)
    .bind(
      chatUserId,
      safeState.stage,
      safeState.trust,
      safeState.intimacy,
      safeState.confidence,
      String(safeState.lastSourceMessageId || "")
    )
    .run();

  await env.DB.prepare(`
    UPDATE customers
    SET relationship_stage = ?, updated_at = CURRENT_TIMESTAMP
    WHERE chat_user_id = ?;
  `)
    .bind(safeState.stage, chatUserId)
    .run();

  return safeState;
}

export async function upsertMemoryFact({
  env,
  chatUserId,
  factKey,
  factValue,
  confidence,
  sourceMessageId = "",
  sourceMessageRole = "customer",
}) {
  const key = normalizeFactKey(factKey);
  const value = cleanText(factValue);
  if (!key || !value) return null;

  const existing = await env.DB.prepare(`
    SELECT id, fact_value, confidence
    FROM memory_facts
    WHERE chat_user_id = ?
      AND fact_key = ?
      AND status = 'active'
    ORDER BY confidence DESC, updated_at DESC, id DESC
    LIMIT 1;
  `)
    .bind(chatUserId, key)
    .first();

  if (existing && cleanText(existing.fact_value) === value) {
    const nextConfidence = clamp(Math.max(Number(existing.confidence || 0), Number(confidence || 0.5)), 0, 1);
    await env.DB.prepare(`
      UPDATE memory_facts
      SET confidence = ?, source_message_id = ?, source_message_role = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `)
      .bind(nextConfidence, String(sourceMessageId || ""), sourceMessageRole || "customer", existing.id)
      .run();

    return { key, value, confidence: nextConfidence, status: "active" };
  }

  if (existing) {
    await env.DB.prepare(`
      UPDATE memory_facts
      SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `)
      .bind(existing.id)
      .run();
  }

  await env.DB.prepare(`
    INSERT INTO memory_facts (
      chat_user_id,
      fact_key,
      fact_value,
      confidence,
      status,
      source_message_id,
      source_message_role,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `)
    .bind(chatUserId, key, value, clamp(Number(confidence || 0.5), 0, 1), String(sourceMessageId || ""), sourceMessageRole || "customer")
    .run();

  return { key, value, confidence: clamp(Number(confidence || 0.5), 0, 1), status: "active" };
}

function tokenizeReferenceText(value = "") {
  return [...new Set(
    cleanText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
  )];
}

function scoreReferenceMatch(sampleText = "", queryText = "") {
  const sampleTokens = tokenizeReferenceText(sampleText);
  const queryTokens = tokenizeReferenceText(queryText);
  if (!sampleTokens.length || !queryTokens.length) return 0;
  const querySet = new Set(queryTokens);
  let hits = 0;
  for (const token of sampleTokens) {
    if (querySet.has(token)) hits += 1;
  }
  return hits / Math.max(sampleTokens.length, queryTokens.length);
}

function selectTopReferenceSamples(samples = [], queryText = "", limit = 1, sampleTextFn = (sample) => "") {
  return (Array.isArray(samples) ? samples : [])
    .map((sample, index) => ({
      sample,
      score: scoreReferenceMatch(sampleTextFn(sample), queryText) + Math.max(0, 0.001 * (1000 - index)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.sample);
}

function trimReferenceText(value = "", maxLength = 180) {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildReferenceExample({ source, prompt, assistant, note = "" }) {
  return {
    source,
    prompt: trimReferenceText(prompt, 180),
    assistant: trimReferenceText(assistant, 180),
    note: trimReferenceText(note, 120),
  };
}

async function getReferenceExamples(env, { chatUserId, customerMessage = "", customerSummary = "" }) {
  const queryText = cleanText([customerMessage, customerSummary].filter(Boolean).join(" "));
  const [empatheticSamples, flirtflipSamples, realSamples] = await Promise.all([
    getEmpatheticDialogueSamples(env, 30, { split: "all" }),
    getFlirtFlipSamples(env, 30, { datasetKind: "all", recordType: "all" }),
    getTrainingSamples(env, chatUserId, 20, "labeled"),
  ]);

  const empathetic = selectTopReferenceSamples(
    empatheticSamples,
    queryText,
    REFERENCE_SOURCE_TARGETS[0].limit,
    (sample) => `${sample.prompt || ""} ${sample.utterance || ""} ${sample.context || ""}`
  ).map((sample) => buildReferenceExample({
    source: "EmpatheticDialogues",
    prompt: sample.prompt || "",
    assistant: sample.utterance || "",
    note: sample.context || "",
  }));

  const flirtflip = selectTopReferenceSamples(
    flirtflipSamples,
    queryText,
    REFERENCE_SOURCE_TARGETS[1].limit,
    (sample) => `${sample.preview?.prompt || ""} ${sample.preview?.chosen || ""} ${sample.preview?.assistant || ""} ${sample.scenario || ""}`
  ).map((sample) => buildReferenceExample({
    source: "FlirtFlip",
    prompt: sample.preview?.prompt || sample.preview?.user || "",
    assistant: sample.preview?.chosen || sample.preview?.assistant || "",
    note: sample.scenario || sample.sampleIntent || "",
  }));

  const real = selectTopReferenceSamples(
    realSamples,
    queryText,
    REFERENCE_SOURCE_TARGETS[2].limit,
    (sample) => `${sample.customerInput || ""} ${sample.assistantOutput || ""} ${sample.scenarioClass || ""} ${sample.sampleIntent || ""}`
  ).map((sample) => buildReferenceExample({
    source: "RealChat",
    prompt: sample.customerInput || "",
    assistant: sample.assistantOutput || "",
    note: sample.scenarioClass || sample.sampleIntent || "",
  }));

  return [...empathetic, ...flirtflip, ...real];
}

export async function loadMemoryBundle(env, { chatUserId, customer, relationshipStage, customerMessage, embeddingFn }) {
  const [facts, relationshipState, latestSummary, vectorMemories, referenceExamples] = await Promise.all([
    getActiveMemoryFacts(env, chatUserId, MEMORY_FACT_LIMIT),
    getRelationshipState(env, chatUserId, relationshipStage),
    getLatestConversationSummary(env, chatUserId),
    getRelevantVectorMemoriesByTexts(env, {
      chatUserId,
      queryTexts: [customerMessage || "", customer?.summary || "", customer?.remark || ""],
      limit: 8,
      embeddingFn,
    }),
    getReferenceExamples(env, {
      chatUserId,
      customerMessage,
      customerSummary: customer?.summary || "",
    }),
  ]);

  return {
    facts,
    relationshipState,
    summary: latestSummary || customer?.summary || "",
    vectorMemories,
    referenceExamples,
  };
}

function normalizeRelationshipState(row) {
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

function seedRelationshipState(stage) {
  const normalizedStage = normalizeStage(stage);
  switch (normalizedStage) {
    case "stable_companion":
      return { chatUserId: "", stage: normalizedStage, trust: 0.88, intimacy: 0.84, confidence: 0.7, lastSourceMessageId: "" };
    case "light_romantic":
      return { chatUserId: "", stage: normalizedStage, trust: 0.75, intimacy: 0.7, confidence: 0.65, lastSourceMessageId: "" };
    case "trusted":
      return { chatUserId: "", stage: normalizedStage, trust: 0.64, intimacy: 0.55, confidence: 0.6, lastSourceMessageId: "" };
    case "familiar":
      return { chatUserId: "", stage: normalizedStage, trust: 0.45, intimacy: 0.32, confidence: 0.55, lastSourceMessageId: "" };
    default:
      return { chatUserId: "", stage: "new", trust: 0.22, intimacy: 0.12, confidence: 0.5, lastSourceMessageId: "" };
  }
}
