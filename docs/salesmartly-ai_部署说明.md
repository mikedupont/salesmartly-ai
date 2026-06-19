# salesmartly-ai 部署说明

这是给 `salesmartly-ai` Worker 用的部署与升级说明，目标是让以后可以快速重发代码、排查问题、继续扩展功能，同时尽量不碰现有绑定。

如果你想看当前开发阶段和后续里程碑，直接看 [`PROJECT_PLAN.md`](PROJECT_PLAN.md)。

## 1. 当前 Worker

- Worker 名称：`salesmartly-ai`
- 入口文件：`src/worker.js`
- 部署方式：Cloudflare Workers
- 当前核心依赖：
  - D1
  - Cloudflare Vectorize
  - OpenAI
  - SaleSmartly 回调
  - 定时摘要任务

## 2. 当前能力

线上这版已经具备：

- 自动回复主流程
- 结构化事实记忆
- 关系状态机
- 对话策略层（Dialogue Policy Engine：提问、找话题、找共同点、制造共鸣、控制节奏）
- Context Builder（统一拼装 persona / memory / relationship / safety）
- Post-processing（回复收敛、问句控制、长度控制）
- Memory Writer 编排层（事实、向量、关系、摘要分开写回）
- 身份追问安全分支（用户问 AI / 虚拟 / 真人时直接走固定短回复，不进入普通生成）
- 摘要任务按 `last_summarized_message_id` 增量汇总新消息，并回写 `summary_updated_at`
- 摘要记忆
- 向量记忆召回
- `/health` 健康检查
- `/admin` 记忆调试页
- `/admin/memory` 记忆调试接口
- `/admin/training` 训练样本查看
  - 可加 `status=unlabeled` 只看未标注样本
- `/admin/training/export` 训练集导出
- `/admin/training/feedback` 偏好反馈写回
- `/admin/training/annotate` 标注写回
  - 可以把候选回复一键设为 chosen，或者手工补一组 chosen / rejected
- `/admin/training/purge` 训练数据清空
  - 需要 `confirm=DELETE_TRAINING_DATA`
  - 可以按 `chat_user_id` 清空单用户训练数据，也可以清空全部训练数据
- `/admin/flirtflip` FlirtFlip 线上查看
- `/admin/flirtflip/export` FlirtFlip 在线导出
- `/admin/flirtflip/import` FlirtFlip 在线导入
  - 适合手动粘贴 JSONL 直接写进 D1
- `/admin/flirtflip/sync` FlirtFlip 在线同步
  - 直接从源站拉取并写入 D1，不依赖本地文件
- `/admin/empathetic` EmpatheticDialogues 线上查看
- `/admin/empathetic/export` EmpatheticDialogues 在线导出
- `/admin/empathetic/import` EmpatheticDialogues 在线导入
  - 适合手动粘贴 JSONL 直接写进 D1
- `/admin/empathetic/sync` EmpatheticDialogues 在线同步
  - 直接从官方源拉取并写入 D1，不依赖本地文件
- FlirtFlip 风格迁移训练资产的生成与清洗
  - `scripts/generate_flirtflip_seeds.mjs`
  - `scripts/clean_flirtflip_seeds.mjs`
  - `data/flirtflip_seed_sft.jsonl`
  - `data/flirtflip_seed_dpo.jsonl`
  - `data/flirtflip_final_sft.jsonl`
  - `data/flirtflip_final_dpo.jsonl`

其中向量记忆已经从 D1 迁移到 Cloudflare Vectorize，不再依赖 D1 表做语义召回。

## 3. 代码更新方式

优先只更新 Worker 代码，不要随手重建整个脚本配置。

推荐流程：

1. 修改本地 `src/worker.js` 以及相关模块
2. 先做语法检查和烟雾测试
3. 用 Cloudflare API 上传脚本
4. 再回读 settings，确认绑定还在
5. 访问 `/health` 做在线检查
6. 用 `/admin/memory` 验证一条真实用户数据

## 4. 可直接执行的发布清单

每次发布前按这个顺序走：

1. 先确认本地语法检查通过
2. 再确认 `wrangler.toml` 里 `DB` 和 `VECTORIZE` 绑定都还在
3. 再确认 Cloudflare Secrets 没有被误删
4. 上传 Worker 代码
5. 回读 Worker settings，确认密钥绑定没有丢
6. 打开 `/health` 做一次在线检查
7. 打开 `/admin` 验证后台页
8. 用 `/admin/memory?key=...&chat_user_id=...` 看一条真实用户数据
9. 如果线上正常，再补一次实际 webhook 回放

### 4.1 身份追问策略

线上建议保持一致的行为：

- 不主动提 `AI`、`bot`、`robot`、`virtual` 等自我标识词
- 用户追问身份时，不进入普通生成链路
- 直接返回一条短、自然、角色内的回复，把话题拉回当前聊天
- 不在日志、记忆或训练样本中把“承认身份”当成默认正确答案

这样可以减少自曝波动，避免模型在高压追问时临场跑偏。

### 4.2 摘要增量策略

摘要任务现在按增量消息运行：

- 只读取 `last_summarized_message_id` 之后的新消息
- 把新增消息交给 `generateCustomerSummary`
- 回写 `customers.summary`
- 同步更新 `summary_updated_at`
- 同步推进 `last_summarized_message_id`

这样不会反复拿同一批旧消息重写摘要，也更适合长期陪伴场景的连续记忆。

如果你继续做训练准备，当前更适合直接使用：

- `data/flirtflip_final_sft.jsonl`
- `data/flirtflip_final_dpo.jsonl`

这两个文件是现在已经清洗好的版本，更适合先做风格对齐和偏好整理。

如果想把 FlirtFlip 变成真正的线上数据源，先部署 Worker，再直接跑：

- `scripts/import_flirtflip_online.mjs`

EmpatheticDialogues 也可以用同样方式上线：

- 直接运行 `scripts/import_empathetic_dialogues_online.mjs`

## 5. 本地测试与监控

发布前建议再跑一次：

```bash
node tests/smoke.mjs
```

然后再检查：

1. `GET /health` 是否返回正常
2. `GET /admin` 是否能打开
3. `GET /admin/memory?key=...&chat_user_id=...` 是否能返回完整调试快照
4. `POST /webhook/salesmartly` 是否能接收文本消息

## 6. 源码结构

当前本地源码已经模块化，线上部署也建议直接跟随 `src/worker.js` 这套结构。

主要文件：

- `src/common.js`
- `src/prompts.js`
- `src/db.js`
- `src/ai.js`
- `src/memory.js`
- `src/vectorize.js`
- `src/context.js`
- `src/persona.js`
- `src/memory_context.js`
- `src/relationship_context.js`
- `src/dialogue_policy.js`
- `src/dialogue_intent.js`
- `src/dialogue_topics.js`
- `src/dialogue_common_ground.js`
- `src/dialogue_empathy.js`
- `src/dialogue_question.js`
- `src/dialogue_pace.js`
- `src/safety.js`
- `src/postprocess.js`
- `src/postprocess_normalize.js`
- `src/postprocess_tone.js`
- `src/postprocess_questions.js`
- `src/postprocess_boundary.js`
- `src/postprocess_length.js`
- `src/memory_writer.js`
- `src/memory_writer_facts.js`
- `src/memory_writer_conflicts.js`
- `src/memory_writer_vectors.js`
- `src/memory_writer_relationship.js`
- `src/memory_writer_summary.js`
- `src/admin.js`
- `src/monitoring.js`
- `src/dialogue.js`
- `src/worker.js`
- `tests/smoke.mjs`

## 7. 需要保留的绑定

上传后应检查这些绑定是否仍然存在：

- `AUTO_REPLY`
- `DB`
- `VECTORIZE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SALESMARTLY_ACCESS_TOKEN`
- `SALESMARTLY_REPLY_URL`
- `SUMMARY_ADMIN_KEY`

其中 `DB`、`VECTORIZE` 和几个 Secret 是最容易在错误上传时被覆盖的。

## 8. 必要环境项

### 8.1 非敏感项

- `AUTO_REPLY=true`
- `OPENAI_MODEL=gpt-4o-mini`
- `SALESMARTLY_REPLY_URL=https://msg.salesmartly.com/ai-employee/send-message`

### 8.2 敏感项

这些不要写进代码仓库，只保留在 Cloudflare Secrets 里：

- `OPENAI_API_KEY`
- `SALESMARTLY_ACCESS_TOKEN`
- `SUMMARY_ADMIN_KEY`

## 9. 数据层

当前 Worker 使用 D1 作为主存储，Vectorize 作为语义记忆层。

### 9.1 D1 主要表

- `customers`
- `messages`
- `memory_facts`
- `relationship_state`
- `conversation_summaries`
- `training_samples`
- `training_feedback`

### 9.2 Vectorize

向量记忆现在已经迁移到 Cloudflare Vectorize：

- `VECTORIZE` binding
- `salesmartly-ai-memory` index

如果是首次部署到新环境，先确保 D1 绑定已存在，再确认 Vectorize index 已创建。

## 10. 上传注意事项

### 10.1 只更新代码

上传脚本时，尽量只带：

- `metadata`
- `worker.js`

不要把密钥绑定一起重传，避免 Cloudflare 误判缺失字段。

### 10.2 上传后验证

上传完成后检查：

- Worker 是否返回 `success: true`
- `modified_on` 是否更新
- `settings` 是否仍包含 `DB`、`VECTORIZE` 和各个 Secret 绑定

## 11. 最小验证

部署后最少测四件事：

1. `GET /health` 是否返回正常
2. `GET /admin` 是否能打开
3. `GET /admin/memory` 是否能看到事实、摘要和向量召回
4. `GET /admin/training` 是否能看到训练样本
   - 可以加 `status=unlabeled` 连续标注未处理样本
5. `POST /webhook/salesmartly` 能否接收文本消息

## 12. 常见故障

### 12.1 绑定丢失

表现：

- `DB` 找不到
- `VECTORIZE` 找不到
- OpenAI 调用失败
- SaleSmartly 回调失败

处理：

- 重新检查 Worker settings
- 重新补回非敏感绑定
- Secret 绑定需要在 Cloudflare 后台确认

### 12.2 OpenAI 调用失败

表现：

- 回复回落到 fallback 文本
- 记忆写入退化为启发式

处理：

- 检查 `OPENAI_API_KEY`
- 检查模型名
- 检查 API 余额和权限

### 12.3 D1 写入失败

表现：

- 机器人能回复，但不落库

处理：

- 检查 `DB` 绑定
- 检查表是否已初始化

### 12.4 向量检索失败

表现：

- 能回复，但相关联想变少
- 历史语义记忆召回为空

处理：

- 检查 `VECTORIZE` 绑定
- 检查 `salesmartly-ai-memory` index 是否存在
- 检查 metadata index 是否已创建

## 13. 推荐的发布节奏

建议每次只改一类能力：

1. 先改对话回复
2. 再改事实记忆
3. 再改向量召回
4. 再改关系状态机
5. 最后改后台和监控

这样出问题时更容易定位。

## 14. 继续升级的顺序

如果后面继续完善，推荐按这个顺序走：

1. 先把记忆查看和调试接口补完整
2. 再把向量记忆继续做检索优化
3. 再做后台页面
4. 最后补测试和监控

## 15. 当前状态

当前 `salesmartly-ai` 已经具备：

- 自动回复主流程
- 结构化事实记忆
- 关系状态机
- 摘要记忆
- 向量记忆召回
- 记忆调试后台
- 训练样本采集和导出
- 偏好反馈写回
- 健康检查

后续如果要继续扩展，最稳的方向是：

- 多用户隔离
- 更细的记忆分层
- 更完整的监控和告警
- 管理后台完善
- 支持更复杂的商业化流程
- 可持续积累训练资产和偏好数据

如果你后面要升级，这份说明就是发布和排查的入口。

## 16. 模型训练路线

如果后面要把“模型本身”也变得更像真人，建议把训练和线上 Worker 分开看：

- Worker 负责在线策略、记忆、路由、后处理
- 训练流程负责把模型的默认回答风格调顺

推荐顺序：

1. 收集真实聊天样本和偏好样本
   - 同一个问题准备多条候选回复
   - 标出更自然、更像真人、更少 AI 味的回复

2. 先做轻量监督微调
   - 用 LoRA / PEFT 降低训练成本
   - 先让模型学会你的基本语气和节奏

3. 再做偏好优化
   - 用 DPO 或 RLHF 强化“像人”的回复
   - 压低模板化、客服化、追问过多的回答

4. 继续保留线上策略层
   - `Dialogue Policy Engine` 负责决策
   - `Post-processing` 负责清理
   - `Memory Writer` 负责记忆写回

这条路线的意义是：训练负责把底子调顺，Worker 负责把实际聊天跑稳。

如果你要直接照着落地训练样本格式、正负样本规则和导出结构，可以再看 [`TRAINING_IMPLEMENTATION.md`](TRAINING_IMPLEMENTATION.md)。
