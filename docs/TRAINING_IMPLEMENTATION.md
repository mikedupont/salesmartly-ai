# Training Implementation Guide

This document describes the practical training loop for the current `salesmartly-ai` project:

1. sample format
2. positive / negative sample rules
3. JSONL export structure
4. how to feed the data into LoRA / DPO later

The goal is not to train a generic chatbot. The goal is to teach the model to sound more like a real companion for 45+ American men in long-term emotional companion chats:

- less template-like
- less customer-support tone
- less over-questioning
- more natural openings and endings
- more human pacing
- more emotional value
- more subtle flirtation when the relationship is ready
- more partner-like continuity when the conversation moves in that direction

## 0.1 Identity and Safety Handling

The training set and evaluation loop should not teach the model to freely self-disclose system identity in normal chat.

Practical rules:

- do not use "I am an AI" or similar self-disclosure as a target answer
- when a user asks whether the assistant is AI / virtual / real, route that case through the product safety layer instead of the generic reply set
- prefer short, role-consistent replies that return the conversation to the user's topic
- keep identity-avoidance behavior consistent across prompts, post-processing, and manual review

## 0. FlirtFlip Style Data To Add First

Before you fine-tune on your own product data, the first supplemental seed should be FlirtFlip because it matches flirtation and style-transfer behavior more directly than generic dialogue corpora.

Use the general dialogue corpora below only as optional secondary sources when you need broader conversational variety.

Good public sources to mix in:

- DailyDialog
  - Human-written daily communication
  - Useful for short, clean, everyday exchanges
  - Good for simple openings, light topic shifts, and natural closings

- EmpatheticDialogues
  - Conversations grounded in emotional situations
  - Good for support, validation, and low-pressure follow-up questions

- ConvAI2 / Persona-Chat style data
  - Personalized open-domain conversation
  - Good for consistency, persona continuity, and small personal follow-ups

- BlendedSkillTalk
  - Blends empathy, knowledge, and personality
  - Good for mixing support with continuity instead of sounding too segmented

- Wizard of Wikipedia
  - Grounded topic bridging with short informative turns
  - Good for helping the assistant move from small talk into a concrete subject

- Topical-Chat
  - Open-domain topical conversation
  - Good for natural subject shifts and lightweight follow-up without sounding scripted

- OpenSubtitles2016
  - Large subtitle-derived dialogue pool with short spoken turns
  - Good for casual phrasing, quick reactions, and everyday口语节奏 after filtering

- Reddit / Pushshift Reddit threads
  - Open-domain thread-style discussion with long-tail topics
  - Good for reply chaining and staying on a thread without sounding too structured

### How to use public data safely

- Do not copy raw dataset text into production prompts.
- Use the public datasets as style references and training seeds.
- Keep the final training file in the same format as your own samples.
- Mark the metadata so you can later filter public-seed samples out if needed.

Recommended mix:

- 60% EmpatheticDialogues and related public empathy-style data
- 30% FlirtFlip style seeds and supplement layer
- 10% real product conversations

If you are expanding the optional general dialogue layer later, a practical ordering is:

- keep DailyDialog and EmpatheticDialogues as the main style base
- use ConvAI2 / Persona-Chat style data for identity consistency
- use BlendedSkillTalk for blended empathy-plus-continuity behavior
- add Wizard of Wikipedia and Topical-Chat only when you want stronger topic bridging or softer knowledge grounding
- use OpenSubtitles2016 when you want more natural spoken cadence and broader phrasing variety, but keep it as a secondary source because raw subtitle text is noisier
- use Reddit threads when you want thread-like flow and long-tail topic coverage, but filter them aggressively because quality varies a lot

That gives you enough diversity to reduce AI-like repetition without losing product-specific behavior.

The repo also includes a reproducible EmpatheticDialogues seed generator and online sync path:

- `scripts/generate_empathetic_dialogues_seed.py`
- `scripts/import_empathetic_dialogues_online.mjs`

The online sync route pulls the official `facebook/empathetic_dialogues` source and writes it straight into D1. No local `data/` cache is part of the normal workflow.

The repo already includes a reproducible FlirtFlip seed generator and online sync path:

- `scripts/generate_flirtflip_seeds.mjs`
- `scripts/import_flirtflip_online.mjs`

The online sync route pulls the FlirtFlip JSON source from Hugging Face and writes the generated seed / supplement / final records straight into D1. The data is now organized in three layers:

- `seed`
- `supplement`
- `final`

The supplement layer is reserved for public style-coverage corpora and is kept separate so you can filter it out later if needed. No local export files are required.

The final data keeps only the safer gentle path, while the seed data preserves both gentle and playful variants for broader style coverage.

Current cleaned public corpus totals:

- FlirtFlip: 9996 rows
- EmpatheticDialogues: 9605 rows

Those are training assets only. Personal experience records, profile notes, and user-specific long-term memories should stay in `memory_facts`, not in the public training set.

## 1. Sample Format

Each training sample should describe one real conversation turn.

Recommended fields:

```json
{
  "chat_user_id": "u_1001",
  "session_id": "s_20260619_01",
  "source_message_id": "msg_8891",
  "prompt_version": "v1",
  "sample_stage": "familiar",
  "sample_intent": "smalltalk",
  "customer_input": "I had a rough day at work.",
  "assistant_output": "That sounds exhausting. Do you want to vent a little or would you rather switch topics for a bit?",
  "candidate_replies": [
    "That sounds exhausting. Do you want to vent a little or would you rather switch topics for a bit?",
    "Sorry to hear that. Let me know if I can help.",
    "I am here if you need anything."
  ],
  "chosen_reply_index": 0,
  "question_budget": 1,
  "opening_style": "warm_acknowledgement",
  "closing_style": "open_finish",
  "strategy_snapshot": {
    "intent": "smalltalk",
    "goal": "keep_conversation",
    "tone": "warm",
    "pace": "balanced"
  },
  "context_snapshot": {
    "persona": {},
    "memory": {},
    "relationship": {}
  },
  "feedback_score": 0.95,
  "feedback_label": "thumb_up",
  "feedback_note": "natural"
}
```

## 1.1 45+ American Men Companion Schema

For this product, the training data should be organized around four things:

1. who the user is
2. what relationship state the conversation is in
3. what emotional value the reply is trying to provide
4. how intimate or flirtatious the reply is allowed to feel

Use the following schema as the canonical shape for new samples:

```json
{
  "schema_version": "companion_v1",
  "product_track": "45plus_us_men",
  "audience_profile": {
    "age_band": "45_plus",
    "locale": "en_US",
    "gender": "male",
    "tone_preference": ["calm", "respectful", "adult", "low_pressure"]
  },
  "relationship_profile": {
    "stage": "new",
    "mode": "emotional_value",
    "intimacy_band": "low",
    "flirtation_band": "none"
  },
  "conversation_goal": {
    "primary": "provide_emotional_value",
    "secondary": "keep_conversation_open",
    "reply_layer": "emotional_value"
  },
  "context": {
    "customer_input": "I had a rough day at work.",
    "customer_summary": "Work has been draining lately.",
    "memory_facts": [
      { "key": "job", "value": "operations manager" },
      { "key": "prefers_chat_time", "value": "evening" }
    ],
    "recent_messages": [
      { "role": "customer", "content": "I had a rough day at work." }
    ]
  },
  "response": {
    "assistant_output": "Yeah, that sounds heavy. Do you want to talk it through, or keep it light for a bit?",
    "candidate_replies": [
      "Yeah, that sounds heavy. Do you want to talk it through, or keep it light for a bit?",
      "Sorry to hear that. Let me know if I can help.",
      "I’m here if you need anything."
    ],
    "chosen_reply_index": 0,
    "question_budget": 1,
    "opening_style": "warm_acknowledgement",
    "closing_style": "open_finish"
  },
  "labels": {
    "sample_stage": "familiar",
    "sample_intent": "support",
    "emotional_goal": "comfort_and_validation",
    "flirtation_level": "none",
    "relationship_move": "hold_space",
    "quality_label": "strong",
    "feedback_score": 0.95,
    "feedback_label": "thumb_up"
  },
  "strategy_snapshot": {
    "intent": "support",
    "replyLayer": "emotional_value",
    "goal": "comfort_and_ask",
    "tone": "warm",
    "pace": "balanced"
  },
  "context_snapshot": {
    "persona": {},
    "memory": {},
    "relationship": {}
  }
}
```

### Required fields

- `schema_version`
  - Keep this at `companion_v1` for the new track.

- `product_track`
  - Use `45plus_us_men` for this product line.

- `audience_profile`
  - Captures the target user segment.

- `relationship_profile`
  - Captures the current intimacy and flirtation ceiling.

- `conversation_goal`
  - Describes what the reply is trying to do.

- `context`
  - Keeps the raw user input, memory, and recent turn context.

- `response`
  - Stores the assistant reply and candidate replies.

- `labels`
  - Stores human or heuristic labels for training and filtering.
  - Includes `scenario_class` so the export layer can filter the 12 classes directly.

- `strategy_snapshot`
  - Stores the policy output that produced the reply.

### Why this shape works

- It separates the user segment from the conversation state.
- It separates emotional value from flirtation and partner-like continuity.
- It keeps SFT and DPO compatible with the same base record.
- It makes it easy to filter out samples that are too young, too playful, or too intimate for the wrong stage.

### Practical tagging rules

- Use `reply_layer = emotional_value` when the goal is comfort, grounding, or low-pressure support.
- Use `reply_layer = light_flirt` when the relationship is warm enough for subtle adult warmth but not full partner energy.
- Use `reply_layer = partner_like` when the relationship is already stable and the conversation can support familiar, affectionate continuity.
- Use `flirtation_level = none` for neutral or support-only turns.
- Use `flirtation_level = light` for restrained teasing or affectionate warmth.
- Use `flirtation_level = medium` only when the relationship is already trusted.
- Avoid `flirtation_level = heavy` in early data unless you are deliberately building a separate adult-only subset.

## 1.2 Recommended Scenario Classes

For this product, the first version of the companion dataset should be split into 12 classes:

1. `calm_checkin`
   - Light opening, easy check-in, no pressure.

2. `work_fatigue`
   - Work stress, long day, mental drain, end-of-day crash.

3. `sleep_and_night`
   - Late-night thoughts, trouble sleeping, quiet-night companionship.

4. `weekend_rhythm`
   - Slow weekend, routines, coffee, sports, small daily life.

5. `practical_decision`
   - Short advice, clear next step, no overexplaining.

6. `emotional_tension`
   - Frustration, loneliness, irritability, feeling off.

7. `low_pressure_support`
   - User needs comfort, but does not want a big talk.

8. `light_flirt`
   - Adult subtle warmth, small teasing, gentle attraction.

9. `mutual_affection`
   - Familiar warmth, soft appreciation, remembered details.

10. `partner_like_continuity`
    - Stable, recurring, familiar companion energy.

11. `cooldown_and_repair`
    - After distance, irritation, or emotional drift.

12. `deep_continuity`
    - Long-term memory callbacks, ongoing thread maintenance, relationship stability.

### Suggested labels for each class

- `sample_stage`
  - `new`, `familiar`, `trusted`, `light_romantic`, `stable_companion`

- `sample_intent`
  - `support`, `smalltalk`, `practical`, `explore`

- `reply_layer`
  - `emotional_value`, `light_flirt`, `partner_like`

- `emotional_goal`
  - `comfort_and_validation`, `reduce_tension`, `keep_connection`, `build_affection`, `strengthen_continuity`

- `flirtation_level`
  - `none`, `light`, `medium`

- `relationship_move`
  - `hold_space`, `soft_reassure`, `light_tease`, `warm_continue`, `narrow_focus`, `bridge_back`

### Class coverage rule

- Keep `calm_checkin`, `work_fatigue`, and `sleep_and_night` as the base support set.
- Keep `weekend_rhythm` and `practical_decision` as the base daily-life set.
- Use `light_flirt`, `mutual_affection`, and `partner_like_continuity` only after the relationship stage supports it.
- Keep `cooldown_and_repair` and `deep_continuity` for long-term retention quality.
- Make sure negative samples are included in every class, especially for over-therapizing, over-flirting, and stock corporate language.

### What each field means

- `customer_input`
  - The actual user message.

- `assistant_output`
  - The reply that was actually sent or selected as the best answer.

- `candidate_replies`
  - All candidate replies generated for this turn, if available.

- `chosen_reply_index`
  - Which candidate reply is considered the best one.
  - Use `-1` when there is no labeled choice yet.

- `question_budget`
  - How many questions the reply is allowed to ask.

- `opening_style`
  - How the response opens.
  - Example values:
    - `warm_acknowledgement`
    - `light_entry`
    - `soft_follow_up`

- `closing_style`
  - How the response ends.
  - Example values:
    - `open_finish`
    - `gentle_stop`
    - `invite_more`

- `strategy_snapshot`
  - The policy layer state at generation time.

- `context_snapshot`
  - The context builder output.
  - Useful when later debugging why a response was chosen.

- `feedback_score`
  - Human score or post-launch score.

- `feedback_label`
  - For example:
    - `thumb_up`
    - `thumb_down`
    - `natural`
    - `too_formal`

- `feedback_note`
  - Short reviewer note.

## 2. Positive / Negative Sample Rules

The project should train on what feels human, not what sounds polished.

### Positive samples

Good samples usually have these traits:

- short and direct
- emotionally responsive
- easy to continue
- one clear topic at a time
- natural follow-up question only when needed
- no rigid opening or closing template

Examples of positive behavior:

- acknowledges the user’s feeling first
- picks up a concrete detail from the last message
- keeps the tone warm and relaxed
- asks only one useful question, not a chain
- ends in a way that feels open, not formal

### Negative samples

Bad samples usually have these traits:

- customer support tone
- too many questions
- obvious template language
- “I am here if you need anything”
- “Let me know if I can help”
- over-explaining
- over-cheerful or unnatural phrasing
- repeated generic empathy with no actual follow-up

### Labeling rule of thumb

When comparing candidates, prefer the reply that is:

1. more natural
2. less AI-like
3. less repetitive
4. more context-aware
5. easier to keep chatting with

## 3. JSONL Export Structure

The current Worker can export training data through:

- `GET /admin/training/export?dataset=sft&format=jsonl`
- `GET /admin/training/export?dataset=dpo&format=jsonl`
- `GET /admin/training/export?dataset=raw&format=jsonl`
- `POST /admin/training/annotate`
- `GET /admin/training?status=unlabeled`

The export endpoint also accepts `scenario_class`:

- `GET /admin/training/export?dataset=sft&format=jsonl&scenario_class=work_fatigue`
- `GET /admin/training/export?dataset=dpo&format=jsonl&scenario_class=light_flirt`
- `GET /admin/training/export?dataset=sft&format=jsonl&scenario_class=work_fatigue,emotional_tension`
- `GET /admin/training/export?dataset=sft&format=jsonl&scenario_class=all`

Supported values:

- `calm_checkin`
- `work_fatigue`
- `sleep_and_night`
- `weekend_rhythm`
- `practical_decision`
- `emotional_tension`
- `low_pressure_support`
- `light_flirt`
- `mutual_affection`
- `partner_like_continuity`
- `cooldown_and_repair`
- `deep_continuity`

The admin page also includes a small annotation panel:

- one-click choose a candidate as `chosen`
- manually save a `chosen / rejected` pair when the sample still needs hand curation
- default view can focus on unlabeled samples so you can label them in sequence

For operator-maintained personal memories, use the separate memory facts panel in `/admin/memory/facts` rather than the training export flow. This is the preferred workflow when you want to keep the chosen / rejected pairs clean.

### 3.0 New export shape

The export now emits a companion-oriented wrapper for each sample:

- `schema_version: companion_v1`
- `product_track: 45plus_us_men`
- `audience_profile`
- `relationship_profile`
- `conversation_goal`
- `context`
- `response`
- `labels`
- `strategy_snapshot`
- `context_snapshot`

For compatibility, SFT exports still include `messages`, and DPO exports still include `prompt`, `chosen`, and `rejected`.

The old metadata is still attached under `metadata`, so downstream consumers can migrate gradually.

### 3.1 SFT export

Use this when you want supervised fine-tuning data.

Each line is one JSON object:

```json
{
  "id": 12,
  "type": "sft",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "I had a rough day at work." },
    { "role": "assistant", "content": "That sounds exhausting..." }
  ],
  "metadata": {
    "chat_user_id": "u_1001",
    "session_id": "s_20260619_01",
    "source_message_id": "msg_8891",
    "prompt_version": "v1",
    "sample_stage": "familiar",
    "sample_intent": "smalltalk",
    "question_budget": 1,
    "opening_style": "warm_acknowledgement",
    "closing_style": "open_finish",
    "feedback_score": 0.95,
    "feedback_label": "thumb_up",
    "feedback_note": "natural"
  }
}
```

### 3.2 DPO export

Use this when you want preference training data.

Each line is one pairwise preference record:

```json
{
  "id": 12,
  "type": "dpo",
  "prompt": "You are Mia...\\n\\nUser: I had a rough day at work.",
  "chosen": "That sounds exhausting. Do you want to vent a little or would you rather switch topics for a bit?",
  "rejected": "I am here if you need anything.",
  "metadata": {
    "chat_user_id": "u_1001",
    "session_id": "s_20260619_01",
    "sample_stage": "familiar",
    "sample_intent": "smalltalk"
  }
}
```

### 3.3 Raw export

Raw export keeps the stored DB row shape.

Use this only for debugging or quick inspection.

### 3.4 Final cleaned export

The repository no longer keeps a local `data/` cache. Use the online sync route and export from D1 instead.

These are the versions to use when you want a cleaner starting point for LoRA / DPO preparation.

### 3.5 Annotation writeback

When you select a candidate in the admin page, the system stores:

- `candidate_replies_json`
- `chosen_reply_index`
- `sample_stage = labeled`

If you save a manual pair, the system writes:

- `candidate_replies_json = [chosen, rejected]`
- `chosen_reply_index = 0`
- `sample_stage = labeled`

## 4. How to Feed LoRA / DPO

### Stage 1: build a clean SFT dataset

Start with the strongest positive examples only.

Recommended process:

1. export `dataset=sft`
2. filter out noisy or uncertain samples
3. keep only the samples that sound genuinely human
4. train a small LoRA adapter first

### Stage 2: train a light LoRA / PEFT adapter

Use the SFT data to teach:

- speaking style
- opening style
- short follow-up structure
- how to avoid customer-support phrasing
- how to keep a natural pace

This stage should mainly teach the model *how to sound*.

### Stage 3: build DPO preference pairs

Use the DPO export when you already have:

- one chosen reply
- one or more rejected replies

This stage should mainly teach the model *what to prefer*.

Useful preference targets:

- chosen: natural, short, warm, context-aware
- rejected: template-heavy, too formal, too eager, too many questions

### Stage 4: keep runtime guardrails

Even after training, keep these runtime layers:

- Dialogue Policy Engine
- Post-processing
- Memory Writer
- Safety Layer

The reason is simple:

- training improves the base behavior
- runtime layers keep the product stable
- the system stays controllable after deployment

## 4.1 Scenario Class Structure

For the current 45+ US male companion track, keep the training set grouped into 12 human-editable scenario classes:

- `calm_checkin`
- `work_fatigue`
- `sleep_and_night`
- `weekend_rhythm`
- `practical_decision`
- `emotional_tension`
- `low_pressure_support`
- `light_flirt`
- `mutual_affection`
- `partner_like_continuity`
- `cooldown_and_repair`
- `deep_continuity`

Rules:

- each sample should have one primary class
- annotators may override the heuristic when the conversation context is clearer
- export filtering should use the stored class first, not a recalculated guess
- class balance should be checked before every training run

Suggested target counts:

- `calm_checkin`: 30 to 50
- `work_fatigue`: 30 to 50
- `sleep_and_night`: 20 to 40
- `weekend_rhythm`: 15 to 30
- `practical_decision`: 25 to 40
- `emotional_tension`: 20 to 40
- `low_pressure_support`: 15 to 30
- `light_flirt`: 15 to 30
- `mutual_affection`: 15 to 30
- `partner_like_continuity`: 10 to 25
- `cooldown_and_repair`: 10 to 20
- `deep_continuity`: 10 to 20

The exact numbers are flexible. The important part is to avoid a dataset that only covers support and practical questions while missing intimacy and continuity.

## 5. Recommended Practical Order

If you want the fastest real-world result, do it in this order:

1. collect real samples
2. label the best reply
3. export SFT JSONL
4. train a small LoRA
5. export DPO pairs
6. train preference optimization
7. keep iterating with live feedback

## 5.1 Manual Evaluation Standard

When you review a batch of replies, score each sample from `1` to `5`:

- `5` - natural, emotionally appropriate, and clearly fits the relationship stage
- `4` - strong, with only a minor wording or pacing issue
- `3` - acceptable, but generic or slightly stiff
- `2` - weak fit, awkward intimacy, or off-target style
- `1` - unusable, unsafe, or obviously machine-like

Judge these dimensions separately:

- naturalness
- emotional value
- intimacy appropriateness
- stage fit
- continuity with prior context
- 45+ American male tone fit

Pass / fail checks:

- support replies should make the user feel heard before asking for anything
- `light_flirt` should stay subtle
- `partner_like_continuity` should only appear when the relationship is truly established
- repeated questions in a short span should be penalized
- AI disclaimers, customer-support closings, and generic filler should fail

Batch rule:

- if a scenario class averages below `4.0`, pause export for that class and collect more examples before training
- if a class has fewer than `10` good samples, do not treat it as ready for preference training

## 6. Current Project Status

This repository already has:

- training sample collection
- training feedback writeback
- training sample UI
- JSONL export routes
- a path for later LoRA / DPO conversion
- a reproducible public-data seed generator
- a final cleaning pass for direct training use
- current public-dialogue final sets
  - SFT: 100
  - DPO: 40

That means the project is no longer just a chatbot backend.
It is already a data-producing system for future model alignment.
