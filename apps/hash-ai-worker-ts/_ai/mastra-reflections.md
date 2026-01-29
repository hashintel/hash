# Mastra reflections: where HASH gains control over NER complexity

*Last updated: 2026-01-29*

## Your decisions (I agree)

1. **Tracing first**, then evals.
2. **Mastra should own the LLM calls** (max leverage for tracing + consistent retry/telemetry).

This implies we should make the *first* successful integration goal be:
- “When a Temporal flow step runs NER, I can open a trace and see: workflow → steps → model/tool calls, with HASH IDs attached.”

## What “control” looks like in practice

Mastra gives you *three* concrete control surfaces (beyond “an agent”):

1. **Control over shape**: explicit steps + typed inputs/outputs (workflow is the “pipeline spec”).
2. **Control over execution**: concurrency, branching, per-step failure behavior (workflow is the “scheduler”).
3. **Control over introspection**: built-in tracing + exporters (workflow is the “flight recorder”).

Temporal remains the “durability shell” for long-running/restartable outer orchestration.

## Recommended boundary (Phase 1)

Keep HASH-specific side effects and domain coupling outside Mastra at first:

**Mastra owns (inside the worker):**
- LLM calls
- step sequencing for the bounded NER chain
- step-level tracing (and later scoring)

**HASH/Temporal owns:**
- Graph persistence (entities/claims)
- usage records linked to graph entities
- long-running coordination (10h research), heartbeats, checkpoint/resume

This keeps the migration low-risk and avoids giving Mastra Graph credentials initially.

## Tightest “tracing-first” MVP

### MVP success criteria
- A single existing entrypoint (e.g. `inferEntitiesFromContentAction`) triggers a Mastra workflow run.
- The trace contains:
  - runId that can be derived from `{flowEntityId, stepId}`
  - per-step spans for: `entity-discovery`, `claim-extraction`, `entity-proposal` (and optionally `validation`)
  - model/tool call spans inside each step
  - request metadata (flowEntityId, webId, actorId, model) attached to the trace

### What to implement first
- **One Mastra workflow** for the *bounded chain* you already understand well:
  - summaries → claims → proposeEntitiesFromClaims
- **No dedupe/merge/persist** in the first pass.

Analogy: first make the “compiler pipeline” traceable; don’t change the “linker/writer” yet.

## Request-scoped metadata: the join key back to HASH

Use Mastra `RequestContext` to carry HASH identifiers through every step/tool/model call:
- `flowEntityId`
- `stepId`
- `webId`
- `actorId`
- `workspace/tenant` if relevant
- `model` / `run purpose` (browser-plugin vs research)

Configure observability to automatically extract selected `requestContextKeys` so every span is searchable by those IDs.

## Notes on spec/API alignment (so the implementation is smooth)

The high-level design in `mastra-ner-workflow-spec.md` is right, but some of the pseudocode should be treated as *illustrative*:

- Mastra workflow/step constructors use **`id`** (docs) rather than `name`.
- Step execute signatures use **`inputData`** (docs) rather than `input`.
- Observability/tracing config is via **`observability: new Observability(...)`** (docs), rather than an ad-hoc `telemetry.tracing` object.

These are easy edits once we start implementing.

## Evals (Phase 2, immediately after tracing)

Once traces exist, Mastra evals become much more powerful because you can:
- run scorers in CI on test suites
- score **historical traces** (great for “we shipped a regression yesterday”)
- add sampling for production scoring later

A good first scorer set for NER:
- **claim grounding** (LLM or heuristic + optional judge)
- **schema compliance** (deterministic)
- **tool-call accuracy** (if you use tool calling heavily)

## Architectural fork: embedded vs external service

Given your choice “Mastra owns LLM calls”, I’d still start **embedded in `hash-ai-worker-ts`**:
- avoids contract drift
- avoids network latency + auth + ops
- can still be extracted later if the boundary proves valuable

Promote to external service only if you want independent deployment cadence or multiple clients.

## Next concrete action I recommend

Create a small “Mastra NER runtime spine”:
1. `src/mastra/index.ts`: Mastra instance + observability exporter + requestContextKey extraction
2. `src/mastra/workflows/ner-extraction.ts`: workflow skeleton with 2–3 steps
3. update **one** Temporal activity to call the workflow, pass `RequestContext`, and return results unchanged

Once that works, you’ll *immediately* see whether the tracing win is real (it usually is).

