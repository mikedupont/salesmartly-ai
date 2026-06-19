import { cleanText, clamp, VECTOR_MEMORY_LIMIT } from "./common.js";

function getVectorIndex(env) {
  return env.VECTORIZE || env.VECTORIZE_INDEX || null;
}

function normalizeVectorMatch(match) {
  const metadata = match?.metadata || {};
  return {
    id: String(match?.id || ""),
    sourceType: cleanText(metadata.source_type || metadata.sourceType || "memory") || "memory",
    sourceId: cleanText(metadata.source_id || metadata.sourceId || ""),
    text: cleanText(metadata.source_text || metadata.text || ""),
    similarity: clamp(Number(match?.score ?? match?.similarity ?? 0), -1, 1),
    createdAt: cleanText(metadata.created_at || metadata.createdAt || ""),
  };
}

export async function getRelevantVectorMemories(env, { chatUserId, queryText, limit = VECTOR_MEMORY_LIMIT, embeddingFn }) {
  return await getRelevantVectorMemoriesByTexts(env, {
    chatUserId,
    queryTexts: [queryText],
    limit,
    embeddingFn,
  });
}

export async function getRelevantVectorMemoriesByTexts(
  env,
  { chatUserId, queryTexts = [], limit = VECTOR_MEMORY_LIMIT, embeddingFn }
) {
  const index = getVectorIndex(env);
  const probes = [...new Set((queryTexts || []).map(cleanText).filter(Boolean))];
  if (!index || probes.length === 0 || !embeddingFn) return [];

  const merged = new Map();

  for (const probeText of probes.slice(0, 3)) {
    const queryEmbedding = await embeddingFn(probeText);
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) continue;

    try {
      const matches = await index.query(queryEmbedding, {
        topK: Math.min(Math.max(Number(limit) || VECTOR_MEMORY_LIMIT, 1), 50),
        returnMetadata: "all",
        filter: { chat_user_id: chatUserId },
      });

      const rows = Array.isArray(matches?.matches)
        ? matches.matches
        : Array.isArray(matches?.results)
          ? matches.results
          : Array.isArray(matches)
            ? matches
            : [];

      for (const row of rows) {
        const normalized = normalizeVectorMatch(row);
        if (!normalized.text) continue;

        const previous = merged.get(normalized.id);
        if (!previous || normalized.similarity > previous.similarity) {
          merged.set(normalized.id, normalized);
        }
      }
    } catch (err) {
      console.log("Vectorize query failed:", err?.message || err);
    }
  }

  return [...merged.values()]
    .sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })
    .slice(0, limit);
}

export async function upsertVectorMemory({
  env,
  chatUserId,
  sourceType,
  sourceId = "",
  sourceText,
  embeddingFn,
}) {
  const index = getVectorIndex(env);
  const text = cleanText(sourceText);
  if (!index || !text || !embeddingFn) return null;

  const embedding = await embeddingFn(text);
  if (!Array.isArray(embedding) || embedding.length === 0) return null;

  const idParts = [
    cleanText(chatUserId || "user") || "user",
    cleanText(sourceType || "memory") || "memory",
    cleanText(sourceId || "") || crypto.randomUUID(),
  ];

  const vector = {
    id: idParts.join(":"),
    values: embedding,
    metadata: {
      chat_user_id: chatUserId,
      source_type: cleanText(sourceType || "memory") || "memory",
      source_id: cleanText(sourceId || ""),
      source_text: text,
      created_at: new Date().toISOString(),
    },
  };

  try {
    await index.upsert([vector]);
  } catch (err) {
    console.log("Vectorize upsert failed:", err?.message || err);
    return null;
  }

  return {
    sourceType: vector.metadata.source_type,
    sourceId: vector.metadata.source_id,
    sourceText: text,
    id: vector.id,
  };
}
