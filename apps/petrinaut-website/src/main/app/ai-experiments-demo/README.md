---
layer: website.ai-experiments
role: Demonstrates experiment client tools with scripted chat and real browser execution
---

The `/ai-experiments` route supplies a saved model and a scripted AI SDK
transport to Petrinaut. The transport issues `createExperiment`; the editor's
host validates and runs it, and its chat renders progress and the result.

The conversation first describes a fixed experiment recipe, then starts it
when asked to run or optimize. Replies stream with short pauses; run progress
comes from the experiment host. Completion messages use the returned metric
and selected parameter values, including cancellation and missing results.

The SIR example is an illustrative model. Its results are computed simulations,
not measured flu data. The metric is the mean infected share in the last
populated distribution frame; runs that ended earlier may be absent. Searching
the initial infected share demonstrates parameter search, not a health intervention.

This demo exercises Petrinaut's tool contract and presentation. Brunch owns
its production tool selection, transport integration, and agent behavior.
See <a href="/architecture/core/ai/client-integration">AI client integration</a> for the responsibility
boundary and <a href="/architecture/react/ai-experiments/ai-created-experiments#try-the-demo">AI-created experiments</a>
for the demo steps.

The user guide covers [AI chat](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs/ai-assistant.md#experiments-from-chat)
and [experiment controls](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs/experiments.md#experiments-created-by-the-assistant).
