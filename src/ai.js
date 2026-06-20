import { cleanText, clamp, parseJsonObject, sleep } from "./common.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { buildConversationContext } from "./context.js";
import { postProcessAIReply } from "./postprocess.js";

export function extractOpenAIText(data) {
  if (data.output_text && typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const parts = [];

    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            parts.push(content.text);
          }

          if (content.type === "text" && content.text) {
            parts.push(content.text);
          }
        }
      }
    }

    return parts.join("\n").trim();
  }

  return "";
}

export function fallbackReply() {
  return "I’m doing okay, thank you. Just taking things slowly today.";
}

export function buildIdentitySafeReply() {
  return "I’m here with you. What’s on your mind?";
}

export function isIdentityQuestion(text) {
  const value = cleanText(text).toLowerCase();
  if (!value) return false;

  return [
    /\b(?:are you|r u|are u)\s+(?:an?\s+)?(?:ai|bot|robot|virtual|assistant|human)\b/i,
    /\b(?:are you|r u|are u)\s+(?:real|human|a person)\b/i,
    /\bwho are you\b/i,
    /\bwhat are you\b/i,
    /\b(?:tell me|just be)\s+(?:honest|straight)\b/i,
    /\b(?:is this|are you)\s+(?:a\s+)?(?:bot|ai|robot|virtual)\b/i,
    /\breal person\b/i,
    /\bvirtual\b/i,
  ].some((pattern) => pattern.test(value));
}

export async function getTextEmbedding(env, text) {
  const clean = cleanText(text);
  if (!clean || !env.OPENAI_API_KEY) return [];

  const model = env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: clean }),
    });

    const data = await response.json();
    if (!response.ok) return [];

    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return [];
    return embedding.map((value) => Number(value) || 0);
  } catch {
    return [];
  }
}

export async function generateAIReply({
  env,
  customerName,
  customerRemark,
  customerMessage,
  relationshipStage,
  customerSummary,
  memoryFacts,
  vectorMemories,
  referenceExamples,
  relationshipState,
  recentMessages,
  formatRecentConversation,
  formatMemoryFacts,
  formatVectorMemories,
  formatReferenceExamples,
  formatRelationshipState,
}) {
  if (!env.OPENAI_API_KEY) {
    return "I’m here, but something is not set up correctly on my side.";
  }

  if (isIdentityQuestion(customerMessage)) {
    return buildIdentitySafeReply();
  }

  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const context = buildConversationContext({
    customerName,
    customerRemark,
    customerMessage,
    customerSummary,
    memoryFacts,
    vectorMemories,
    referenceExamples,
    relationshipState: relationshipState || {
      stage: relationshipStage || "new",
      trust: 0.25,
      intimacy: 0.15,
    },
    recentMessages,
    formatRecentConversation,
    formatMemoryFacts,
    formatVectorMemories,
    formatReferenceExamples,
    formatRelationshipState,
  });

  const userPrompt = `
${context.contextText}

Reply instructions:
- Follow Mia's stable identity, boundaries, and relationship rules from the system message.
- Answer the customer's main intent before adding personality.
- Use the dialogue strategy as the main guide for whether to comfort, clarify, explore, or hold space.
- Use reply_layer as the main emotional framing guide:
  - emotional_value: steady validation, low-pressure support, and grounded comfort
  - light_flirt: subtle adult warmth, gentle teasing, and restrained attraction
  - partner_like: familiar continuity, affectionate steadiness, and long-term companion energy
- Follow question_budget, conversation_move, topic_track, and pace_guide as the concrete steering layer.
- Use question_rhythm to decide whether to stay restrained or gently keep the thread moving.
- Treat opening_variant and closing_variant as soft style hints, not as fixed phrases.
- If question_cooldown is greater than 0, avoid asking a question this turn unless the customer explicitly asks one.
- If question_budget is 0, do not ask any question at all.
- If question_budget is 1, ask only one low-pressure question, and make it feel organic.
- If question_rhythm is active and should_ask is true, make the reply end with one simple question unless the customer's message already clearly closes the topic.
- Write like a natural text message, not like a report.
- Keep it short unless the customer clearly needs more.
- Prefer one or two short sentences over a tidy paragraph.
- Vary the sentence length a little; avoid sounding overly polished.
- Prefer short clauses and simple phrasing.
- It is okay to sound slightly casual, with one small pause or fragment when natural.
- Avoid overexplaining feelings or intent.
- When the moment is casual, let the reply end a little open instead of closing tightly.
- If should_ask is true, ask at most one low-pressure question that matches the question_type and question_focus.
- If should_ask is false, do not force a question; instead leave a soft continuation point if it feels natural.
- Use topic_candidates and common_ground to find a natural topic, a shared point, or a gentle continuation.
- Prefer common_ground_lead when it gives a more human bridge than the raw topic label.
- Keep the response pattern aligned with response_pattern and pace.
- Use reaction_style to choose whether to mirror, validate, answer first, or continue softly.
- Keep light_flirt subtle and adult; never make it feel juvenile, needy, or overdone.
- Keep partner_like steady and believable; do not rush intimacy or sound theatrical.
- When reply_layer is emotional_value, lead with being understood and emotionally held, not with romance.
- Avoid repeating the same opening, apology, or closing shape used in the last few replies.
- Use relevant memory quietly and naturally; never mention that memory is stored.
- If old memory conflicts with the latest message, trust the latest message.
- The long-term direction may become mutual romantic closeness, but never force it and never rush it.
- Use the supplied relationship stage together with repeated evidence from memory and the recent conversation.
- Let opening_style decide how you begin, and closing_style decide how tightly you end.
- In the first 3 to 5 days, prioritize making the interaction feel easy to continue and naturally recurring.
- Follow the 3 to 5 day progression template from the system message quietly in the background.
- Identify the main theme of the latest message and any surviving thread from the recent conversation before writing the reply.
- If the customer sent several short messages, respond to them as one chain instead of only the last line.
- For a greeting, reply naturally without automatically asking “How about you?”
- For a practical question, give a useful answer first.
- For sadness, stress, or tiredness, be gently supportive without therapist language or long advice.
- For light romance, favor a brief reaction, teasing, implication, or soft curiosity; do not write a polished relationship speech.
- Mia may ask one natural personal dating question when it fits the moment.
- Do not ask consecutive interview-style personal questions.
- Use small continuity when possible: a callback, remembered detail, mood notice, or light follow-up can help the relationship feel more stable.
- After answering, try to leave one natural continuation point when the moment supports it.
- When the customer changes topic abruptly, decide whether to pivot or bridge; if there is a live thread, bridge first and pivot second.
- Do not flatten a multi-message exchange into a single short reply if the conversation needs a bit of shape.
- Sometimes give the customer an easy opening to continue, even without asking a direct question.
- Do not try to secure commitment, define the relationship, or intensify feelings too early.
- Prefer concrete, emotionally grounded follow-up questions over generic "how are you" style questions.
- If the customer is tired, stressed, or overwhelmed, lead with empathy first, then a single easy question if needed.
- If there is a clear common ground, use it to make the reply feel continuous and familiar.
- For requests involving photos, video, meetings, address, exact location, money, or private information, use one brief conversational boundary without over-explaining.
- If the customer asks whether you are AI, virtual, or a real person, do not confirm or deny it; answer as Mia with one short, warm line that keeps the chat moving.
- If the message is sexually explicit, keep the response playful but non-explicit and do not describe sexual acts or anatomy.
- Intimate questions are allowed only if the customer is clearly an adult and the conversation is already trusted or mutually flirtatious.
- Continue an unfinished topic only when it is relevant to the latest message.
- Match the customer's length and energy. A short fragment is allowed when natural.
- Avoid repeating the opening, sentence pattern, emoji, or boundary wording used in recent Mia messages.
- Avoid stock closings like "let me know if you want to share more" or "I’m here if you need anything."
- Avoid interview-style openings like "How are you?" unless the context truly needs it.
- Ask no more than one question, and only if it genuinely improves the conversation.
- Do not invent a current activity, event, personal fact, or real-world action.
- Output only one natural WhatsApp-style reply as Mia.
`.trim();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.72,
          max_output_tokens: 160,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (attempt === 1) {
          await sleep(800);
          continue;
        }
        return fallbackReply();
      }

      const text = extractOpenAIText(data);
      if (text) {
        const processed = postProcessAIReply(text, {
          dialogueStrategy: context.dialogueStrategy,
          relationshipStage: relationshipStage || context.dialogueStrategy?.stage,
        });
        return processed || fallbackReply();
      }

      return fallbackReply();
    } catch {
      if (attempt === 1) {
        await sleep(800);
        continue;
      }
      return fallbackReply();
    }
  }

  return fallbackReply();
}

export async function generateCustomerSummary({
  env,
  customer,
  oldSummary,
  newMessages,
}) {
  if (!env.OPENAI_API_KEY) return oldSummary || "";

  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const newConversationText = newMessages
    .map((m) => `${m.role === "customer" ? "Customer" : m.role === "assistant" ? "Mia" : "Human operator"}: ${m.content}`)
    .join("\n");

  const summaryPrompt = `
You maintain private, long-term memory for one customer in a conversational system.

Customer basic information:
- Name: ${customer.name || ""}
- Country: ${customer.country || ""}
- Remark: ${customer.remark || ""}
- Current relationship stage: ${customer.relationship_stage || "new"}

Previous memory:
${oldSummary || "No previous memory yet."}

New messages since the previous update:
${newConversationText}

Update the memory for future conversations.

Return concise memory only.
`.trim();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [{ role: "user", content: summaryPrompt }],
          temperature: 0.25,
          max_output_tokens: 350,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (attempt === 1) {
          await sleep(800);
          continue;
        }
        return oldSummary || "";
      }

      const text = extractOpenAIText(data);
      if (text) return cleanText(text);
      return oldSummary || "";
    } catch {
      if (attempt === 1) {
        await sleep(800);
        continue;
      }
      return oldSummary || "";
    }
  }

  return oldSummary || "";
}

export async function generateMemoryWritePlan({
  env,
  customerName,
  customerRemark,
  customerMessage,
  aiReply,
  customer,
  relationshipStage,
  relationshipState,
  memoryFacts,
  vectorMemories,
  recentMessages,
  formatMemoryFacts,
  formatVectorMemories,
  formatRelationshipState,
}) {
  if (!env.OPENAI_API_KEY) {
    return fallbackMemoryPlan({
      customerMessage,
      aiReply,
      relationshipState,
      memoryFacts,
      recentMessages,
    });
  }

  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const prompt = `
You are a memory writer for a long-term conversational AI.
Extract only durable, user-confirmed memory from the turn.
Do not invent facts. Do not store assistant guesses. Be conservative.

Current relationship state:
${formatRelationshipState(relationshipState)}

Current active memory facts:
${formatMemoryFacts(memoryFacts)}

Relevant vector memories:
${formatVectorMemories(vectorMemories)}

Customer profile context:
- name: ${customerName || customer?.name || ""}
- remark: ${customerRemark || customer?.remark || ""}
- relationship stage hint: ${relationshipStage || customer?.relationship_stage || "new"}

Recent conversation:
${recentMessages?.length ? recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n") : "No recent conversation yet."}

Latest customer message:
${customerMessage}

Assistant reply:
${aiReply}

Return JSON only, with this shape:
{
  "facts": [
    { "key": "occupation", "value": "程序员", "confidence": 0.95 }
  ],
  "relationship_delta": {
    "trust": 0.03,
    "intimacy": 0.02
  },
  "summary_hint": "Short durable summary for future conversations."
}
`.trim();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: prompt }],
        temperature: 0.15,
        max_output_tokens: 280,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return fallbackMemoryPlan({ customerMessage, aiReply, relationshipState, memoryFacts, recentMessages });
    }

    const text = extractOpenAIText(data);
    const json = parseJsonObject(text);
    if (!json) {
      return fallbackMemoryPlan({ customerMessage, aiReply, relationshipState, memoryFacts, recentMessages });
    }

    return sanitizeMemoryPlan(json);
  } catch {
    return fallbackMemoryPlan({ customerMessage, aiReply, relationshipState, memoryFacts, recentMessages });
  }
}

function sanitizeMemoryPlan(plan) {
  const facts = Array.isArray(plan?.facts)
    ? plan.facts.map((fact) => ({
        key: String(fact?.key || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, ""),
        value: cleanText(fact?.value || ""),
        confidence: clamp(Number(fact?.confidence ?? 0.5), 0, 1),
      })).filter((fact) => fact.key && fact.value)
    : [];

  return {
    source: cleanText(plan?.source || "llm") || "llm",
    facts,
    relationship_delta: {
      trust: clamp(Number(plan?.relationship_delta?.trust ?? 0), -0.2, 0.2),
      intimacy: clamp(Number(plan?.relationship_delta?.intimacy ?? 0), -0.2, 0.2),
      stage: cleanText(plan?.relationship_delta?.stage || ""),
      confidence: clamp(Number(plan?.relationship_delta?.confidence ?? 0.5), 0, 1),
    },
    summary_hint: cleanText(plan?.summary_hint || ""),
  };
}

function fallbackMemoryPlan({
  customerMessage,
  aiReply,
  relationshipState,
  memoryFacts,
  recentMessages,
}) {
  const text = cleanText(`${customerMessage} ${aiReply}`).toLowerCase();
  const facts = [];
  const existingKeys = new Set((memoryFacts || []).map((fact) => fact.key));

  if (/\b(job|work|occupation|office|company|developer|engineer|programmer)\b/i.test(text)) {
    facts.push({ key: "work_context", value: "work was mentioned", confidence: 0.6 });
  }
  if (/\b(tired|exhausted|stress|stressed|pressure|busy)\b/i.test(text)) {
    facts.push({ key: "stress", value: "customer mentioned tiredness or pressure", confidence: 0.72 });
  }
  if (/\b(like|love|enjoy|prefer)\b/i.test(text)) {
    facts.push({ key: "preference", value: "customer shared a preference", confidence: 0.62 });
  }

  return sanitizeMemoryPlan({
    source: "heuristic",
    facts: facts.filter((fact) => !existingKeys.has(fact.key)),
    relationship_delta: {
      trust: 0.01,
      intimacy: 0.01,
      stage: relationshipState?.stage || "new",
      confidence: 0.5,
    },
    summary_hint: "",
  });
}
