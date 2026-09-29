---
"@hashintel/petrinaut-core": patch
---

`petrinautAiModel` names the model and reasoning effort Petrinaut assistants run by default: `gpt-5.5-2026-04-23` at `medium`. `@hashintel/petrinaut-core/ai` also exports the stock prompt's behavioural frame and capability guidance separately, as `petrinautAiStockBehavioralFrame` and `petrinautAiCapabilityGuidance`, and composes `petrinautAiPrompt` from them.
