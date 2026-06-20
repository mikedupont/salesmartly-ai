# salesmartly-ai

一个运行在 Cloudflare Workers 上的长期记忆型 AI 情感陪伴后端。

这个项目的核心目标，不是做一个只会“即时回复”的机器人，而是做一个面向 45+ 美国男性的长期情感陪伴型 AI，可以长期记住用户、维护关系状态、在多轮对话中保持连续感，并提供稳定的情绪价值、轻暧昧互动和伴侣式陪伴体验。

## 项目定位

它现在更像一个“带记忆的情感陪伴中枢”：

- 记住用户是谁
- 记住最近聊过什么
- 记住关系处于什么阶段
- 根据事实记忆和语义记忆组织回复
- 根据对话策略决定要不要提问、找话题、找共同点、制造共鸣
- 根据关系推进决定要不要提供情绪价值、轻度暧昧或更像男女朋友的互动
- 通过 Context Builder 统一拼装 persona、memory、relationship 和 safety
- 通过 Dialogue Policy Engine 决定提问、找话题、找共同点、制造共鸣和节奏
- 通过 Post-processing 做回复收敛和问句控制
- 通过 Memory Writer 编排层把事实、向量、关系和摘要分开写回
- 摘要任务按 `last_summarized_message_id` 增量更新，不再空转旧消息
- 身份追问会走专用安全分支，默认不自曝、不解释系统实现，只用简短角色内回复带回聊天
- 通过后台接口方便排查和调试

## 当前已经实现的能力

- 接收 SaleSmartly webhook 消息
- 自动生成 AI 回复
- 把对话消息存到 D1
- 维护结构化事实记忆
- 维护关系状态机
- 维护对话摘要
- 维护向量记忆并做相似召回
- 向量记忆已迁移到 Cloudflare Vectorize
- 已完成 Dialogue Policy Engine 拆分，覆盖提问、找话题、找共同点、制造共鸣和节奏控制
- 已完成 Post-processing 拆分，覆盖归一化、语气、边界、问句预算、长度和口语节奏
- 已完成 Memory Writer 拆分，覆盖事实、向量、关系、摘要和冲突处理
- 已加入身份追问防漏机制：当用户追问是否 AI / 虚拟 / 真人时，系统会直接返回短回复，不进入普通生成链路
- 当前产品目标聚焦于 45+ 美国男性的长期情感陪伴场景，支持情绪价值、轻度暧昧和更接近男女朋友的关系推进
- 支持定时摘要任务
- 支持自动回复和人工接管式扩展
- 支持 `/admin` 记忆查看页
- 支持 `/admin/memory` 记忆调试接口
- 支持 `/admin/memory/facts` 人物经历查看 / 手动写入
- 支持 `/admin/training` 训练样本查看
- 支持 `/admin/training/export` 训练集导出
- 支持 `/admin/training/feedback` 偏好反馈写回
- 支持 `/admin/training/annotate` 标注写回
- 支持 `/admin/training/purge` 训练数据清空
- 支持 `/admin/training/auto` 自动训练包预览 / 手动触发
- 支持定时任务自动组合真实数据、FlirtFlip 和 EmpatheticDialogues
- 支持 `/health` 监控快照
- 已支持 FlirtFlip 线上查看 / 导入 / 导出
  - `/admin/flirtflip`
  - `/admin/flirtflip/export`
  - `/admin/flirtflip/import`
  - `/admin/flirtflip/sync`
- 已支持 EmpatheticDialogues 线上查看 / 导入 / 导出
  - `/admin/empathetic`
  - `/admin/empathetic/export`
  - `/admin/empathetic/import`
  - `/admin/empathetic/sync`
- 已补充 FlirtFlip 在线同步脚本
  - `scripts/generate_flirtflip_seeds.mjs`
  - `scripts/import_flirtflip_online.mjs`
  - `scripts/import_flirtflip_supplement_online.mjs`
- 已补充 EmpatheticDialogues 在线同步脚本
  - `scripts/generate_empathetic_dialogues_seed.py`
  - `scripts/import_empathetic_dialogues_online.mjs`

## 模型对齐路线

当前线上系统主要依赖：

- `Dialogue Policy Engine` 做策略控制
- `Context Builder` 做上下文拼装
- `Post-processing` 做语言收敛
- `Memory Writer` 做长期记忆写回

如果后续要把“模型本身”也训练得更像真人，建议走下面这条更成熟的路线：

1. 先收集真实聊天偏好样本
   - 同一输入配多条候选回复
   - 标出哪条更自然、更少 AI 味、更符合陪伴语气

2. 再做轻量监督微调
   - 用 LoRA / PEFT 之类的参数高效微调
   - 先让模型学会你想要的说话风格

3. 再做偏好优化
   - 用 DPO 或 RLHF 把“像人”的回复往上推
   - 把“客服味、追问过多、收尾太满”的回复往下压

4. 最后保留推理期策略层兜底
   - 训练负责把底子调顺
   - 策略层负责避免再跑偏
   - 后处理只做最后清理，不承担主逻辑

如果你要继续按现在这条路线落地训练闭环，可以直接看 [`docs/TRAINING_IMPLEMENTATION.md`](docs/TRAINING_IMPLEMENTATION.md)。

如果你要走“全自动版”，直接配置 `TRAINING_AUTO_EXPORT=true` 和 `TRAINING_TRIGGER_URL`，Worker 就会定时打包训练数据并自动推给外部训练器，不需要再手动导出。

当前公开对话库已做过一次清理，当前总量是：

- `FlirtFlip`：`9996` 条
- `EmpatheticDialogues`：`9605` 条

当前 FlirtFlip 在线数据按三层显示：

- `seed`：原始 FlirtFlip 双风格展开样本
- `supplement`：公开补充语料，作为风格补位
- `final`：更保守的 gentle 路线，只保留稳定版本

其中 final 版只保留更保守的 gentle 路线，适合先做基础风格对齐；seed 版保留 gentle / playful 两种正向风格和对应偏好对。

这两张公开表已经做过一次基础清理，删除了重复、噪声、过短和明显不合适的样本，后续可以继续按同一规则增量清理。

人物经历这类长期记忆不要混进公开训练语料，应该单独写进 `memory_facts`，这样可以在后台手动维护，也能在对话上下文里被优先读取。

这条路线的目标不是“彻底消灭 AI”，而是让系统更稳定地表现成：

- 少模板
- 少追问
- 少客服味
- 更自然的接话和收尾

## 整体架构

```text
SaleSmartly webhook
  -> Worker 路由
  -> Context Builder
     -> Persona Engine
     -> Memory System
        -> Facts
        -> Summary
        -> Vector RAG
     -> Dialogue Policy Engine
     -> Safety Layer
  -> LLM
  -> Post-processing
  -> Memory Writer
  -> Next State
```

## 主要路由

- `GET /health`
  - 返回 Worker、D1、Vectorize、OpenAI、自动回复开关等健康快照

- `GET /admin`
  - 记忆调试后台页

- `GET /admin/memory?key=...&chat_user_id=...&q=...`
  - 查看指定用户的事实记忆、关系状态、摘要和向量召回

- `GET /admin/memory/facts?key=...&chat_user_id=...`
  - 查看指定用户的人物经历事实

- `POST /admin/memory/facts?key=...`
  - 手动写入一条人物经历到 `memory_facts`

- `GET /admin/training?key=...&chat_user_id=...`
  - 查看训练样本和偏好反馈统计，可加 `status=unlabeled` 只看未标注样本

- `GET /admin/training/export?key=...&chat_user_id=...&format=jsonl`
  - 导出训练样本，方便后续做 SFT / DPO 数据整理

- `POST /admin/flirtflip/sync?key=...`
  - 直接从线上源站拉取 FlirtFlip 数据并写入 D1

- `POST /admin/empathetic/sync?key=...`
  - 直接从官方源站拉取 EmpatheticDialogues 数据并写入 D1

- `POST /admin/training/feedback?key=...`
  - 写入偏好反馈、评分和备注

- `POST /webhook/salesmartly`
  - SaleSmartly 消息入口

- `GET /admin/summarize?key=...`
  - 触发摘要任务

## 主要模块

- `src/worker.js`
  - 入口文件
  - 负责路由、接收 webhook、调度主流程

- `src/db.js`
  - D1 表结构和数据库读写
  - 客户信息、消息、事实记忆、关系状态、摘要

- `src/vectorize.js`
  - Cloudflare Vectorize 检索和写入适配层
  - 负责语义记忆召回与落库

- `src/context.js`
  - Context Builder
  - 统一组装 persona、memory、relationship 和 safety

- `src/persona.js`
  - Persona Engine

- `src/memory_context.js`
  - Memory System

- `src/relationship_context.js`
  - Dialogue Policy Engine

- `src/dialogue_policy.js`
  - 对话策略总入口

- `src/dialogue_intent.js`
  - 意图识别

- `src/dialogue_topics.js`
  - 话题选择

- `src/dialogue_common_ground.js`
  - 共同点匹配

- `src/dialogue_empathy.js`
  - 共鸣与语气规划

- `src/dialogue_question.js`
  - 提问规划

- `src/dialogue_pace.js`
  - 节奏控制

- `src/safety.js`
  - Safety Layer

- `src/postprocess.js`
  - Post-processing

- `src/postprocess_normalize.js`
  - 回复归一化

- `src/postprocess_tone.js`
  - 回复语气修正

- `src/postprocess_questions.js`
  - 问题预算控制

- `src/postprocess_boundary.js`
  - 回复边界控制

- `src/postprocess_length.js`
  - 回复长度控制

- `src/memory_writer.js`
  - Memory Writer 编排层

- `src/memory_writer_facts.js`
  - 事实写回

- `src/memory_writer_conflicts.js`
  - 事实冲突处理

- `src/memory_writer_vectors.js`
  - 向量写回

- `src/memory_writer_relationship.js`
  - 关系状态写回

- `src/memory_writer_summary.js`
  - 摘要与客户主档写回

- `src/ai.js`
  - OpenAI 回复生成
  - 摘要生成
  - embedding 生成

- `src/dialogue.js`
  - 对话策略总入口
  - 兼容旧版 `buildDialogueStrategy`
  - 决定提问、话题、共鸣、节奏

- `src/memory.js`
  - 记忆写入流程
  - 关系状态更新
  - 事实记忆与 Vectorize 写入

- `src/prompts.js`
  - 系统提示词

- `src/common.js`
  - 公共常量和通用工具

- `src/admin.js`
  - 管理后台页和记忆调试接口

- `src/monitoring.js`
  - 健康检查快照

- `src/db.js` / `src/admin.js` / `src/worker.js`
  - 训练样本采集、导出和偏好反馈闭环

- `tests/smoke.mjs`
  - 本地烟雾测试

## 记忆层设计

### 1. 结构化事实记忆

适合存长期稳定信息，例如：

- 职业
- 偏好
- 常见压力点
- 长期习惯

### 2. 关系状态

当前关系阶段采用轻量状态机维护：

- `new`
- `familiar`
- `trusted`
- `light_romantic`
- `stable_companion`

同时维护：

- `trust`
- `intimacy`

### 3. 历史摘要

用于压缩长对话，避免上下文无限膨胀。

### 4. 向量记忆

把用户消息、回复和摘要转成 embedding，存到 Cloudflare Vectorize，再按相似度召回。

这部分的目标不是先追求最重的方案，而是先把“长期可用”和“便于迭代”做出来。

## 数据层

当前项目里，D1 主要负责结构化数据，Vectorize 负责语义记忆：

- `customers`
- `messages`
- `memory_facts`
- `relationship_state`
- `conversation_summaries`
- `training_samples`
- `training_feedback`

向量记忆现在不再放在 D1 表里，而是放到 Cloudflare Vectorize：

- `VECTORIZE` binding
- `salesmartly-ai-memory` index

## 配置项

### 非敏感项

- `AUTO_REPLY`
- `OPENAI_MODEL`
- `SALESMARTLY_REPLY_URL`

### 敏感项

- `OPENAI_API_KEY`
- `SALESMARTLY_ACCESS_TOKEN`
- `SUMMARY_ADMIN_KEY`

## 本地验证

最少建议跑一次：

```bash
node tests/smoke.mjs
```

如果你本地接了 Wrangler，也可以继续做一次完整的 Worker 侧验证。

## 当前进度

当前项目已经从“概念设计”走到“可继续迭代的工程底座”阶段。

目前重点已经放在：

- 让回复更像真实聊天，而不是模板化助手
- 让记忆层更可调试
- 让策略层更细颗粒度、可单独演进
- 让后台和监控更方便后续排查

你现在可以直接继续做的事情是：

1. 补完整记忆查看和调试接口
2. 继续优化向量召回和检索排序
3. 完善后台页面
4. 补测试和监控

## 部署说明

当前 Worker 已部署到 Cloudflare Workers，入口是：

- `src/worker.js`

对应配置文件是：

- `wrangler.toml`

### 推荐发布顺序

1. 先确认本地语法检查和烟雾测试通过
2. 再确认 `wrangler.toml` 里的 `DB` 和 `VECTORIZE` 绑定还在
3. 上传 Worker 代码
4. 回读 Worker settings，确认密钥绑定没有丢
5. 打开 `/health` 做一次在线检查
6. 用 `/admin/memory` 看一条真实用户数据
7. 如果线上正常，再回放一次实际 webhook

## 项目计划

更完整的计划放在 [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)。

当前推荐顺序仍然是：

1. 先把记忆查看和调试接口补完整
2. 再把向量记忆继续做检索优化
3. 再做后台页面
4. 最后补测试和监控

## 当前项目的定位

这个项目现在已经不是概念稿了，而是一个可以继续扩展的真实工程底座。

后面可以继续往这些方向演进：

- 更像长期陪伴型 AI
- 更像可运营的客户聊天系统
- 更像有记忆的商业 AI 产品
- 更像会主动找话题和共鸣的聊天伙伴
- 更像经过偏好优化的真人风格模型

如果你要继续改，这个 README 就是项目入口说明。
