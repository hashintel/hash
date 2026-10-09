---
layer: website.ai-experiments
role: Demonstrates experiment client tools with scripted chat and real browser execution
---

The `/ai-experiments` route gives Petrinaut a saved model and an assistant
plugin whose view is the website's assistant chat over a scripted AI SDK
transport. The transport issues `createExperiment`; the chat runs it through
the plugin's `api.experiments.run`, which the editor's experiment host
validates and runs, and renders progress and the result.

The conversation first describes a fixed experiment recipe, then starts it
when asked to run or optimize. Replies stream with short pauses; run progress
comes from the experiment host. Completion messages use the returned metric
and selected parameter values, including cancellation and missing results.

The SIR example is an illustrative model. Its results are computed simulations,
not measured flu data. The metric is the mean infected share in the last
populated distribution frame; runs that ended earlier may be absent. Searching
the initial infected share demonstrates parameter search, not a health intervention.

This demo exercises Petrinaut's experiment contract and the website chat's
presentation. Brunch owns its production tool selection, transport
integration, and agent behavior.
See <a href="/architecture/core/experiments/client-integration">AI client integration</a> for the responsibility
boundary and <a href="/architecture/react/experiment-host/ai-created-experiments#try-the-demo">AI-created experiments</a>
for the demo steps.

The user guide covers [AI chat](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs/ai-assistant.md#experiments-from-chat)
and [experiment controls](https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs/experiments.md#experiments-created-by-the-assistant).
