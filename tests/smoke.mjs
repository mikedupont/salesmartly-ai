import assert from "node:assert/strict";
import { buildMemoryDebugResponse } from "../src/admin.js";
import { buildDialoguePolicy, buildDialogueStrategy } from "../src/dialogue.js";
import { chooseQuestionBudget, chooseQuestionProbability, chooseQuestionCooldown } from "../src/dialogue_question.js";
import { buildConversationContext } from "../src/context.js";
import { buildHealthSnapshot } from "../src/monitoring.js";
import { buildTrainingCompanionRecord, buildTrainingDpoRecords, buildTrainingMetadata, buildTrainingScenarioClass, buildTrainingSftRecord, getTrainingSamples, getTrainingStats, recordTrainingFeedback, saveTrainingSample, updateTrainingSampleAnnotation } from "../src/db.js";
import { buildIdentitySafeReply, isIdentityQuestion } from "../src/ai.js";
import { resolveMemoryFactConflicts } from "../src/memory_writer_conflicts.js";
import { applyRelationshipDelta } from "../src/memory_writer_relationship.js";
import { postProcessAIReply } from "../src/postprocess.js";
import { getRelevantVectorMemoriesByTexts } from "../src/vectorize.js";

const snapshot = buildHealthSnapshot({
  DB: {},
  VECTORIZE: {},
  OPENAI_API_KEY: "test",
  AUTO_REPLY: "true",
});

assert.equal(snapshot.db, true);
assert.equal(snapshot.vectorize, true);
assert.equal(snapshot.openai, true);
assert.equal(snapshot.autoReply, true);

const fakeEnv = {
  VECTORIZE: {
    async query() {
      return {
        matches: [
          {
            id: "a",
            score: 0.92,
            metadata: {
              chat_user_id: "u1",
              source_type: "customer_message",
              source_id: "1",
              source_text: "用户说最近很累",
              created_at: "2026-06-18T00:00:00.000Z",
            },
          },
          {
            id: "a",
            score: 0.88,
            metadata: {
              chat_user_id: "u1",
              source_type: "customer_message",
              source_id: "1",
              source_text: "用户说最近很累",
              created_at: "2026-06-17T00:00:00.000Z",
            },
          },
          {
            id: "b",
            score: 0.81,
            metadata: {
              chat_user_id: "u1",
              source_type: "conversation_summary",
              source_id: "2",
              source_text: "摘要",
              created_at: "2026-06-19T00:00:00.000Z",
            },
          },
        ],
      };
    },
  },
};

const results = await getRelevantVectorMemoriesByTexts(fakeEnv, {
  chatUserId: "u1",
  queryTexts: ["最近很累", "工作压力大"],
  limit: 10,
  embeddingFn: async () => [1, 2, 3],
});

assert.equal(results.length, 2);
assert.equal(results[0].id, "a");
assert.equal(results[1].id, "b");

const adminDb = {
  prepare(sql) {
    const text = String(sql || "");

    const makeRow = (row) => row;
    const makeResults = (results) => ({ results });

    return {
      bind(...args) {
        return {
          async first() {
            if (text.includes("FROM customers")) {
              return makeRow({
                chat_user_id: args[0],
                relationship_stage: "trusted",
                summary: "最近工作压力较大",
                remark: "夜间更适合聊天",
                updated_at: "2026-06-18T00:00:00.000Z",
              });
            }
            if (text.includes("FROM relationship_state")) {
              return makeRow({
                chat_user_id: args[0],
                stage: "trusted",
                trust: 0.66,
                intimacy: 0.58,
                confidence: 0.7,
                last_source_message_id: "12",
              });
            }
            if (text.includes("COUNT(*) AS total_count") && text.includes("FROM messages")) {
              return makeRow({
                total_count: 3,
                customer_count: 2,
                assistant_count: 1,
                first_message_at: "2026-06-17T00:00:00.000Z",
                last_message_at: "2026-06-18T00:00:00.000Z",
              });
            }
            if (text.includes("COUNT(*) AS total_count") && text.includes("FROM memory_facts")) {
              return makeRow({
                total_count: 1,
                active_count: 1,
                superseded_count: 0,
              });
            }
            if (text.includes("COUNT(*) AS total_count") && text.includes("FROM conversation_summaries")) {
              return makeRow({
                total_count: 1,
              });
            }
            if (text.includes("FROM messages") && text.includes("ORDER BY id DESC") && text.includes("LIMIT 1")) {
              return makeRow({
                id: 9,
                role: "assistant",
                content: "我懂，你最近确实比较累。",
                created_at: "2026-06-18T00:10:00.000Z",
              });
            }
            if (text.includes("FROM memory_facts") && text.includes("ORDER BY id DESC") && text.includes("LIMIT 1")) {
              return makeRow({
                id: 7,
                fact_key: "work_pressure",
                fact_value: "较高",
                confidence: 0.92,
                status: "active",
                created_at: "2026-06-18T00:05:00.000Z",
              });
            }
            if (text.includes("FROM conversation_summaries") && text.includes("ORDER BY id DESC") && text.includes("LIMIT 1")) {
              return makeRow({
                id: 4,
                summary_text: "最近主要在讨论工作压力和作息。",
                created_at: "2026-06-18T00:09:00.000Z",
              });
            }
            if (text.includes("FROM memory_facts") && text.includes("status = 'active'")) {
              return makeResults([
                { fact_key: "work_pressure", fact_value: "较高", confidence: 0.92, updated_at: "2026-06-18T00:05:00.000Z" },
              ]);
            }
            if (text.includes("FROM memory_facts")) {
              return makeResults([
                {
                  id: 7,
                  fact_key: "work_pressure",
                  fact_value: "较高",
                  confidence: 0.92,
                  status: "active",
                  source_message_id: "12",
                  source_message_role: "customer",
                  created_at: "2026-06-18T00:05:00.000Z",
                  updated_at: "2026-06-18T00:05:00.000Z",
                },
              ]);
            }
            if (text.includes("FROM conversation_summaries")) {
              return makeResults([
                {
                  id: 4,
                  start_message_id: "1",
                  end_message_id: "12",
                  summary_text: "最近主要在讨论工作压力和作息。",
                  created_at: "2026-06-18T00:09:00.000Z",
                },
              ]);
            }
            return null;
          },
          async all() {
            if (text.includes("FROM messages")) {
              return makeResults([
                { role: "customer", status: "received", content: "我最近很累", created_at: "2026-06-17T00:00:00.000Z" },
                { role: "assistant", status: "sent", content: "我懂，你最近辛苦了。", created_at: "2026-06-17T00:01:00.000Z" },
              ]);
            }
            if (text.includes("FROM memory_facts")) {
              return makeResults([
                {
                  id: 7,
                  fact_key: "work_pressure",
                  fact_value: "较高",
                  confidence: 0.92,
                  status: "active",
                  source_message_id: "12",
                  source_message_role: "customer",
                  created_at: "2026-06-18T00:05:00.000Z",
                  updated_at: "2026-06-18T00:05:00.000Z",
                },
              ]);
            }
            if (text.includes("FROM conversation_summaries")) {
              return makeResults([
                {
                  id: 4,
                  start_message_id: "1",
                  end_message_id: "12",
                  summary_text: "最近主要在讨论工作压力和作息。",
                  created_at: "2026-06-18T00:09:00.000Z",
                },
              ]);
            }
            return makeResults([]);
          },
          run: async () => ({ success: true }),
        };
      },
    };
  },
};

const debugEnv = {
  DB: adminDb,
  VECTORIZE: fakeEnv.VECTORIZE,
};

const debugResult = await buildMemoryDebugResponse(debugEnv, {
  chatUserId: "u1",
  query: "最近很累",
  limits: {
    factsLimit: 5,
    factHistoryLimit: 5,
    recentMessagesLimit: 5,
    summaryLimit: 5,
    vectorLimit: 5,
  },
  embeddingFn: async () => [1, 2, 3],
});

assert.equal(debugResult.ok, true);
assert.equal(debugResult.activeFacts.length, 1);
assert.equal(debugResult.factHistory.length, 1);
assert.equal(debugResult.conversationSummaries.length, 1);
assert.equal(debugResult.vectorQueryTexts.length >= 1, true);
assert.equal(debugResult.vectorMemories.length, 2);
assert.equal(debugResult.dialogueStrategy.shouldAsk, true);
assert.equal(debugResult.dialogueStrategy.intent, "support");
assert.equal(Boolean(debugResult.contextPreview?.contextText), true);

const strategy = buildDialogueStrategy({
  customerMessage: "我最近很累，晚上也睡不好",
  customerSummary: "最近主要聊工作压力",
  memoryFacts: [
    { key: "hobby", value: "健身" },
    { key: "preferred_chat_time", value: "晚上" },
  ],
  vectorMemories: [{ sourceType: "customer_message", text: "工作压力大" }],
  relationshipState: { stage: "trusted", trust: 0.7, intimacy: 0.6 },
  recentMessages: [{ role: "customer", content: "最近很累" }],
});

assert.equal(strategy.intent, "support");
assert.equal(strategy.shouldAsk, true);
assert.equal(strategy.questionBudget, 1);
assert.equal(strategy.questionCooldown >= 0, true);
assert.equal(strategy.questionProbability >= 0, true);
assert.equal(Array.isArray(strategy.topicCandidates), true);
assert.equal(strategy.topicCandidates.length > 0, true);
assert.equal(Boolean(strategy.topicTrack?.primary), true);
assert.equal(Boolean(strategy.paceGuide?.pattern), true);
assert.equal(Boolean(strategy.openingStyle), true);
assert.equal(Boolean(strategy.closingStyle), true);

const policy = buildDialoguePolicy({
  customerMessage: "我最近很累，能聊聊吗",
  customerSummary: "最近主要在聊工作压力",
  memoryFacts: [{ key: "hobby", value: "健身" }],
  vectorMemories: [{ sourceType: "customer_message", text: "工作压力大" }],
  relationshipState: { stage: "trusted", trust: 0.7, intimacy: 0.6 },
  recentMessages: [{ role: "customer", content: "最近很累" }],
});

assert.equal(Boolean(policy.empathyMode), true);
assert.equal(Boolean(policy.activeThread), true);
assert.equal(Boolean(policy.commonGroundLead), true);
assert.equal(Boolean(policy.conversationMove), true);
assert.equal(policy.replyLayer, "emotional_value");

const flirtPolicy = buildDialoguePolicy({
  customerMessage: "我刚坐下，今晚挺安静的",
  customerSummary: "晚上更容易聊",
  memoryFacts: [{ key: "coffee", value: "喜欢咖啡" }],
  vectorMemories: [],
  relationshipState: { stage: "trusted", trust: 0.72, intimacy: 0.58 },
  recentMessages: [{ role: "customer", content: "我刚坐下，今晚挺安静的" }],
});

assert.equal(flirtPolicy.replyLayer, "light_flirt");

const partnerPolicy = buildDialoguePolicy({
  customerMessage: "我今天有点累",
  customerSummary: "晚上常常聊天",
  memoryFacts: [],
  vectorMemories: [],
  relationshipState: { stage: "stable_companion", trust: 0.9, intimacy: 0.88 },
  recentMessages: [{ role: "customer", content: "我今天有点累" }],
});

assert.equal(partnerPolicy.replyLayer, "partner_like");

const context = buildConversationContext({
  customerName: "Mia",
  customerRemark: "night chats",
  customerMessage: "我最近很累",
  customerSummary: "最近一直在聊工作压力",
  memoryFacts: [{ key: "hobby", value: "健身", confidence: 0.9 }],
  vectorMemories: [{ sourceType: "customer_message", text: "工作压力大", similarity: 0.92 }],
  relationshipState: { stage: "trusted", trust: 0.7, intimacy: 0.6 },
  recentMessages: [{ role: "customer", content: "我最近很累" }],
  formatRecentConversation: (messages) => (messages || []).map((message) => `${message.role}: ${message.content}`).join("\n"),
  formatMemoryFacts: (facts) => (facts || []).map((fact) => `- ${fact.key}: ${fact.value}`).join("\n"),
  formatVectorMemories: (memories) => (memories || []).map((memory) => `- ${memory.text}`).join("\n"),
  formatRelationshipState: (state) => `- stage: ${state?.stage || "new"}\n- trust: ${Number(state?.trust || 0).toFixed(2)}`,
});

assert.equal(Boolean(context.contextText), true);
assert.equal(Boolean(context.sections?.persona), true);
assert.equal(Boolean(context.sections?.policy), true);
assert.equal(/reply_layer/i.test(context.sections?.policy || ""), true);

const trainingMetadata = buildTrainingMetadata({
  chatUserId: "u1",
  sampleStage: "trusted",
  sampleIntent: "support",
  replyLayer: "partner_like",
  emotionalGoal: "comfort_and_validation",
  flirtationLevel: "light",
});

assert.equal(trainingMetadata.reply_layer, "partner_like");
assert.equal(trainingMetadata.emotional_goal, "comfort_and_validation");
assert.equal(trainingMetadata.flirtation_level, "light");

const companionRecord = buildTrainingCompanionRecord({
  chatUserId: "u1",
  sampleStage: "trusted",
  sampleIntent: "support",
  replyLayer: "partner_like",
  emotionalGoal: "comfort_and_validation",
  flirtationLevel: "light",
  customerInput: "I had a rough day at work.",
  customerSummary: "Work has been draining lately.",
  assistantOutput: "Yeah, that sounds heavy.",
});

assert.equal(companionRecord.schema_version, "companion_v1");
assert.equal(companionRecord.product_track, "45plus_us_men");
assert.equal(companionRecord.scenario_class, "partner_like_continuity");
assert.equal(companionRecord.audience_profile.gender, "male");
assert.equal(companionRecord.relationship_profile.mode, "partner_like");
assert.equal(companionRecord.conversation_goal.reply_layer, "partner_like");
assert.equal(companionRecord.response.assistant_output, "Yeah, that sounds heavy.");

assert.equal(buildTrainingScenarioClass({
  sampleStage: "new",
  sampleIntent: "support",
  customerInput: "I had a rough day at work.",
}), "work_fatigue");

assert.equal(buildTrainingScenarioClass({
  sampleStage: "trusted",
  sampleIntent: "smalltalk",
  replyLayer: "light_flirt",
  customerInput: "I was thinking about you tonight.",
}), "light_flirt");

const processedReply = postProcessAIReply("Mia: I hear you?? Let me think about it??", {
  dialogueStrategy: { shouldAsk: false },
});

assert.equal(processedReply.includes("?"), false);
assert.equal(processedReply.startsWith("Mia:"), false);

const normalizedReply = postProcessAIReply("I'm an AI assistant, but I'm here to chat.", {
  dialogueStrategy: { shouldAsk: false },
});

assert.equal(/ai assistant/i.test(normalizedReply), false);

const hiddenIdentityReply = postProcessAIReply("I'm a virtual assistant, not a real person.", {
  dialogueStrategy: { shouldAsk: false },
});

assert.equal(/virtual|assistant|real person/i.test(hiddenIdentityReply), false);

assert.equal(isIdentityQuestion("are you a real person?"), true);
assert.equal(isIdentityQuestion("what should I cook tonight?"), false);
assert.equal(/ai|bot|virtual|assistant|real person/i.test(buildIdentitySafeReply()), false);

const stockEndingReply = postProcessAIReply("Sure — let me know if you need anything.", {
  dialogueStrategy: { shouldAsk: false },
});

assert.equal(/let me know if you need anything/i.test(stockEndingReply), false);

const cappedQuestionReply = postProcessAIReply("I can help with that? Maybe try it this way? And then what?", {
  dialogueStrategy: { shouldAsk: true, questionBudget: 1 },
});

assert.equal((cappedQuestionReply.match(/[?？]/g) || []).length <= 1, true);

const cadenceReply = postProcessAIReply("Honestly, I think that it sounds like you are just very tired, and I feel that too.", {
  dialogueStrategy: { shouldAsk: false, casualness: "light" },
});

assert.equal(/\bjust\b/i.test(cadenceReply), false);
assert.equal(/it sounds like/i.test(cadenceReply), false);

const casualPolicy = buildDialoguePolicy({
  customerMessage: "ok cool",
  customerSummary: "",
  memoryFacts: [],
  vectorMemories: [],
  relationshipState: { stage: "new", trust: 0.2, intimacy: 0.1 },
  recentMessages: [{ role: "customer", content: "ok cool" }],
});

assert.equal(casualPolicy.casualness, "light");
assert.equal(casualPolicy.shouldAsk, false);
assert.equal(casualPolicy.conversationMove, "light_acknowledgement");

const greetingPolicy = buildDialoguePolicy({
  customerMessage: "hi",
  customerSummary: "",
  memoryFacts: [],
  vectorMemories: [],
  relationshipState: { stage: "new", trust: 0.1, intimacy: 0.05 },
  recentMessages: [{ role: "customer", content: "hi" }],
});

assert.equal(greetingPolicy.shouldAsk, false);
assert.equal(greetingPolicy.goal, "keep_warm");
assert.equal(greetingPolicy.questionCooldown >= 0, true);

const budget = chooseQuestionBudget({
  intent: "smalltalk",
  latest: "hi",
  stage: "new",
  topics: [],
  commonGround: [],
  recentMessages: [],
});

assert.equal(budget, 0);

const questionProbability = chooseQuestionProbability({
  intent: "smalltalk",
  stage: "new",
  topics: [],
  commonGround: [],
  recentMessages: [{ role: "assistant", content: "How are you?" }],
});

assert.equal(questionProbability < 0.5, true);

const questionCooldown = chooseQuestionCooldown({
  stage: "new",
  recentMessages: [{ role: "assistant", content: "How are you?" }],
  recentAssistantQuestions: 1,
});

assert.equal(questionCooldown >= 1, true);

const nextState = applyRelationshipDelta({ stage: "new", trust: 0.3, intimacy: 0.2 }, {
  trust: 0.08,
  intimacy: 0.06,
});

assert.equal(nextState.stage, "familiar");
assert.equal(nextState.trust > 0.3, true);

const trainingDb = {
  _samples: [],
  _feedback: [],
  prepare(sql) {
    const text = String(sql || "");
    return {
      bind: (...args) => ({
        async run() {
          if (text.includes("INSERT INTO training_samples")) {
            trainingDb._samples.push({
              id: trainingDb._samples.length + 1,
              chat_user_id: args[0],
              session_id: args[1],
              source_message_id: args[2],
              prompt_version: args[3],
              sample_stage: args[4],
              sample_intent: args[5],
              customer_input: args[6],
              assistant_output: args[7],
              candidate_replies_json: args[8],
              chosen_reply_index: args[9],
              question_budget: args[10],
              opening_style: args[11],
              closing_style: args[12],
              scenario_class: args[13],
              strategy_snapshot_json: args[14],
              context_snapshot_json: args[15],
              feedback_score: null,
              feedback_label: "",
              feedback_note: "",
              created_at: "2026-06-19T00:00:00.000Z",
              updated_at: "2026-06-19T00:00:00.000Z",
            });
          }
          if (text.includes("INSERT INTO training_feedback")) {
            trainingDb._feedback.push({
              id: trainingDb._feedback.length + 1,
              sample_id: args[0],
              chat_user_id: args[1],
              feedback_type: args[2],
              score: args[3],
              note: args[4],
              created_at: "2026-06-19T00:00:00.000Z",
            });
          }
          if (text.includes("UPDATE training_samples") && text.includes("candidate_replies_json")) {
            const sample = trainingDb._samples.find((item) => item.id === args[10]);
            if (sample) {
              sample.candidate_replies_json = args[0] || sample.candidate_replies_json;
              sample.chosen_reply_index = args[1] ?? sample.chosen_reply_index;
              sample.sample_stage = args[3] || sample.sample_stage;
              sample.feedback_label = args[5] || sample.feedback_label;
              sample.feedback_note = args[7] || sample.feedback_note;
              sample.scenario_class = args[8] || sample.scenario_class;
              sample.updated_at = "2026-06-19T00:00:00.000Z";
            }
          }
          if (text.includes("UPDATE training_samples") && !text.includes("candidate_replies_json")) {
            const sample = trainingDb._samples.find((item) => item.id === args[5]);
            if (sample) {
              sample.feedback_score = args[0];
              sample.feedback_label = args[2] || sample.feedback_label;
              sample.feedback_note = args[4] || sample.feedback_note;
              sample.updated_at = "2026-06-19T00:00:00.000Z";
            }
          }
          return { success: true };
        },
        async first() {
          if (text.includes("FROM training_samples") && text.includes("COUNT(*) AS total_count")) {
            return {
              total_count: trainingDb._samples.length,
              labeled_count: trainingDb._samples.filter((item) => item.chosen_reply_index >= 0).length,
              scored_count: trainingDb._samples.filter((item) => item.feedback_score !== null).length,
              avg_score: null,
            };
          }
          if (text.includes("FROM training_feedback") && text.includes("COUNT(*) AS total_count")) {
            return {
              total_count: trainingDb._feedback.length,
              avg_score: null,
            };
          }
          if (text.includes("FROM training_samples") && text.includes("ORDER BY id DESC") && text.includes("LIMIT 1")) {
            return trainingDb._samples[trainingDb._samples.length - 1] || null;
          }
          if (text.includes("FROM training_feedback") && text.includes("ORDER BY id DESC") && text.includes("LIMIT 1")) {
            return trainingDb._feedback[trainingDb._feedback.length - 1] || null;
          }
          return null;
        },
        async all() {
          if (text.includes("FROM training_samples")) {
            if (text.includes("GROUP BY scenario_class")) {
              const counts = new Map();
              for (const sample of trainingDb._samples) {
                const key = String(sample.scenario_class || "").trim();
                if (!key) continue;
                counts.set(key, (counts.get(key) || 0) + 1);
              }
              return {
                results: Array.from(counts.entries())
                  .map(([scenario_class, count]) => ({ scenario_class, count }))
                  .sort((a, b) => b.count - a.count || String(a.scenario_class).localeCompare(String(b.scenario_class))),
              };
            }
            let rows = trainingDb._samples.slice().reverse().map((sample) => ({ ...sample }));
            if (text.includes("chosen_reply_index < 0")) {
              rows = rows.filter((sample) => Number(sample.chosen_reply_index) < 0 || String(sample.candidate_replies_json || "[]") === "[]");
            } else if (text.includes("chosen_reply_index >= 0")) {
              rows = rows.filter((sample) => Number(sample.chosen_reply_index) >= 0);
            }
            return { results: rows };
          }
          return { results: [] };
        },
      }),
    };
  },
};

await saveTrainingSample({
  env: { DB: trainingDb },
  chatUserId: "u1",
  sessionId: "s1",
  sourceMessageId: "m1",
  sampleStage: "new",
  sampleIntent: "smalltalk",
  customerInput: "hi",
  assistantOutput: "Hey there!",
  candidateRepliesJson: ["Hey there!", "Hello!", "Hi, nice to see you."],
  chosenReplyIndex: -1,
  questionBudget: 0,
  openingStyle: "light_entry",
  closingStyle: "gentle_stop",
  strategySnapshot: { intent: "smalltalk" },
  contextSnapshot: { persona: {}, memory: {} },
  scenarioClass: "light_flirt",
});

assert.equal(trainingDb._samples.length, 1);
assert.equal(trainingDb._samples[0].scenario_class, "light_flirt");

await recordTrainingFeedback({
  env: { DB: trainingDb },
  sampleId: 1,
  chatUserId: "u1",
  feedbackType: "thumb_up",
  score: 0.95,
  note: "natural",
});

assert.equal(trainingDb._feedback.length, 1);

const trainingSamples = await getTrainingSamples({ DB: trainingDb }, "u1", 10);
assert.equal(trainingSamples.length, 1);
assert.equal(trainingSamples[0].assistantOutput, "Hey there!");
assert.equal(trainingSamples[0].scenarioClass, "light_flirt");

const trainingStats = await getTrainingStats({ DB: trainingDb }, "u1");
assert.equal(trainingStats.sampleCounts.total, 1);
assert.equal(trainingStats.feedbackCounts.total, 1);
assert.equal(trainingStats.sampleCounts.labeled, 0);
assert.equal(buildTrainingScenarioClass({
  scenarioClass: "mutual_affection",
  sampleStage: "new",
  sampleIntent: "support",
  customerInput: "hello",
}), "mutual_affection");

await updateTrainingSampleAnnotation({
  env: { DB: trainingDb },
  sampleId: 1,
  chatUserId: "u1",
  candidateReplies: ["Hey there!", "No thanks."],
  chosenReplyIndex: 0,
  sampleStage: "labeled",
  scenarioClass: "partner_like_continuity",
});

assert.equal(trainingDb._samples[0].chosen_reply_index, 0);
assert.equal(JSON.parse(trainingDb._samples[0].candidate_replies_json)[0], "Hey there!");
assert.equal(trainingDb._samples[0].scenario_class, "partner_like_continuity");

await saveTrainingSample({
  env: { DB: trainingDb },
  chatUserId: "u1",
  sessionId: "s2",
  sourceMessageId: "m2",
  sampleStage: "new",
  sampleIntent: "smalltalk",
  customerInput: "hello again",
  assistantOutput: "Hey again!",
  candidateRepliesJson: ["Hey again!", "Hello again!"],
  chosenReplyIndex: -1,
  questionBudget: 0,
  openingStyle: "light_entry",
  closingStyle: "gentle_stop",
  strategySnapshot: { intent: "smalltalk" },
  contextSnapshot: { persona: {}, memory: {} },
  scenarioClass: "work_fatigue",
});

assert.equal(trainingDb._samples.length, 2);

const labeledSamples = await getTrainingSamples({ DB: trainingDb }, "u1", 10, "labeled");
const unlabeledSamples = await getTrainingSamples({ DB: trainingDb }, "u1", 10, "unlabeled");
assert.equal(labeledSamples.length, 1);
assert.equal(unlabeledSamples.length, 1);

const updatedStats = await getTrainingStats({ DB: trainingDb }, "u1");
assert.equal(updatedStats.sampleCounts.total, 2);
assert.equal(updatedStats.sampleCounts.labeled, 1);
assert.equal(updatedStats.scenarioCounts.some((item) => item.scenarioClass === "work_fatigue"), true);

const sftRecord = buildTrainingSftRecord({
  id: 12,
  chatUserId: "u1",
  sessionId: "s1",
  sourceMessageId: "m1",
  sampleStage: "familiar",
  sampleIntent: "smalltalk",
  customerInput: "I had a rough day at work.",
  assistantOutput: "That sounds exhausting.",
  questionBudget: 1,
  openingStyle: "warm_acknowledgement",
  closingStyle: "open_finish",
  feedbackScore: 0.9,
  feedbackLabel: "thumb_up",
});

assert.equal(sftRecord.type, "sft");
assert.equal(sftRecord.messages.length, 3);
assert.equal(sftRecord.messages[1].content, "I had a rough day at work.");
assert.equal(sftRecord.metadata.schema_version, "training_v1");
assert.equal(sftRecord.schema_version, "companion_v1");
assert.equal(sftRecord.audience_profile.age_band, "45_plus");
assert.equal(sftRecord.metadata.scenario_class, "work_fatigue");

const dpoRecords = buildTrainingDpoRecords({
  id: 12,
  chatUserId: "u1",
  sessionId: "s1",
  sourceMessageId: "m1",
  sampleStage: "familiar",
  sampleIntent: "smalltalk",
  customerInput: "I had a rough day at work.",
  assistantOutput: "That sounds exhausting.",
  candidateRepliesJson: [
    "That sounds exhausting.",
    "I am here if you need anything.",
    "Sorry to hear that. Let me know if I can help.",
  ],
  chosenReplyIndex: 0,
});

assert.equal(dpoRecords.length, 2);
assert.equal(dpoRecords[0].type, "dpo");
assert.equal(dpoRecords[0].chosen, "That sounds exhausting.");
assert.equal(dpoRecords[0].schema_version, "companion_v1");

const resolvedFacts = resolveMemoryFactConflicts([
  { key: "job", value: "程序员", confidence: 0.9 },
  { key: "job", value: "开发者", confidence: 0.5 },
  { key: "hobby", value: "健身", confidence: 0.7 },
], [
  { key: "job", value: "程序员", confidence: 0.8 },
]);

assert.equal(resolvedFacts.length, 2);
assert.equal(resolvedFacts[0].key, "job");

console.log("smoke ok");
