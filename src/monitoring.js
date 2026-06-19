export function buildHealthSnapshot(env) {
  return {
    db: !!env.DB,
    vectorize: !!(env.VECTORIZE || env.VECTORIZE_INDEX),
    openai: !!env.OPENAI_API_KEY,
    autoReply: env.AUTO_REPLY === "true",
    worker: "salesmartly-ai",
  };
}
