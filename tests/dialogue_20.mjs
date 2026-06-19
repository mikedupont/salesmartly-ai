import assert from "node:assert/strict";
import { buildDialogueStrategy } from "../src/dialogue.js";
import { postProcessAIReply } from "../src/postprocess.js";

function countQuestionMarks(text) {
  return String(text || "").match(/[?？]/g)?.length || 0;
}

const scenarios = [
  {
    label: "support-new-work-pressure",
    input: {
      customerMessage: "我最近很累，工作也压得我有点喘不过气",
      customerSummary: "最近工作压力比较大",
      relationshipState: { stage: "new" },
    },
    reply: "我懂，你最近辛苦了。要不要说说最累的部分？",
    expect: { intent: "support", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "support-familiar-tired",
    input: {
      customerMessage: "我今天真的有点累",
      customerSummary: "最近状态偏疲惫",
      relationshipState: { stage: "familiar" },
    },
    reply: "听起来你今天扛了不少。要不要先慢一点？",
    expect: { intent: "support", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "support-new-after-question",
    input: {
      customerMessage: "我最近很累",
      customerSummary: "最近工作压力比较大",
      relationshipState: { stage: "new" },
      recentMessages: [
        { role: "assistant", content: "你想先说说最累的部分吗？" },
      ],
    },
    reply: "我懂，你最近辛苦了。先慢一点也可以。",
    expect: { intent: "support", shouldAsk: false, questionBudget: 0 },
  },
  {
    label: "support-burst-restrained",
    input: {
      customerMessage: "我最近很累",
      customerSummary: "最近工作压力比较大",
      relationshipState: { stage: "familiar" },
      recentMessages: [
        { role: "assistant", content: "你想先说说最累的部分吗？" },
        { role: "customer", content: "嗯" },
        { role: "assistant", content: "那现在最想先处理哪一块呢？" },
      ],
    },
    reply: "你先缓一下也行。我们慢慢来。",
    expect: { intent: "support", shouldAsk: false, questionBudget: 0 },
  },
  {
    label: "practical-question",
    input: {
      customerMessage: "我该怎么办，先回哪条消息？",
      customerSummary: "今天消息很多",
      relationshipState: { stage: "new" },
    },
    reply: "先回最急的那条吧。你想我帮你排一下优先级吗？",
    expect: { intent: "practical", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "practical-short",
    input: {
      customerMessage: "我该怎么先静音一下",
      customerSummary: "今天消息很多",
      relationshipState: { stage: "trusted" },
    },
    reply: "先静音一会儿也可以，等你缓过来再看。",
    expect: { intent: "practical", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "practical-long-no-question",
    input: {
      customerMessage: "我该怎么把现在这几个事情都放一放，等晚点再统一处理",
      customerSummary: "今天消息很多",
      relationshipState: { stage: "familiar" },
    },
    reply: "可以先把最急的那件单独拿出来，剩下的晚点再看。",
    expect: { intent: "practical", shouldAsk: false, questionBudget: 0 },
  },
  {
    label: "smalltalk-new-greeting",
    input: {
      customerMessage: "你好",
      customerSummary: "最近状态正常",
      relationshipState: { stage: "new" },
    },
    reply: "你好，今天过得怎么样？",
    expect: { intent: "smalltalk", shouldAsk: false, questionBudget: 0 },
  },
  {
    label: "smalltalk-new-greeting-question",
    input: {
      customerMessage: "你好，今天忙吗？",
      customerSummary: "最近状态正常",
      relationshipState: { stage: "new" },
    },
    reply: "还好，刚好有空。你呢？",
    expect: { intent: "smalltalk", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "smalltalk-familiar-coffee",
    input: {
      customerMessage: "咖啡好了",
      customerSummary: "最近状态还可以",
      relationshipState: { stage: "familiar" },
    },
    reply: "听起来是个不错的暂停。你今天总算能歇一会儿了。",
    expect: { intent: "smalltalk", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "smalltalk-familiar-no-topic",
    input: {
      customerMessage: "我刚坐下来",
      customerSummary: "最近状态还可以",
      relationshipState: { stage: "familiar" },
    },
    reply: "听起来挺安稳的，先歇会儿也不错。",
    expect: { intent: "smalltalk", shouldAsk: false, questionBudget: 0 },
  },
  {
    label: "explore-new-long-mood",
    input: {
      customerMessage: "我今天一直有点乱，脑子里很多事绕在一起",
      customerSummary: "最近状态不太稳",
      relationshipState: { stage: "new" },
    },
    reply: "听起来你今天被很多事情拉着走。你想先从最重的那块说起吗？",
    expect: { intent: "explore", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "explore-new-question",
    input: {
      customerMessage: "为什么我一到晚上就更难静下来？",
      customerSummary: "最近状态不太稳",
      relationshipState: { stage: "new" },
    },
    reply: "也许是白天压着的东西到了晚上才冒出来。你觉得更像累，还是更像空？",
    expect: { intent: "explore", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "explore-familiar-bridge",
    input: {
      customerMessage: "我今天有点乱，脑子一直停不下来",
      customerSummary: "最近工作安排很多",
      relationshipState: { stage: "familiar" },
    },
    reply: "听上去你今天被工作和疲惫一起压住了。先挑最重的那块说也行。",
    expect: { intent: "explore", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "explore-trusted-shared-ground",
    input: {
      customerMessage: "我今天有点乱，脑子一直停不下来",
      customerSummary: "最近工作安排很多",
      relationshipState: { stage: "trusted" },
    },
    reply: "听上去你今天被工作和疲惫一起压住了。先挑最重的那块说也行。",
    expect: { intent: "explore", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "explore-common-ground-question",
    input: {
      customerMessage: "晚上安静下来后，我反而更容易想很多",
      customerSummary: "最近也常常熬到很晚",
      relationshipState: { stage: "familiar" },
    },
    reply: "晚上确实更容易把白天的东西放大。你一般会先想哪一件？",
    expect: { intent: "explore", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "explore-work-topic",
    input: {
      customerMessage: "工作上的压力一直没停",
      customerSummary: "最近工作很忙",
      relationshipState: { stage: "trusted" },
    },
    reply: "听起来工作一直在占着你。你想先处理最急的，还是先缓一缓？",
    expect: { intent: "support", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "smalltalk-trusted-continuity",
    input: {
      customerMessage: "安静待着",
      customerSummary: "最近聊得比较多",
      relationshipState: { stage: "trusted" },
    },
    reply: "听起来挺舒服的，安静一点也不错。",
    expect: { intent: "smalltalk", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "practical-with-template-ending",
    input: {
      customerMessage: "我该怎么晚点再处理",
      customerSummary: "今天很忙",
      relationshipState: { stage: "familiar" },
    },
    reply: "可以晚点再看。Let me know if you need anything.",
    expect: { intent: "practical", shouldAsk: true, questionBudget: 1 },
  },
  {
    label: "support-double-question-reduced",
    input: {
      customerMessage: "我最近很累",
      customerSummary: "最近工作压力比较大",
      relationshipState: { stage: "new" },
    },
    reply: "你更想先聊工作，还是先缓一下？要不要我陪你慢慢拆开？",
    expect: { intent: "support", shouldAsk: true, questionBudget: 1 },
  },
];

for (const scenario of scenarios) {
  const strategy = buildDialogueStrategy({
    customerMessage: scenario.input.customerMessage,
    customerSummary: scenario.input.customerSummary,
    memoryFacts: scenario.input.memoryFacts || [],
    vectorMemories: scenario.input.vectorMemories || [],
    relationshipState: scenario.input.relationshipState || {},
    recentMessages: scenario.input.recentMessages || [],
  });

  assert.equal(strategy.intent, scenario.expect.intent, `${scenario.label}: intent`);
  assert.equal(strategy.shouldAsk, scenario.expect.shouldAsk, `${scenario.label}: shouldAsk`);
  assert.equal(strategy.questionBudget, scenario.expect.questionBudget, `${scenario.label}: questionBudget`);
  assert.equal(countQuestionMarks(strategy.questionFocus), 0, `${scenario.label}: questionFocus should be text only`);

  const processed = postProcessAIReply(scenario.reply, {
    dialogueStrategy: strategy,
    relationshipStage: scenario.input.relationshipState?.stage,
  });

  const questionCount = countQuestionMarks(processed);
  if (!strategy.shouldAsk) {
    assert.equal(questionCount, 0, `${scenario.label}: no question marks expected`);
  } else {
    assert.ok(questionCount <= strategy.questionBudget, `${scenario.label}: question budget exceeded`);
  }

  assert.equal(/let me know if you need anything/i.test(processed), false, `${scenario.label}: template ending removed`);
  assert.equal(/i'm here if you want to share more/i.test(processed), false, `${scenario.label}: template ending removed`);
  assert.equal(/as an? ai/i.test(processed), false, `${scenario.label}: ai disclaimer removed`);
}

console.log(JSON.stringify({ scenarios: scenarios.length, status: "ok" }, null, 2));
