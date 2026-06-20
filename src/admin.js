import { cleanText } from "./common.js";
import {
  getCustomer,
  getActiveMemoryFacts,
  getMemoryFactsHistory,
  getConversationSummaries,
  getMemoryStats,
  getRelationshipState,
  getRecentMessages,
  loadMemoryBundle,
} from "./db.js";
import { buildDialogueStrategy, formatDialogueStrategy } from "./dialogue.js";
import { buildConversationContext } from "./context.js";
import { formatMemoryFacts, formatReferenceExamples, formatRelationshipState, formatVectorMemories } from "./memory.js";

export function requireAdminKey(env, request, url) {
  const key = cleanText(url.searchParams.get("key") || request.headers.get("x-admin-key") || "");
  if (!env.SUMMARY_ADMIN_KEY || key !== env.SUMMARY_ADMIN_KEY) {
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }
  return { ok: true, key };
}

export function renderAdminPage() {
  return new Response(
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>salesmartly-ai memory admin</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #111827; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 28px 20px 48px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); padding: 20px; margin-bottom: 16px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .muted { color: #6b7280; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display:block; font-size: 13px; margin-bottom: 6px; color:#374151; }
    input, textarea, button { width: 100%; box-sizing: border-box; border-radius: 12px; border: 1px solid #d1d5db; padding: 12px 14px; font-size: 14px; background: #fff; }
    textarea { min-height: 90px; resize: vertical; }
    button { cursor: pointer; background: #111827; color: #fff; border-color: #111827; font-weight: 600; }
    button.secondary { background: #fff; color: #111827; }
    button.ghost { background: #f9fafb; color: #111827; border-color: #e5e7eb; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 13px; line-height: 1.55; }
    .row { display:flex; gap: 10px; flex-wrap: wrap; }
    .row > * { flex: 1 1 180px; }
    .pill { display:inline-block; padding: 4px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; margin-right: 6px; margin-bottom: 6px; }
    .section-title { font-size: 16px; font-weight: 700; margin: 0 0 12px; }
    .status { padding: 10px 12px; border-radius: 12px; background: #f9fafb; border: 1px solid #e5e7eb; }
    .split { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; }
    .split-wide { display:grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .grid, .split, .split-wide { grid-template-columns: 1fr; } }
    .small { font-size: 12px; color: #6b7280; }
    .output { max-height: 560px; overflow: auto; }
    .stack { display:flex; flex-direction:column; gap: 12px; }
    .list { display:flex; flex-direction:column; gap: 8px; }
    .item { border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px; background: #fafafa; }
    .item-head { display:flex; justify-content:space-between; gap: 12px; align-items:flex-start; margin-bottom: 8px; }
    .item-title { font-weight: 700; }
    .item-meta { color: #6b7280; font-size: 12px; }
    .kvs { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .kv { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; background: #fff; }
    .kv .k { font-size: 12px; color: #6b7280; }
    .kv .v { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .table { display:grid; gap: 8px; }
    .table-head, .table-row { display:grid; grid-template-columns: 80px 120px 1fr 96px; gap: 10px; align-items:start; }
    .table-head { font-size: 12px; color: #6b7280; padding: 0 4px; }
    .table-row { border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; padding: 10px 12px; }
    .tag { display:inline-block; padding: 2px 8px; border-radius: 999px; background: #e0f2fe; color: #075985; font-size: 12px; }
    .candidate-list { display:flex; flex-direction:column; gap: 8px; }
    .candidate { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px; background: #fff; }
    .candidate.active { border-color: #10b981; background: #ecfdf5; }
    .candidate-head { display:flex; justify-content:space-between; gap: 8px; align-items:center; margin-bottom: 6px; }
    .candidate-actions { display:flex; gap: 8px; flex-wrap:wrap; margin-top: 8px; }
    .candidate-actions button { width: auto; padding: 8px 10px; border-radius: 10px; }
    .annotation-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .annotation-grid textarea { min-height: 72px; }
    .annotation-grid select { width: 100%; }
    .filter-row { display:grid; grid-template-columns: 1fr; gap: 10px; }
    details { border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; padding: 10px 12px; }
    summary { cursor: pointer; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>salesmartly-ai 记忆调试面板</h1>
      <div class="muted">用于查看单个用户的事实记忆、关系状态、摘要和向量召回结果。</div>
    </div>

    <div class="card">
      <div class="grid">
        <div>
          <label>Admin Key</label>
          <input id="key" placeholder="admin key" />
        </div>
        <div>
          <label>chat_user_id</label>
          <input id="chat_user_id" placeholder="u_123" />
        </div>
        <div>
          <label>事实历史条数</label>
          <input id="facts_limit" type="number" min="1" max="100" value="30" />
        </div>
        <div>
          <label>经历历史条数</label>
          <input id="fact_history_limit" type="number" min="1" max="200" value="50" />
        </div>
        <div>
          <label>消息条数</label>
          <input id="messages_limit" type="number" min="1" max="100" value="20" />
        </div>
        <div>
          <label>摘要条数</label>
          <input id="summaries_limit" type="number" min="1" max="50" value="10" />
        </div>
        <div>
          <label>向量条数</label>
          <input id="vector_limit" type="number" min="1" max="20" value="8" />
        </div>
        <div style="grid-column: 1 / -1;">
          <label>检索词</label>
          <textarea id="query" placeholder="输入客户消息、摘要或者你想测试的召回关键词"></textarea>
        </div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button id="load">加载记忆</button>
        <button id="save" class="secondary">保存到本机</button>
        <button id="clear" class="secondary">清空</button>
        <button id="copy" class="ghost">复制 JSON</button>
      </div>
      <div class="small" style="margin-top:10px;">默认会把 key 和 chat_user_id 存到本机 localStorage，方便你持续排查。</div>
    </div>

    <div class="card">
      <div class="section-title">调试概览</div>
      <div id="summary" class="status">等待加载...</div>
    </div>

    <div class="card">
      <div class="section-title">人物经历</div>
      <div class="small">建议用 experience_* 作为 key，例如 experience_work、experience_education、experience_life_event。</div>
      <div style="height:12px;"></div>
      <div class="grid">
        <div>
          <label>经历分类</label>
          <select id="experienceFactKey">
            <option value="experience_work">experience_work</option>
            <option value="experience_education">experience_education</option>
            <option value="experience_life_event">experience_life_event</option>
            <option value="experience_family">experience_family</option>
            <option value="experience_relationship">experience_relationship</option>
            <option value="experience_other">experience_other</option>
          </select>
        </div>
        <div>
          <label>置信度</label>
          <input id="experienceConfidence" type="number" min="0" max="1" step="0.05" value="0.8" />
        </div>
        <div>
          <label>来源消息 ID</label>
          <input id="experienceSourceMessageId" placeholder="可选" />
        </div>
        <div>
          <label>来源角色</label>
          <select id="experienceSourceMessageRole">
            <option value="customer">customer</option>
            <option value="assistant">assistant</option>
          </select>
        </div>
        <div style="grid-column: 1 / -1;">
          <label>经历内容</label>
          <textarea id="experienceFactValue" placeholder="例如：大学毕业后做了 8 年销售，最近在考虑转行。"></textarea>
        </div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button id="saveExperienceFact">保存经历</button>
        <button id="reloadExperienceFacts" class="secondary">刷新经历</button>
      </div>
      <div class="small" style="margin-top:10px;">保存后会写入 memory_facts，并在下方列表里立即显示。</div>
      <div style="height:12px;"></div>
      <div id="experienceFacts" class="table"></div>
    </div>

    <div class="card">
      <div class="section-title">对话策略</div>
      <div id="strategySummary" class="status">等待加载...</div>
      <div style="height:12px;"></div>
      <div class="output"><pre id="strategyJson">{}</pre></div>
    </div>

    <div class="card">
      <div class="section-title">上下文预览</div>
      <div class="small">这是 Context Builder 实际拼出来的结构，方便你排查 persona、memory、relationship 和 safety 是否正常。</div>
      <div style="height:12px;"></div>
      <div class="output"><pre id="contextPreview">{}</pre></div>
    </div>

    <div class="split">
      <div class="card">
        <div class="section-title">请求信息</div>
        <div class="output"><pre id="requestInfo">{}</pre></div>
      </div>
      <div class="card">
        <div class="section-title">统计信息</div>
        <div id="stats" class="kvs"></div>
      </div>
    </div>

    <div class="split-wide">
      <div class="card">
        <div class="section-title">活跃事实</div>
        <div id="activeFacts" class="list"></div>
      </div>
      <div class="card">
        <div class="section-title">事实历史</div>
        <div id="factHistory" class="table"></div>
      </div>
    </div>

    <div class="split-wide">
      <div class="card">
        <div class="section-title">最近消息</div>
        <div id="recentMessages" class="list"></div>
      </div>
      <div class="card">
        <div class="section-title">摘要历史</div>
        <div id="summaries" class="list"></div>
      </div>
    </div>

    <div class="split">
      <div class="card">
        <div class="section-title">向量召回</div>
        <div id="vectorQueryTexts" class="list"></div>
        <div style="height: 12px;"></div>
        <div id="vectors" class="list"></div>
      </div>
      <div class="card">
      <div class="section-title">训练样本</div>
      <div class="small">用于第一阶段采样、后续偏好标注和导出训练集。</div>
      <div style="height: 12px;"></div>
      <div class="row">
        <div>
          <label>样本视图</label>
          <select id="trainingStatus">
            <option value="unlabeled">只看未标注</option>
            <option value="all">全部样本</option>
            <option value="labeled">只看已标注</option>
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div>
          <label>场景分类</label>
          <select id="scenarioClass">
            <option value="all">全部场景</option>
            <option value="calm_checkin">calm_checkin</option>
            <option value="work_fatigue">work_fatigue</option>
            <option value="sleep_and_night">sleep_and_night</option>
            <option value="weekend_rhythm">weekend_rhythm</option>
            <option value="practical_decision">practical_decision</option>
            <option value="emotional_tension">emotional_tension</option>
            <option value="low_pressure_support">low_pressure_support</option>
            <option value="light_flirt">light_flirt</option>
            <option value="mutual_affection">mutual_affection</option>
            <option value="partner_like_continuity">partner_like_continuity</option>
            <option value="cooldown_and_repair">cooldown_and_repair</option>
            <option value="deep_continuity">deep_continuity</option>
          </select>
        </div>
      </div>
      <div style="height: 12px;"></div>
      <div id="trainingStats" class="kvs"></div>
      <div class="row" style="margin-top:12px;">
        <button id="exportSft" class="secondary">导出 SFT JSONL</button>
        <button id="exportDpo" class="secondary">导出 DPO JSONL</button>
        <button id="runAutoTraining" class="secondary">自动训练</button>
      </div>
      <div class="small" style="margin-top:8px;">导出会根据当前 chat_user_id 生成 JSONL，自动训练会按线上配置把公开数据和真实数据自动打包并尝试触发外部训练器。</div>
      <div style="height: 12px;"></div>
      <div id="trainingSamples" class="list"></div>
    </div>
      <div class="card">
        <div class="section-title">FlirtFlip 线上数据</div>
        <div class="small">把 FlirtFlip 样本落到 D1 后，这里就能直接在线查看、导出和重新导入。</div>
        <div style="height: 12px;"></div>
        <div class="row">
          <div>
            <label>数据集</label>
            <select id="flirtflipDatasetKind">
              <option value="all">全部</option>
              <option value="seed">seed</option>
              <option value="supplement">supplement</option>
              <option value="final">final</option>
            </select>
          </div>
          <div>
            <label>类型</label>
            <select id="flirtflipRecordType">
              <option value="all">全部</option>
              <option value="sft">sft</option>
              <option value="dpo">dpo</option>
            </select>
          </div>
          <div>
            <label>来源</label>
            <input id="flirtflipSourceKind" placeholder="flirtflip_seed / the_rizz_corpus" />
          </div>
        </div>
        <div style="height: 12px;"></div>
        <div id="flirtflipStats" class="kvs"></div>
        <div class="row" style="margin-top:12px;">
          <button id="loadFlirtflip" class="secondary">加载线上数据</button>
          <button id="syncFlirtflip" class="secondary">在线同步</button>
          <button id="syncFlirtflipSupplement" class="secondary">同步补充层</button>
          <button id="previewFlirtflipClean" class="secondary">预览清理</button>
          <button id="runFlirtflipClean" class="secondary">执行清理</button>
          <button id="exportFlirtflip" class="secondary">导出 JSONL</button>
        </div>
        <div style="height: 12px;"></div>
        <details>
          <summary>导入 JSONL 到 D1</summary>
          <div style="height: 10px;"></div>
          <div class="small">可以直接粘贴 JSONL，也可以点“在线同步”让 Worker 从源站拉取并写入 D1。</div>
          <div style="height: 10px;"></div>
          <div class="annotation-grid">
            <div>
              <label class="small">dataset kind</label>
              <select id="flirtflipImportDatasetKind">
                <option value="seed">seed</option>
                <option value="supplement">supplement</option>
                <option value="final">final</option>
              </select>
            </div>
            <div>
              <label class="small">导入模式</label>
              <select id="flirtflipImportMode">
                <option value="append">追加 / 覆盖同 ID</option>
                <option value="replace">先清空再导入</option>
              </select>
            </div>
          </div>
          <div style="height: 10px;"></div>
          <textarea id="flirtflipImportJsonl" placeholder="粘贴 JSONL，每行一个 FlirtFlip 记录"></textarea>
          <div class="candidate-actions">
            <button id="importFlirtflip" type="button">导入到 D1</button>
          </div>
        </details>
        <div style="height: 12px;"></div>
        <div id="flirtflipSamples" class="list"></div>
      </div>
      <div class="card">
        <div class="section-title">EmpatheticDialogues 线上数据</div>
        <div class="small">把 EmpatheticDialogues 样本落到 D1 后，这里就能直接在线查看、导出和重新导入。</div>
        <div style="height: 12px;"></div>
        <div class="row">
          <div>
            <label>分割</label>
            <select id="empatheticSplit">
              <option value="all">全部</option>
              <option value="train">train</option>
              <option value="validation">validation</option>
              <option value="test">test</option>
            </select>
          </div>
          <div>
            <label>情绪 / 场景</label>
            <input id="empatheticContext" placeholder="sentimental" />
          </div>
        </div>
        <div style="height: 12px;"></div>
        <div id="empatheticStats" class="kvs"></div>
        <div class="row" style="margin-top:12px;">
          <button id="loadEmpathetic" class="secondary">加载线上数据</button>
          <button id="previewEmpatheticClean" class="secondary">预览清理</button>
          <button id="runEmpatheticClean" class="secondary">执行清理</button>
          <button id="exportEmpathetic" class="secondary">导出 JSONL</button>
          <button id="copyEmpatheticSync" class="secondary">复制同步命令</button>
        </div>
        <div style="height: 12px;"></div>
        <details>
          <summary>导入 JSONL 到 D1</summary>
          <div style="height: 10px;"></div>
          <div class="small">可以直接粘贴 JSONL，也可以用 <code>scripts/import_empathetic_dialogues_online.mjs</code> 在线抓源后写入 D1。</div>
          <div style="height: 10px;"></div>
          <div class="annotation-grid">
            <div>
              <label class="small">split</label>
              <select id="empatheticImportSplit">
                <option value="train">train</option>
                <option value="validation">validation</option>
                <option value="test">test</option>
              </select>
            </div>
            <div>
              <label class="small">导入模式</label>
              <select id="empatheticImportMode">
                <option value="append">追加 / 覆盖同 ID</option>
                <option value="replace">先清空再导入</option>
              </select>
            </div>
          </div>
          <div style="height: 10px;"></div>
          <textarea id="empatheticImportJsonl" placeholder="粘贴 JSONL，每行一个 EmpatheticDialogues 记录"></textarea>
          <div class="candidate-actions">
            <button id="importEmpathetic" type="button">导入到 D1</button>
          </div>
        </details>
        <div style="height: 12px;"></div>
        <div id="empatheticSamples" class="list"></div>
      </div>
      <div class="card">
        <div class="section-title">完整 JSON</div>
        <div class="output"><pre id="output">{}</pre></div>
      </div>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const trainingScenarioOptions = [
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
    $("key").value = localStorage.getItem("salesmartly_admin_key") || "";
    $("chat_user_id").value = localStorage.getItem("salesmartly_admin_chat_user_id") || "";
    $("query").value = localStorage.getItem("salesmartly_admin_query") || "";
    $("facts_limit").value = localStorage.getItem("salesmartly_admin_facts_limit") || "30";
    $("fact_history_limit").value = localStorage.getItem("salesmartly_admin_fact_history_limit") || "50";
    $("messages_limit").value = localStorage.getItem("salesmartly_admin_messages_limit") || "20";
    $("summaries_limit").value = localStorage.getItem("salesmartly_admin_summaries_limit") || "10";
    $("vector_limit").value = localStorage.getItem("salesmartly_admin_vector_limit") || "8";
    $("experienceFactKey").value = localStorage.getItem("salesmartly_admin_experience_fact_key") || "experience_work";
    $("experienceConfidence").value = localStorage.getItem("salesmartly_admin_experience_confidence") || "0.8";
    $("experienceSourceMessageId").value = localStorage.getItem("salesmartly_admin_experience_source_message_id") || "";
    $("experienceSourceMessageRole").value = localStorage.getItem("salesmartly_admin_experience_source_message_role") || "customer";
    $("experienceFactValue").value = localStorage.getItem("salesmartly_admin_experience_fact_value") || "";
    $("trainingStatus").value = localStorage.getItem("salesmartly_admin_training_status") || "unlabeled";
    $("scenarioClass").value = localStorage.getItem("salesmartly_admin_scenario_class") || "all";
    $("flirtflipDatasetKind").value = localStorage.getItem("salesmartly_admin_flirtflip_dataset_kind") || "all";
    $("flirtflipRecordType").value = localStorage.getItem("salesmartly_admin_flirtflip_record_type") || "all";
    $("flirtflipSourceKind").value = localStorage.getItem("salesmartly_admin_flirtflip_source_kind") || "";
    $("flirtflipImportDatasetKind").value = localStorage.getItem("salesmartly_admin_flirtflip_import_dataset_kind") || "seed";
    $("flirtflipImportMode").value = localStorage.getItem("salesmartly_admin_flirtflip_import_mode") || "append";
    $("empatheticSplit").value = localStorage.getItem("salesmartly_admin_empathetic_split") || "all";
    $("empatheticContext").value = localStorage.getItem("salesmartly_admin_empathetic_context") || "";
    $("empatheticImportSplit").value = localStorage.getItem("salesmartly_admin_empathetic_import_split") || "train";
    $("empatheticImportMode").value = localStorage.getItem("salesmartly_admin_empathetic_import_mode") || "append";

    function syncStorage() {
      localStorage.setItem("salesmartly_admin_key", $("key").value.trim());
      localStorage.setItem("salesmartly_admin_chat_user_id", $("chat_user_id").value.trim());
      localStorage.setItem("salesmartly_admin_query", $("query").value.trim());
      localStorage.setItem("salesmartly_admin_facts_limit", $("facts_limit").value.trim() || "30");
      localStorage.setItem("salesmartly_admin_fact_history_limit", $("fact_history_limit").value.trim() || "50");
      localStorage.setItem("salesmartly_admin_messages_limit", $("messages_limit").value.trim() || "20");
      localStorage.setItem("salesmartly_admin_summaries_limit", $("summaries_limit").value.trim() || "10");
      localStorage.setItem("salesmartly_admin_vector_limit", $("vector_limit").value.trim() || "8");
      localStorage.setItem("salesmartly_admin_experience_fact_key", $("experienceFactKey").value.trim() || "experience_work");
      localStorage.setItem("salesmartly_admin_experience_confidence", $("experienceConfidence").value.trim() || "0.8");
      localStorage.setItem("salesmartly_admin_experience_source_message_id", $("experienceSourceMessageId").value.trim() || "");
      localStorage.setItem("salesmartly_admin_experience_source_message_role", $("experienceSourceMessageRole").value.trim() || "customer");
      localStorage.setItem("salesmartly_admin_experience_fact_value", $("experienceFactValue").value.trim() || "");
      localStorage.setItem("salesmartly_admin_training_status", $("trainingStatus").value.trim() || "unlabeled");
      localStorage.setItem("salesmartly_admin_scenario_class", $("scenarioClass").value.trim() || "all");
      localStorage.setItem("salesmartly_admin_flirtflip_dataset_kind", $("flirtflipDatasetKind").value.trim() || "all");
      localStorage.setItem("salesmartly_admin_flirtflip_record_type", $("flirtflipRecordType").value.trim() || "all");
      localStorage.setItem("salesmartly_admin_flirtflip_source_kind", $("flirtflipSourceKind").value.trim() || "");
      localStorage.setItem("salesmartly_admin_flirtflip_import_dataset_kind", $("flirtflipImportDatasetKind").value.trim() || "seed");
      localStorage.setItem("salesmartly_admin_flirtflip_import_mode", $("flirtflipImportMode").value.trim() || "append");
      localStorage.setItem("salesmartly_admin_empathetic_split", $("empatheticSplit").value.trim() || "all");
      localStorage.setItem("salesmartly_admin_empathetic_context", $("empatheticContext").value.trim() || "");
      localStorage.setItem("salesmartly_admin_empathetic_import_split", $("empatheticImportSplit").value.trim() || "train");
      localStorage.setItem("salesmartly_admin_empathetic_import_mode", $("empatheticImportMode").value.trim() || "append");
    }

    function renderPills(items) {
      return items
        .filter(Boolean)
        .map((item) => '<span class="pill">' + item + "</span>")
        .join(" ");
    }

    function escapeHtml(text) {
      return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function renderList(items, emptyText = "暂无数据") {
      if (!items || !items.length) return '<div class="small">' + emptyText + "</div>";
      return items.map((item) => {
        const title = item.title || item.key || item.role || item.stage || "item";
        const meta = item.meta || "";
        const body = item.body || "";
        return [
          '<div class="item">',
          '<div class="item-head">',
          '<div class="item-title">' + escapeHtml(title) + "</div>",
          meta ? '<div class="item-meta">' + escapeHtml(meta) + "</div>" : "",
          "</div>",
          body ? '<div class="small">' + body + "</div>" : "",
          "</div>",
        ].join("");
      }).join("");
    }

    function renderFactsTable(items, emptyText = "暂无历史事实") {
      if (!items || !items.length) return '<div class="small">' + emptyText + "</div>";
      const rows = items.map((item) => [
        '<div class="table-row">',
        '<div>' + escapeHtml(String(item.id || "")) + '</div>',
        '<div><span class="tag">' + escapeHtml(String(item.status || "active")) + '</span></div>',
        '<div><strong>' + escapeHtml(String(item.key || "")) + '</strong><br /><span class="small">' + escapeHtml(String(item.value || "")) + '</span></div>',
        '<div class="small">' + escapeHtml(String(item.confidence ?? "")) + '<br />' + escapeHtml(String(item.updatedAt || item.createdAt || "")) + "</div>",
        "</div>",
      ].join("")).join("");
      return [
        '<div class="table-head">',
        "<div>ID</div><div>状态</div><div>事实</div><div>置信度 / 时间</div>",
        "</div>",
        rows,
      ].join("");
    }

    function renderExperienceFacts(items) {
      if (!items || !items.length) {
        return '<div class="small">暂无人物经历</div>';
      }
      return renderFactsTable(items, "暂无人物经历");
    }

    async function loadExperienceFacts() {
      const key = $("key").value.trim();
      const chat_user_id = $("chat_user_id").value.trim();
      const limit = $("fact_history_limit").value.trim() || "50";
      if (!chat_user_id) {
        $("experienceFacts").innerHTML = '<div class="small">请先填写 chat_user_id</div>';
        return;
      }

      const url = new URL(location.origin + "/admin/memory/facts");
      if (key) url.searchParams.set("key", key);
      url.searchParams.set("chat_user_id", chat_user_id);
      url.searchParams.set("limit", limit);
      url.searchParams.set("key_prefix", "experience_");
      const res = await fetch(url.toString(), { headers: { "x-admin-key": key } });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        $("experienceFacts").innerHTML = '<div class="small">加载经历失败：' + escapeHtml(data.error || String(res.status)) + '</div>';
        return;
      }
      $("experienceFacts").innerHTML = renderExperienceFacts(data.facts || []);
    }

    function renderTrainingSample(item) {
      const candidateReplies = Array.isArray(item.candidateReplies) ? item.candidateReplies : [];
      const chosenIndex = Number.isFinite(Number(item.chosenReplyIndex)) ? Number(item.chosenReplyIndex) : -1;
      const meta = [
        "stage " + escapeHtml(item.sampleStage || "new"),
        "intent " + escapeHtml(item.sampleIntent || ""),
        "class " + escapeHtml(item.scenarioClass || "calm_checkin"),
        "budget " + escapeHtml(String(item.questionBudget ?? 0)),
        "chosen " + escapeHtml(String(chosenIndex)),
        item.createdAt || "",
      ].filter(Boolean).join(" · ");
      const strategy = item.strategySnapshot || {};
      const defaultChosen = item.assistantOutput || candidateReplies[chosenIndex] || candidateReplies[0] || "";
      const defaultRejected = candidateReplies.find((reply, index) => index !== chosenIndex && reply) || "";
      const scenarioSelect = [
        '<select id="train-scenario-' + escapeHtml(String(item.id || "")) + '">',
        trainingScenarioOptions.map((option) => '<option value="' + escapeHtml(option) + '"' + (String(item.scenarioClass || "") === option ? " selected" : "") + '>' + escapeHtml(option) + "</option>").join(""),
        '</select>',
      ].join("");
      return [
        '<div class="item">',
        '<div class="item-head">',
        '<div class="item-title">sample #' + escapeHtml(String(item.id || "")) + '</div>',
        '<div class="item-meta">' + meta + "</div>",
        "</div>",
        '<div class="small"><strong>User:</strong> ' + escapeHtml(item.customerInput || "") + '</div>',
        '<div style="height:8px;"></div>',
        '<div class="small"><strong>Reply:</strong> ' + escapeHtml(item.assistantOutput || "") + '</div>',
        candidateReplies.length ? [
          '<div style="height:10px;"></div>',
          '<div class="small"><strong>候选回复</strong> · 选中后，其余自动视作 rejected</div>',
          '<div class="candidate-list">',
          candidateReplies.map((reply, index) => [
            '<div class="candidate' + (index === chosenIndex ? ' active' : '') + '">',
            '<div class="candidate-head">',
            '<div class="small">#' + escapeHtml(String(index + 1)) + (index === chosenIndex ? ' · chosen' : '') + '</div>',
            '</div>',
            '<div class="small">' + escapeHtml(reply) + '</div>',
            '<div class="candidate-actions">',
            '<button class="secondary" type="button" onclick="window.applyTrainingChoice(' + Number(item.id || 0) + ', ' + index + ')">设为 chosen</button>',
            '</div>',
            '</div>',
          ].join("")).join(""),
          '</div>',
        ].join("") : "",
        strategy.openingStyle ? '<div class="small">opening: ' + escapeHtml(String(strategy.openingStyle)) + ' · closing: ' + escapeHtml(String(strategy.closingStyle || "")) + "</div>" : "",
        item.feedbackLabel || item.feedbackScore != null ? '<div class="small">feedback: ' + escapeHtml(String(item.feedbackLabel || item.feedbackScore)) + (item.feedbackNote ? " · " + escapeHtml(String(item.feedbackNote)) : "") + "</div>" : "",
        '<div style="height:10px;"></div>',
        '<details>',
        '<summary>手工补一组 chosen / rejected</summary>',
        '<div style="height:10px;"></div>',
        '<div class="annotation-grid">',
        '<div>',
        '<label class="small">scenario class</label>',
        scenarioSelect,
        '</div>',
        '<div class="small" style="align-self:end;">可人工覆盖该样本的场景分类，导出和统计会优先使用这里的值。</div>',
        '</div>',
        '<div style="height:10px;"></div>',
        '<div class="annotation-grid">',
        '<div>',
        '<label class="small">chosen reply</label>',
        '<textarea id="train-chosen-' + escapeHtml(String(item.id || "")) + '" placeholder="填入你选中的回复">' + escapeHtml(defaultChosen) + '</textarea>',
        '</div>',
        '<div>',
        '<label class="small">rejected reply</label>',
        '<textarea id="train-rejected-' + escapeHtml(String(item.id || "")) + '" placeholder="填入你要压下去的回复">' + escapeHtml(defaultRejected) + '</textarea>',
        '</div>',
        '</div>',
        '<div class="candidate-actions">',
        '<button class="secondary" type="button" onclick="window.fillTrainingChosenFromCurrent(' + Number(item.id || 0) + ')">用当前回复填入 chosen</button>',
        '<button class="secondary" type="button" onclick="window.saveTrainingScenarioClass(' + Number(item.id || 0) + ')">保存场景分类</button>',
        '<button type="button" onclick="window.saveTrainingPair(' + Number(item.id || 0) + ')">保存 pair</button>',
        '</div>',
        '<div class="small" style="margin-top:8px;">保存后会把这组内容写进 candidate_replies_json，并把 chosen_reply_index 设为 0，后续导 DPO 可以直接用。</div>',
        '</details>',
        "</div>",
      ].join("");
    }

    function renderFlirtFlipSample(item) {
      const preview = item.preview || {};
      const styleTags = Array.isArray(item.styleTags) ? item.styleTags : [];
      const publicSources = Array.isArray(item.publicSources) ? item.publicSources : [];
      const meta = [
        item.recordType || "sft",
        item.datasetKind || "seed",
        item.sourceKind || "flirtflip_seed",
        item.scenario || "",
        item.createdAt || "",
      ].filter(Boolean).join(" · ");
      return [
        '<div class="item">',
        '<div class="item-head">',
        '<div class="item-title">' + escapeHtml(String(item.id || "")) + '</div>',
        '<div class="item-meta">' + escapeHtml(meta) + '</div>',
        '</div>',
        '<div class="small"><strong>User:</strong> ' + escapeHtml(preview.user || preview.prompt || "") + '</div>',
        '<div style="height:6px;"></div>',
        '<div class="small"><strong>Assistant:</strong> ' + escapeHtml(preview.assistant || preview.chosen || "") + '</div>',
        preview.rejected ? '<div style="height:6px;"></div><div class="small"><strong>Rejected:</strong> ' + escapeHtml(preview.rejected) + '</div>' : '',
        styleTags.length ? '<div style="height:8px;">' + renderPills(styleTags.map((tag) => escapeHtml(tag))) + '</div>' : '',
        publicSources.length ? '<div class="small">sources: ' + escapeHtml(publicSources.join(", ")) + '</div>' : '',
        '</div>',
      ].join("");
    }

    function renderEmpatheticSample(item) {
      const preview = item.preview || {};
      const meta = [
        item.split || "train",
        item.context || "",
        item.convId || "",
        "utterance " + escapeHtml(String(item.utteranceIdx ?? 0)),
        item.createdAt || "",
      ].filter(Boolean).join(" · ");
      return [
        '<div class="item">',
        '<div class="item-head">',
        '<div class="item-title">' + escapeHtml(String(item.id || "")) + '</div>',
        '<div class="item-meta">' + escapeHtml(meta) + '</div>',
        '</div>',
        '<div class="small"><strong>Prompt:</strong> ' + escapeHtml(preview.user || preview.prompt || item.prompt || "") + '</div>',
        '<div style="height:6px;"></div>',
        '<div class="small"><strong>Reply:</strong> ' + escapeHtml(preview.assistant || preview.chosen || item.utterance || "") + '</div>',
        item.selfeval ? '<div style="height:6px;"></div><div class="small">selfeval: ' + escapeHtml(item.selfeval) + '</div>' : '',
        item.tags ? '<div class="small">tags: ' + escapeHtml(item.tags) + '</div>' : '',
        '</div>',
      ].join("");
    }

    async function loadMemory() {
      syncStorage();
      const key = $("key").value.trim();
      const chat_user_id = $("chat_user_id").value.trim();
      const query = $("query").value.trim();
      const facts_limit = $("facts_limit").value.trim();
      const messages_limit = $("messages_limit").value.trim();
      const summaries_limit = $("summaries_limit").value.trim();
      const vector_limit = $("vector_limit").value.trim();
      const training_status = $("trainingStatus").value.trim();
      const url = new URL(location.origin + "/admin/memory");
      if (key) url.searchParams.set("key", key);
      if (chat_user_id) url.searchParams.set("chat_user_id", chat_user_id);
      if (query) url.searchParams.set("q", query);
      if (facts_limit) url.searchParams.set("facts_limit", facts_limit);
      const fact_history_limit = $("fact_history_limit").value.trim();
      if (fact_history_limit) url.searchParams.set("fact_history_limit", fact_history_limit);
      if (messages_limit) url.searchParams.set("messages_limit", messages_limit);
      if (summaries_limit) url.searchParams.set("summaries_limit", summaries_limit);
      if (vector_limit) url.searchParams.set("vector_limit", vector_limit);
      const res = await fetch(url.toString(), { headers: { "x-admin-key": key } });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      $("requestInfo").textContent = JSON.stringify({ url: url.toString(), status: res.status }, null, 2);
      $("output").textContent = JSON.stringify(data, null, 2);
      window.__latestMemoryDebug = data;
      $("summary").innerHTML = data.ok
        ? renderPills([
            "customer " + (data.customer?.chat_user_id || chat_user_id || "n/a"),
            "stage " + (data.relationshipState?.stage || "new"),
            "trust " + Number(data.relationshipState?.trust ?? 0).toFixed(2),
            "intimacy " + Number(data.relationshipState?.intimacy ?? 0).toFixed(2),
            "active facts " + (data.activeFacts?.length || 0),
            "fact history " + (data.factHistory?.length || 0),
            "summaries " + (data.conversationSummaries?.length || 0),
            "vectors " + (data.vectorMemories?.length || 0),
          ])
        : '<span class="pill" style="background:#fee2e2;color:#991b1b;">error</span>' + (data.error || "Unknown");
      $("strategyJson").textContent = JSON.stringify(data.dialogueStrategy || {}, null, 2);
      $("strategySummary").innerHTML = data.ok && data.dialogueStrategy
        ? renderPills([
            "intent " + (data.dialogueStrategy.intent || "support"),
            "goal " + (data.dialogueStrategy.goal || "keep_conversation"),
            "ask " + (data.dialogueStrategy.shouldAsk ? "yes" : "no"),
            "tone " + (data.dialogueStrategy.tone || "warm"),
            "pace " + (data.dialogueStrategy.pace || "balanced"),
          ])
        : '<span class="pill" style="background:#fee2e2;color:#991b1b;">no strategy</span>';
      $("contextPreview").textContent = JSON.stringify(data.contextPreview || {}, null, 2);

      const stats = data.ok ? data.stats || {} : {};
      $("stats").innerHTML = data.ok ? [
        { key: "messages", value: stats.messageCounts?.total ?? 0, meta: "customer " + (stats.messageCounts?.customer ?? 0) + " / assistant " + (stats.messageCounts?.assistant ?? 0) },
        { key: "facts", value: stats.factCounts?.total ?? 0, meta: "active " + (stats.factCounts?.active ?? 0) + " / superseded " + (stats.factCounts?.superseded ?? 0) },
        { key: "summaries", value: stats.summaryCount ?? 0, meta: "latest " + (stats.latestSummary?.createdAt || "n/a") },
        { key: "last msg", value: stats.latestMessage?.role || "n/a", meta: stats.latestMessage?.createdAt || "n/a" },
        { key: "last fact", value: stats.latestFact?.key || "n/a", meta: stats.latestFact?.status || "n/a" },
        { key: "updated", value: data.customer?.updated_at || data.customer?.updatedAt || "n/a", meta: "customer row" },
      ].map((item) => '<div class="kv"><div class="k">' + escapeHtml(item.key) + "</div><div class=\"v\">" + escapeHtml(String(item.value)) + '</div><div class="small">' + escapeHtml(item.meta) + "</div></div>").join("") : '<div class="small">暂无统计</div>';
      $("activeFacts").innerHTML = data.ok
        ? renderList((data.activeFacts || []).map((fact) => ({
            title: fact.key || "fact",
            meta: "confidence " + Number(fact.confidence ?? 0).toFixed(2),
            body: escapeHtml(fact.value || "") + (fact.updatedAt ? '<br /><span class="small">' + escapeHtml(fact.updatedAt) + "</span>" : ""),
          })))
        : '<div class="small">暂无数据</div>';
      $("factHistory").innerHTML = data.ok ? renderFactsTable(data.factHistory || []) : '<div class="small">暂无数据</div>';
      $("recentMessages").innerHTML = data.ok
        ? renderList((data.recentMessages || []).map((message) => ({
            title: message.role || "message",
            meta: (message.status || "") + (message.createdAt ? " · " + message.createdAt : ""),
            body: escapeHtml(message.content || ""),
          })))
        : '<div class="small">暂无数据</div>';
      $("summaries").innerHTML = data.ok
        ? renderList((data.conversationSummaries || []).map((summary) => ({
            title: "summary #" + summary.id,
            meta: summary.createdAt || "",
            body: escapeHtml(summary.summaryText || ""),
          })))
        : '<div class="small">暂无数据</div>';
      await loadExperienceFacts();
      $("vectorQueryTexts").innerHTML = data.ok
        ? renderList((data.vectorQueryTexts || []).map((text, index) => ({
            title: "probe " + (index + 1),
            meta: "用于向量召回",
            body: escapeHtml(text || ""),
          })))
        : '<div class="small">暂无数据</div>';
      $("vectors").innerHTML = data.ok
        ? renderList((data.vectorMemories || []).map((memory) => ({
            title: (memory.sourceType || "memory") + " · " + (memory.sourceId || "n/a"),
            meta: "similarity " + Number(memory.similarity ?? 0).toFixed(2) + (memory.createdAt ? " · " + memory.createdAt : ""),
            body: escapeHtml(memory.text || ""),
          })))
        : '<div class="small">暂无数据</div>';

      const trainingUrl = new URL(location.origin + "/admin/training");
      if (key) trainingUrl.searchParams.set("key", key);
      if (chat_user_id) trainingUrl.searchParams.set("chat_user_id", chat_user_id);
      if (training_status) trainingUrl.searchParams.set("status", training_status);
      trainingUrl.searchParams.set("limit", "8");
      const trainingRes = await fetch(trainingUrl.toString(), { headers: { "x-admin-key": key } });
      const trainingData = await trainingRes.json().catch(() => ({ ok: false }));
      window.__trainingSamplesById = {};
      (trainingData.samples || []).forEach((sample) => {
        window.__trainingSamplesById[String(sample.id)] = sample;
      });
      $("trainingStats").innerHTML = trainingData.ok ? [
        { key: "samples", value: trainingData.stats?.sampleCounts?.total ?? 0, meta: "labeled " + (trainingData.stats?.sampleCounts?.labeled ?? 0) + " / scored " + (trainingData.stats?.sampleCounts?.scored ?? 0) },
        { key: "feedback", value: trainingData.stats?.feedbackCounts?.total ?? 0, meta: "avg " + (trainingData.stats?.feedbackCounts?.avgScore ?? "n/a") },
        { key: "latest sample", value: trainingData.stats?.latestSample?.sampleIntent || "n/a", meta: trainingData.stats?.latestSample?.createdAt || "n/a" },
        { key: "latest feedback", value: trainingData.stats?.latestFeedback?.feedbackType || "n/a", meta: trainingData.stats?.latestFeedback?.createdAt || "n/a" },
        { key: "scenario", value: (trainingData.stats?.scenarioCounts || []).slice(0, 1).map((item) => item.scenarioClass).join(", ") || "n/a", meta: (trainingData.stats?.scenarioCounts || []).slice(0, 3).map((item) => item.scenarioClass + " " + item.count).join(" · ") || "no class data" },
      ].map((item) => '<div class="kv"><div class="k">' + escapeHtml(item.key) + "</div><div class=\"v\">" + escapeHtml(String(item.value)) + '</div><div class="small">' + escapeHtml(item.meta) + "</div></div>").join("") : '<div class="small">暂无训练数据</div>';
      $("trainingSamples").innerHTML = trainingData.ok
        ? (trainingData.samples || []).map(renderTrainingSample).join("") || '<div class="small">暂无训练样本</div>'
        : '<div class="small">暂无训练样本</div>';

      const flirtflipUrl = new URL(location.origin + "/admin/flirtflip");
      if (key) flirtflipUrl.searchParams.set("key", key);
      flirtflipUrl.searchParams.set("limit", "12");
      const flirtflipDatasetKind = $("flirtflipDatasetKind").value.trim() || "all";
      const flirtflipRecordType = $("flirtflipRecordType").value.trim() || "all";
      const flirtflipSourceKind = $("flirtflipSourceKind").value.trim();
      if (flirtflipDatasetKind) flirtflipUrl.searchParams.set("dataset_kind", flirtflipDatasetKind);
      if (flirtflipRecordType) flirtflipUrl.searchParams.set("record_type", flirtflipRecordType);
      if (flirtflipSourceKind) flirtflipUrl.searchParams.set("source_kind", flirtflipSourceKind);
      const flirtflipRes = await fetch(flirtflipUrl.toString(), { headers: { "x-admin-key": key } });
      const flirtflipData = await flirtflipRes.json().catch(() => ({ ok: false }));
      $("flirtflipStats").innerHTML = flirtflipData.ok ? [
        { key: "total", value: flirtflipData.stats?.total ?? 0, meta: "dataset kinds " + (flirtflipData.stats?.datasetKinds?.length ?? 0) },
        { key: "types", value: flirtflipData.stats?.recordTypes?.map((item) => item.recordType + " " + item.count).join(" · ") || "n/a", meta: "record types" },
        { key: "sources", value: flirtflipData.stats?.sourceKinds?.slice(0, 3).map((item) => item.sourceKind + " " + item.count).join(" · ") || "n/a", meta: "source kinds" },
        { key: "latest", value: flirtflipData.stats?.latest?.id || "n/a", meta: (flirtflipData.stats?.latest?.recordType || "n/a") + " · " + (flirtflipData.stats?.latest?.datasetKind || "n/a") },
        { key: "source", value: flirtflipData.filters?.sourceKind || "all", meta: "current filter" },
      ].map((item) => '<div class="kv"><div class="k">' + escapeHtml(item.key) + "</div><div class=\"v\">" + escapeHtml(String(item.value)) + '</div><div class="small">' + escapeHtml(item.meta) + "</div></div>").join("") : '<div class="small">暂无 FlirtFlip 数据</div>';
      $("flirtflipSamples").innerHTML = flirtflipData.ok
        ? (flirtflipData.samples || []).map(renderFlirtFlipSample).join("") || '<div class="small">暂无 FlirtFlip 样本</div>'
        : '<div class="small">暂无 FlirtFlip 样本</div>';

      const empatheticUrl = new URL(location.origin + "/admin/empathetic");
      if (key) empatheticUrl.searchParams.set("key", key);
      empatheticUrl.searchParams.set("limit", "12");
      const empatheticSplit = $("empatheticSplit").value.trim() || "all";
      const empatheticContext = $("empatheticContext").value.trim();
      if (empatheticSplit) empatheticUrl.searchParams.set("split", empatheticSplit);
      if (empatheticContext) empatheticUrl.searchParams.set("context", empatheticContext);
      const empatheticRes = await fetch(empatheticUrl.toString(), { headers: { "x-admin-key": key } });
      const empatheticData = await empatheticRes.json().catch(() => ({ ok: false }));
      $("empatheticStats").innerHTML = empatheticData.ok ? [
        { key: "total", value: empatheticData.stats?.total ?? 0, meta: "splits " + (empatheticData.stats?.splitCounts?.length ?? 0) },
        { key: "latest", value: empatheticData.stats?.latest?.id || "n/a", meta: (empatheticData.stats?.latest?.split || "n/a") + " · " + (empatheticData.stats?.latest?.context || "n/a") },
        { key: "source", value: empatheticData.stats?.latest?.sourceKind || "empathetic_dialogues", meta: "current source" },
        { key: "filter", value: empatheticData.filters?.split || "all", meta: empatheticData.filters?.context || "any context" },
      ].map((item) => '<div class="kv"><div class="k">' + escapeHtml(item.key) + "</div><div class=\"v\">" + escapeHtml(String(item.value)) + '</div><div class="small">' + escapeHtml(item.meta) + "</div></div>").join("") : '<div class="small">暂无 EmpatheticDialogues 数据</div>';
      $("empatheticSamples").innerHTML = empatheticData.ok
        ? (empatheticData.samples || []).map(renderEmpatheticSample).join("") || '<div class="small">暂无 EmpatheticDialogues 样本</div>'
        : '<div class="small">暂无 EmpatheticDialogues 样本</div>';
    }

    async function exportTraining(dataset) {
      syncStorage();
      const key = $("key").value.trim();
      const chat_user_id = $("chat_user_id").value.trim();
      const scenarioClass = $("scenarioClass").value.trim();
      if (!chat_user_id) {
        alert("请先填写 chat_user_id");
        return;
      }

      const url = new URL(location.origin + "/admin/training/export");
      if (key) url.searchParams.set("key", key);
      url.searchParams.set("chat_user_id", chat_user_id);
      url.searchParams.set("dataset", dataset);
      url.searchParams.set("format", "jsonl");
      if (scenarioClass && scenarioClass !== "all") {
        url.searchParams.set("scenario_class", scenarioClass);
      }
      const res = await fetch(url.toString(), { headers: { "x-admin-key": key } });
      if (!res.ok) {
        alert("导出失败: " + res.status);
        return;
      }

      const text = await res.text();
      const blob = new Blob([text], { type: "application/x-ndjson;charset=UTF-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "training-" + dataset + "-" + chat_user_id + (scenarioClass && scenarioClass !== "all" ? "-" + scenarioClass : "") + ".jsonl";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }

    async function exportFlirtflip() {
      syncStorage();
      const key = $("key").value.trim();
      const url = new URL(location.origin + "/admin/flirtflip/export");
      if (key) url.searchParams.set("key", key);
      url.searchParams.set("format", "jsonl");
      url.searchParams.set("limit", "1000");
      const datasetKind = $("flirtflipDatasetKind").value.trim() || "all";
      const recordType = $("flirtflipRecordType").value.trim() || "all";
      const sourceKind = $("flirtflipSourceKind").value.trim();
      if (datasetKind) url.searchParams.set("dataset_kind", datasetKind);
      if (recordType) url.searchParams.set("record_type", recordType);
      if (sourceKind) url.searchParams.set("source_kind", sourceKind);
      const res = await fetch(url.toString(), { headers: { "x-admin-key": key } });
      if (!res.ok) {
        alert("导出 FlirtFlip 失败: " + res.status);
        return;
      }

      const text = await res.text();
      const blob = new Blob([text], { type: "application/x-ndjson;charset=UTF-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "flirtflip-online.jsonl";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }

    async function syncFlirtflipOnline() {
      syncStorage();
      const key = $("key").value.trim();
      const mode = $("flirtflipImportMode").value.trim() || "append";
      const res = await fetch(location.origin + "/admin/flirtflip/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          replace: mode === "replace",
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("在线同步 FlirtFlip 失败: " + (data.error || res.status));
        return;
      }
      alert("FlirtFlip 已在线同步");
      await loadMemory();
    }

    async function syncFlirtflipSupplementOnline() {
      syncStorage();
      const key = $("key").value.trim();
      const res = await fetch(location.origin + "/admin/flirtflip/supplement/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          replace: true,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("同步补充层失败: " + (data.error || res.status));
        return;
      }
      alert("FlirtFlip 补充层已同步");
      await loadMemory();
    }

    async function cleanPublicData(kind, dryRun) {
      syncStorage();
      const key = $("key").value.trim();
      const endpoint = kind === "flirtflip" ? "/admin/flirtflip/clean" : "/admin/empathetic/clean";
      const body = kind === "flirtflip"
        ? {
            datasetKind: $("flirtflipDatasetKind").value.trim() || "all",
            sourceKind: $("flirtflipSourceKind").value.trim(),
            recordType: $("flirtflipRecordType").value.trim() || "all",
            dryRun: !!dryRun,
          }
        : {
            split: $("empatheticSplit").value.trim() || "all",
            context: $("empatheticContext").value.trim(),
            dryRun: !!dryRun,
          };
      const res = await fetch(location.origin + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert((kind === "flirtflip" ? "FlirtFlip" : "EmpatheticDialogues") + " 清理失败: " + (data.error || res.status));
        return;
      }
      const label = kind === "flirtflip" ? "FlirtFlip" : "EmpatheticDialogues";
      const action = dryRun ? "预览" : "执行";
      alert(label + " " + action + "清理：扫描 " + (data.scanned || 0) + "，保留 " + (data.kept || 0) + "，" + (dryRun ? "可删" : "已删") + " " + (data.deleted || 0));
      await loadMemory();
    }

    async function exportEmpathetic() {
      syncStorage();
      const key = $("key").value.trim();
      const url = new URL(location.origin + "/admin/empathetic/export");
      if (key) url.searchParams.set("key", key);
      url.searchParams.set("format", "jsonl");
      url.searchParams.set("limit", "1000");
      const split = $("empatheticSplit").value.trim() || "all";
      const context = $("empatheticContext").value.trim();
      if (split) url.searchParams.set("split", split);
      if (context) url.searchParams.set("context", context);
      const res = await fetch(url.toString(), { headers: { "x-admin-key": key } });
      if (!res.ok) {
        alert("导出 EmpatheticDialogues 失败: " + res.status);
        return;
      }

      const text = await res.text();
      const blob = new Blob([text], { type: "application/x-ndjson;charset=UTF-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "empathetic-dialogues-online.jsonl";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    }

    async function runAutoTraining() {
      syncStorage();
      const key = $("key").value.trim();
      const res = await fetch(location.origin + "/admin/training/auto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          force: true,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("自动训练失败: " + (data.error || res.status));
        return;
      }
      const status = data.triggered ? "已触发训练器" : data.prepared ? "已准备训练包" : data.skipped ? "已跳过" : "完成";
      const counts = data.bundle?.recordCounts
        ? " · " + data.bundle.recordCounts.total + " 条记录"
        : "";
      alert("自动训练" + status + counts);
      await loadMemory();
    }

    async function syncEmpatheticOnline() {
      syncStorage();
      const key = $("key").value.trim();
      const mode = $("empatheticImportMode").value.trim() || "append";
      const res = await fetch(location.origin + "/admin/empathetic/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          replace: mode === "replace",
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("在线同步 EmpatheticDialogues 失败: " + (data.error || res.status));
        return;
      }
      alert("EmpatheticDialogues 已在线同步");
      await loadMemory();
    }

    async function copyEmpatheticSyncCommand() {
      const command = [
        "EMPATHETIC_LIMIT=1",
        "node scripts/import_empathetic_dialogues_online.mjs",
        "https://salesmartly-ai.whogotdeals.workers.dev",
        "<ADMIN_KEY>",
      ].join(" ");
      try {
        await navigator.clipboard.writeText(command);
        alert("已复制同步命令");
      } catch {
        prompt("复制下面这条命令：", command);
      }
    }

    function parseJsonl(text) {
      return String(text || "")
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

    async function importFlirtflip() {
      syncStorage();
      const key = $("key").value.trim();
      const datasetKind = $("flirtflipImportDatasetKind").value.trim() || "seed";
      const mode = $("flirtflipImportMode").value.trim() || "append";
      const jsonl = $("flirtflipImportJsonl").value.trim();
      const records = parseJsonl(jsonl);
      if (!records.length) {
        alert("请先粘贴有效的 JSONL 内容");
        return;
      }

      const res = await fetch(location.origin + "/admin/flirtflip/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          dataset_kind: datasetKind,
          replace: mode === "replace",
          records,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("导入失败: " + (data.error || res.status));
        return;
      }
      alert("已导入 " + (data.inserted || 0) + " 条");
      await loadMemory();
    }

    async function importEmpathetic() {
      syncStorage();
      const key = $("key").value.trim();
      const split = $("empatheticImportSplit").value.trim() || "train";
      const mode = $("empatheticImportMode").value.trim() || "append";
      const jsonl = $("empatheticImportJsonl").value.trim();
      const records = parseJsonl(jsonl);
      if (!records.length) {
        alert("请先粘贴有效的 JSONL 内容");
        return;
      }

      const res = await fetch(location.origin + "/admin/empathetic/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          split,
          replace: mode === "replace",
          records,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("导入失败: " + (data.error || res.status));
        return;
      }
      alert("已导入 " + (data.inserted || 0) + " 条");
      await loadMemory();
    }

    async function saveExperienceFact() {
      syncStorage();
      const key = $("key").value.trim();
      const chat_user_id = $("chat_user_id").value.trim();
      const factKey = $("experienceFactKey").value.trim();
      const factValue = $("experienceFactValue").value.trim();
      const confidence = $("experienceConfidence").value.trim();
      const sourceMessageId = $("experienceSourceMessageId").value.trim();
      const sourceMessageRole = $("experienceSourceMessageRole").value.trim();
      if (!chat_user_id) {
        alert("请先填写 chat_user_id");
        return;
      }
      if (!factKey) {
        alert("请选择经历分类");
        return;
      }
      if (!factValue) {
        alert("请先填写经历内容");
        return;
      }

      const res = await fetch(location.origin + "/admin/memory/facts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          chat_user_id,
          fact_key: factKey,
          fact_value: factValue,
          confidence,
          source_message_id: sourceMessageId,
          source_message_role: sourceMessageRole,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("保存经历失败: " + (data.error || res.status));
        return;
      }
      alert("经历已保存");
      await loadMemory();
    }

    async function annotateTrainingSample(sampleId, payload) {
      syncStorage();
      const key = $("key").value.trim();
      const chat_user_id = $("chat_user_id").value.trim();
      const res = await fetch(location.origin + "/admin/training/annotate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({
          sample_id: sampleId,
          chat_user_id,
          ...payload,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON" }));
      if (!res.ok || !data.ok) {
        alert("标注失败: " + (data.error || res.status));
        return false;
      }
      await loadMemory();
      return true;
    }

    window.saveTrainingScenarioClass = async (sampleId) => {
      const sample = window.__trainingSamplesById?.[String(sampleId)];
      const scenarioSelect = $("train-scenario-" + sampleId);
      if (!scenarioSelect) return;
      const scenarioClass = scenarioSelect.value.trim();
      await annotateTrainingSample(sampleId, {
        scenarioClass,
        sampleStage: sample?.sampleStage || "new",
      });
    };

    window.saveExperienceFact = saveExperienceFact;
    window.reloadExperienceFacts = loadExperienceFacts;

    window.applyTrainingChoice = async (sampleId, chosenIndex) => {
      const sample = window.__trainingSamplesById?.[String(sampleId)];
      if (!sample) return;
      const replies = Array.isArray(sample.candidateReplies) ? sample.candidateReplies.slice() : [];
      if (!replies.length) {
        alert("这个样本还没有候选回复");
        return;
      }
      await annotateTrainingSample(sampleId, {
        candidateReplies: replies,
        chosenReplyIndex: chosenIndex,
        sampleStage: "labeled",
        scenarioClass: sample.scenarioClass || "",
      });
    };

    window.fillTrainingChosenFromCurrent = (sampleId) => {
      const sample = window.__trainingSamplesById?.[String(sampleId)];
      if (!sample) return;
      const chosen = $("train-chosen-" + sampleId);
      if (chosen) chosen.value = sample.assistantOutput || "";
    };

    window.saveTrainingPair = async (sampleId) => {
      const sample = window.__trainingSamplesById?.[String(sampleId)];
      const chosen = $("train-chosen-" + sampleId);
      const rejected = $("train-rejected-" + sampleId);
      const chosenText = chosen ? chosen.value.trim() : "";
      const rejectedText = rejected ? rejected.value.trim() : "";
      if (!chosenText || !rejectedText) {
        alert("请同时填写 chosen 和 rejected");
        return;
      }
      await annotateTrainingSample(sampleId, {
        candidateReplies: [chosenText, rejectedText],
        chosenReplyIndex: 0,
        sampleStage: "labeled",
        scenarioClass: sample?.scenarioClass || "",
      });
    };

    $("load").addEventListener("click", loadMemory);
    $("save").addEventListener("click", () => { syncStorage(); alert("已保存到本机"); });
    $("saveExperienceFact").addEventListener("click", saveExperienceFact);
    $("reloadExperienceFacts").addEventListener("click", loadExperienceFacts);
    $("trainingStatus").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("flirtflipDatasetKind").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("flirtflipRecordType").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("flirtflipSourceKind").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("flirtflipImportDatasetKind").addEventListener("change", syncStorage);
    $("flirtflipImportMode").addEventListener("change", syncStorage);
    $("empatheticSplit").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("empatheticContext").addEventListener("change", () => { syncStorage(); loadMemory(); });
    $("empatheticImportSplit").addEventListener("change", syncStorage);
    $("empatheticImportMode").addEventListener("change", syncStorage);
    $("exportSft").addEventListener("click", () => exportTraining("sft"));
    $("exportDpo").addEventListener("click", () => exportTraining("dpo"));
    $("runAutoTraining").addEventListener("click", runAutoTraining);
    $("exportFlirtflip").addEventListener("click", exportFlirtflip);
    $("importFlirtflip").addEventListener("click", importFlirtflip);
    $("loadFlirtflip").addEventListener("click", loadMemory);
    $("syncFlirtflip").addEventListener("click", syncFlirtflipOnline);
    $("syncFlirtflipSupplement").addEventListener("click", syncFlirtflipSupplementOnline);
    $("previewFlirtflipClean").addEventListener("click", () => cleanPublicData("flirtflip", true));
    $("runFlirtflipClean").addEventListener("click", () => cleanPublicData("flirtflip", false));
    $("exportEmpathetic").addEventListener("click", exportEmpathetic);
    $("importEmpathetic").addEventListener("click", importEmpathetic);
    $("loadEmpathetic").addEventListener("click", loadMemory);
    $("previewEmpatheticClean").addEventListener("click", () => cleanPublicData("empathetic", true));
    $("runEmpatheticClean").addEventListener("click", () => cleanPublicData("empathetic", false));
    $("copyEmpatheticSync").addEventListener("click", copyEmpatheticSyncCommand);
    $("copy").addEventListener("click", async () => {
      const text = JSON.stringify(window.__latestMemoryDebug || {}, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        alert("已复制 JSON");
      } catch {
        alert("复制失败，请手动选中完整 JSON");
      }
    });
    $("clear").addEventListener("click", () => {
      localStorage.removeItem("salesmartly_admin_key");
      localStorage.removeItem("salesmartly_admin_chat_user_id");
      localStorage.removeItem("salesmartly_admin_query");
      localStorage.removeItem("salesmartly_admin_facts_limit");
      localStorage.removeItem("salesmartly_admin_fact_history_limit");
      localStorage.removeItem("salesmartly_admin_messages_limit");
      localStorage.removeItem("salesmartly_admin_summaries_limit");
      localStorage.removeItem("salesmartly_admin_vector_limit");
      localStorage.removeItem("salesmartly_admin_experience_fact_key");
      localStorage.removeItem("salesmartly_admin_experience_confidence");
      localStorage.removeItem("salesmartly_admin_experience_source_message_id");
      localStorage.removeItem("salesmartly_admin_experience_source_message_role");
      localStorage.removeItem("salesmartly_admin_experience_fact_value");
      localStorage.removeItem("salesmartly_admin_flirtflip_dataset_kind");
      localStorage.removeItem("salesmartly_admin_flirtflip_record_type");
      localStorage.removeItem("salesmartly_admin_flirtflip_source_kind");
      localStorage.removeItem("salesmartly_admin_flirtflip_import_dataset_kind");
      localStorage.removeItem("salesmartly_admin_flirtflip_import_mode");
      localStorage.removeItem("salesmartly_admin_empathetic_split");
      localStorage.removeItem("salesmartly_admin_empathetic_context");
      localStorage.removeItem("salesmartly_admin_empathetic_import_split");
      localStorage.removeItem("salesmartly_admin_empathetic_import_mode");
      $("key").value = "";
      $("chat_user_id").value = "";
      $("query").value = "";
      $("facts_limit").value = "30";
      $("fact_history_limit").value = "50";
      $("messages_limit").value = "20";
      $("summaries_limit").value = "10";
      $("vector_limit").value = "8";
      $("experienceFactKey").value = "experience_work";
      $("experienceConfidence").value = "0.8";
      $("experienceSourceMessageId").value = "";
      $("experienceSourceMessageRole").value = "customer";
      $("experienceFactValue").value = "";
      $("summary").textContent = "等待加载...";
      $("output").textContent = "{}";
      $("requestInfo").textContent = "{}";
      $("stats").innerHTML = "";
      $("activeFacts").innerHTML = "";
      $("factHistory").innerHTML = "";
      $("recentMessages").innerHTML = "";
      $("summaries").innerHTML = "";
      $("vectorQueryTexts").innerHTML = "";
      $("vectors").innerHTML = "";
      $("experienceFacts").innerHTML = "";
      $("flirtflipStats").innerHTML = "";
      $("flirtflipSamples").innerHTML = "";
      $("flirtflipImportJsonl").value = "";
      $("empatheticStats").innerHTML = "";
      $("empatheticSamples").innerHTML = "";
      $("empatheticImportJsonl").value = "";
      window.__latestMemoryDebug = null;
    });
  </script>
</body>
</html>`,
    { headers: { "Content-Type": "text/html;charset=UTF-8" } }
  );
}

function buildVectorQueryTexts({ query, customer, summary }) {
  return [...new Set([
    cleanText(query || ""),
    cleanText(customer?.summary || ""),
    cleanText(customer?.remark || ""),
    cleanText(summary || ""),
  ].filter(Boolean))];
}

export async function buildMemoryDebugResponse(env, { chatUserId, query, embeddingFn, limits = {}, includeInactiveFacts = true }) {
  const customer = await getCustomer(env, chatUserId);
  const relationshipState = await getRelationshipState(env, chatUserId, customer?.relationship_stage || "new");
  const activeFactsLimit = Math.max(1, Number(limits.factsLimit || 20));
  const factHistoryLimit = Math.max(activeFactsLimit, Number(limits.factHistoryLimit || 30));
  const recentMessagesLimit = Math.max(1, Number(limits.recentMessagesLimit || 20));
  const summaryLimit = Math.max(1, Number(limits.summaryLimit || 10));
  const vectorLimit = Math.max(1, Number(limits.vectorLimit || 8));
  const activeFacts = await getActiveMemoryFacts(env, chatUserId, activeFactsLimit);
  const factHistory = await getMemoryFactsHistory(env, chatUserId, factHistoryLimit);
  const recentMessages = await getRecentMessages(env, chatUserId, recentMessagesLimit);
  const conversationSummaries = await getConversationSummaries(env, chatUserId, summaryLimit);
  const stats = await getMemoryStats(env, chatUserId);
  const latestSummary = conversationSummaries[0]?.summaryText || "";
  const vectorQueryTexts = buildVectorQueryTexts({
    query,
    customer,
    summary: latestSummary,
  });
  const bundle = await loadMemoryBundle(env, {
    chatUserId,
    customer,
    relationshipStage: relationshipState.stage,
    customerMessage: query || customer?.summary || latestSummary || "",
    embeddingFn,
  });
  const vectorMemories = (bundle.vectorMemories || []).slice(0, vectorLimit);
  const dialogueStrategy = buildDialogueStrategy({
    customerMessage: query || customer?.summary || latestSummary || "",
    customerSummary: latestSummary || customer?.summary || "",
    memoryFacts: activeFacts,
    vectorMemories,
    relationshipState,
    recentMessages,
  });
  const contextPreview = buildConversationContext({
    customerName: customer?.name || "",
    customerRemark: customer?.remark || "",
    customerMessage: query || customer?.summary || latestSummary || "",
    customerSummary: latestSummary || customer?.summary || "",
    memoryFacts: activeFacts,
    vectorMemories,
    referenceExamples: bundle.referenceExamples || [],
    relationshipState,
    recentMessages,
    formatRecentConversation: (messages) => (messages || []).map((message) => message.role + ": " + message.content).join("\n"),
    formatMemoryFacts,
    formatVectorMemories,
    formatReferenceExamples,
    formatRelationshipState,
  });
  const facts = includeInactiveFacts
    ? factHistory
    : activeFacts.map((fact, index) => ({
        id: index + 1,
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        status: "active",
        sourceMessageId: "",
        sourceMessageRole: "customer",
        createdAt: fact.updatedAt,
        updatedAt: fact.updatedAt,
      }));

  return {
    ok: true,
    request: {
      chatUserId,
      query: cleanText(query || ""),
      limits: {
        factsLimit: activeFactsLimit,
        factHistoryLimit,
        recentMessagesLimit,
        summaryLimit,
        vectorLimit,
      },
      includeInactiveFacts,
    },
    chatUserId,
    query: cleanText(query || ""),
    customer,
    relationshipState,
    stats,
    activeFacts,
    facts,
    factHistory,
    recentMessages,
    summaries: conversationSummaries,
    conversationSummaries,
    summary: bundle.summary,
    vectorQueryTexts,
    vectorMemories,
    dialogueStrategy,
    dialogueStrategyText: formatDialogueStrategy(dialogueStrategy),
    contextPreview,
  };
}
