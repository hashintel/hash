# Integrating Temporal with Agent Frameworks

# Research January 23, 2026

The following researches were made with the goals in mind that we want to durability and distributed-service-as-backend abstraction (over retrying, rate-limiting, queuing, pooling, etc) that is offered by Temporal, but we also want the observability and tracing across complex workflow structures, such as offered by Mastra (or something comparable)

## Temporal + OpenAI Agent SDK

<aside>
<img src="https://www.notion.so/icons/asterisk_lightgray.svg" alt="https://www.notion.so/icons/asterisk_lightgray.svg" width="40px" />

Based on the following workshop and reference links

- https://www.youtube.com/watch?v=k8cnVCMYmNc
- https://github.com/temporalio/edu-ai-workshop-openai-agents-sdk/
- https://github.com/temporalio/ai-cookbook/tree/agentic_loop
    - NOTE: only on `agentic_loop` branch
- https://github.com/temporalio/sdk-python/tree/main/temporalio/contrib/openai_agents
    - NOTE: this is Temporal’s python-only integration for openai’s agent SDK
- https://docs.temporal.io/ai-cookbook
- blogs
    - https://temporal.io/blog/announcing-openai-agents-sdk-integration
    - https://temporal.io/blog/build-durable-ai-agents-pydantic-ai-and-temporal
</aside>

### Overview

This seminar runs through two demos of doing agents with Temporal, one using direct inference calls, the other using the OpenAI Agents SDK. In general, Temporal is promoted here as handling *all of the technical concerns around distributed service orchestration*, such as concurrency, quorum, backoff, queues, etc. (not sure if this would translate 100% for our use-case?)

### 1. Temporal + direct LLM calls

In this demo, the Temporal workflow itself implements the “agentic loop”. Inference and tool calls map to activities; the demo notes that temporal supports a “dynamic activity” which allows the precise activity to be looked up at runtime instead of needing to be declared upfront. The temporal UI shows the events and activities chain that makes up the workflow. 

Q&A outcomes:

- Temporal does not support streaming results (they are working on it)
- Temporal does not support large payload management (they are working on it)
- Complex dynamic workflow structures would have to be implemented with agents-as-tool-calls, or sub-workflows. Unclear how state, events, metadata, tracing etc. would be wired in such a case

### 2. Temporal + the OpenAI Agents SDK

The https://openai.github.io/openai-agents-python/ is a python-first library that implements the typical “agentic loop” architecture in an `Agent` class, and has an abstract `Runner` class such that the executor can be swapped out (this extensibility makes it possible for Temporal to integrate; Temporal maintains a plugin for OASDK, and possibly some other code, which implement this)

Notes/Caveats:

- Python-only/-first. Also seems to rely on python decorators
- OpenAI Agents SDK implements “workflows” either through imperative flow-control or a “handoffs” concept
- *hand-offs* is like changing the context of the agentic loop, swapping in a different agent with its own tools
    - i.e. you "hand off" the LOOP to another agent

### Conclusions

- At a minimum, the *Temporal as Workflow Runner* idea has clearly been picked up somewhere at least
- The lack of streaming data support in Temporal is an issue, because even in cases where the main result is not something that demands streaming, it would affect the ability to stream status/metadata updates, thinking tokens etc

## Temporal + Mastra

<aside>
<img src="https://www.notion.so/icons/asterisk_lightgray.svg" alt="https://www.notion.so/icons/asterisk_lightgray.svg" width="40px" />

Based on the following reference links

- https://github.com/mastra-ai/mastra/tree/workflows-v2-temporal
- https://mastra.ai/blog/announcing-mastra-1
- https://www.inngest.com/
</aside>

The prospect of integrating Temporal as an executor/engine or “runner” for Mastra has been called out by Mastra since Q2 2025. There is [a POC branch on their public repo which has not been touched in 9 months](https://github.com/mastra-ai/mastra/tree/workflows-v2-temporal), which would have corresponded to a 0.x series version of their “workflows” architecture.

In the meantime [Mastra have released v1.0](https://mastra.ai/blog/announcing-mastra-1) as of a week ago, with support for [Inngest](https://www.inngest.com/) instead. This might suggest that Mastra concluded their users were more likely to be using Inngest than Temporal; however the existence of the POC branch means that a Temporal adaptation is likely feasible

The following perplexity thread synthesizes **a comparison of Temporal and Inngest for the agentic workflows use-case** in particular, in terms of their feature supports

[Perplexity](https://www.perplexity.ai/search/please-offer-a-critical-compar-d0_7O.cbTDSmO00X49q4eQ#0)

…and this perplexity thread assesses **the viability more generally, of a Temporal-as-runner architecture in a TS-first agentic development** setup

[Perplexity](https://www.perplexity.ai/search/temporal-v-mastra-split-resear-EtiihTyOSguPKeFN7FkM8g#0)

# Updates January 26, 2026

## Feasibility study of Temporal as executor in Mastra

As complement to the section above about [Temporal + Mastra](https://www.notion.so/Temporal-Mastra-2f13c81fe02480118dbdda726cd6e033?pvs=21), I had several LLMs do analyses of Mastra’s abandoned `workflows-v2-temporal` in comparison with the Inngest integration that they actually ended up shipping

### Summary

The reports differ in some of their risk emphases and effort estimates (the latter are probably nonsense); but all four reports agree that:

1. **Inngest integration is the template** — it's production-ready, demonstrates the correct hook-based `ExecutionEngine` extension pattern (override `wrapDurableOperation`, `executeSleepDuration`, `executeWorkflowStep`, etc.)
2. **Temporal POC is obsolete** — it was built against a "vNext" workflow API that was superseded; cannot be dropped in without major rework; it also reimplemented execution logic instead of extending hooks, which is the wrong pattern; and it lacks durability/persistence, observability/tracing, PubSub, proper suspend/resume, retry logic, serve helpers
3. **A userland Temporal integration is viable** — by subclassing `DefaultExecutionEngine` and creating `TemporalWorkflow`/`TemporalRun` classes, mirroring Inngest's architecture

Which boils down to saying: if we want to do this, we should *start fresh using the Inngest integration as reference, don't try to salvage the POC*

### Detailed Reports

[temporal-integration-report-amp](https://www.notion.so/temporal-integration-report-amp-2f43c81fe024811e9c64e8549aad8806?pvs=21)

[temporal-integration-report-augment](https://www.notion.so/temporal-integration-report-augment-2f43c81fe024816fa1b4fd549adfaa9a?pvs=21)

[temporal-integration-report-claude](https://www.notion.so/temporal-integration-report-claude-2f43c81fe02481f99103e2244a745ab3?pvs=21)

[temporal-integration-report-codex](https://www.notion.so/temporal-integration-report-codex-2f43c81fe0248102b318fdd6183b6739?pvs=21)