# Dialogue Sources For Training Seeds

These are good public references to seed the project with human-like dialogue patterns before you add more real product conversations.

## 1. DailyDialog

- Paper: https://arxiv.org/abs/1710.03957
- Why it helps:
  - clean daily-life conversations
  - short turns
  - labeled intent and emotion
  - useful for simple natural openings and closings

## 2. EmpatheticDialogues

- Paper: https://arxiv.org/abs/1811.00207
- Why it helps:
  - emotional situations
  - empathetic acknowledgement
  - low-pressure follow-up questions
  - useful for support-style companion behavior

## 3. ConvAI2 / Persona-Chat style data

- Paper: https://arxiv.org/abs/1809.01984
- Follow-up benchmark paper: https://arxiv.org/abs/1902.00098
- Why it helps:
  - persona consistency
  - open-domain personalized conversation
  - useful for keeping a stable identity over time

## 4. BlendedSkillTalk

- Paper: https://arxiv.org/abs/2004.08449
- Why it helps:
  - blends empathy, knowledge, and persona
  - useful for conversations that need more than one skill at once

## 5. Wizard of Wikipedia

- Paper: https://arxiv.org/abs/1811.01241
- Why it helps:
  - grounded topic bridging
  - short informative turns
  - useful for moving from small talk to a concrete subject without sounding stiff

## 6. Topical-Chat

- Project page: https://www.amazon.science/code-and-datasets/topical-chat
- Why it helps:
  - open-domain topical conversation
  - natural transitions between subjects
  - useful for keeping a conversation moving when the user shifts topics quickly

## 7. OpenSubtitles2016

- Paper: https://aclanthology.org/L16-1147/
- Dataset page: https://opus.nlpl.eu/datasets/OpenSubtitles
- Why it helps:
  - very large subtitle-derived dialogue pool
  - short, spoken, high-frequency turns
  - useful for casual phrasing, quick reactions, and everyday口语节奏
  - best used after filtering, because raw subtitle text is noisier than the other sources

## 8. Reddit / Pushshift Reddit threads

- Paper: https://arxiv.org/abs/2001.08435
- Why it helps:
  - open-domain thread-style discussion
  - useful for long-tail topics and reply chaining
  - good for training the model to stay on a thread without sounding over-structured
  - best treated as a style and structure reference, not as raw production text

## Recommended Usage

- Use public data as style seeds, not as the final product dataset.
- Mix public data with your own live conversation samples.
- Keep public-seed records tagged in metadata so you can filter them later.
- Prefer short, human-like replies over polished assistant language.
- Do not use public data to teach the model to openly disclose system identity in normal chat; identity questions should be handled by the product's own safety layer.
- Use the more grounded sources, like Wizard of Wikipedia and Topical-Chat, sparingly and mainly for topic bridging or lightweight factual follow-up.
- Use OpenSubtitles2016 as a secondary style source when you want more natural spoken cadence and more casual turn-taking.
- Use Reddit threads when you want more thread-like open-domain flow, but filter them carefully because thread quality varies a lot.

## 9. FlirtFlip

- Dataset page: https://huggingface.co/datasets/shirshatzman/flirtflip-dataset
- Why it helps:
  - style-transfer dataset for flirtatious rewrites
  - includes gentle, playful, and bold variants
  - useful for light flirtation and controlled warmth
  - best used as a seed layer, with gentle variants preferred for the final training set
