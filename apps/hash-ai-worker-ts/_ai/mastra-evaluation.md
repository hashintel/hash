# Mastra Framework Evaluation for HASH AI Worker

## Executive Summary

This document evaluates whether adopting the [Mastra](https://mastra.ai) agent framework would benefit the HASH AI worker's NER (Named Entity Recognition) system, focusing on three areas where the current implementation has gaps:

1. **Structural organization** of the inference pipeline
2. **Observability and tracing** of LLM operations
3. **Evaluation harnesses** for measuring quality

**Recommendation**: Incremental adoption—use Mastra for evals and observability, keep Temporal for durability, consider Mastra workflows for the bounded NER inference chain.

---

## Current Architecture vs Mastra Capabilities

### What HASH Has Built

| Area | Current Implementation | File Reference | Maturity |
|------|----------------------|----------------|----------|
| **Orchestration** | Temporal workflows with custom DAG engine | `libs/@local/hash-backend-utils/src/flows/process-flow-workflow.ts` | Production-grade |
| **LLM Abstraction** | Custom `getLlmResponse` (OpenAI, Anthropic, Google) | `src/activities/shared/get-llm-response.ts` | Solid but manually maintained |
| **Observability** | JSON logs to file + Sentry + Temporal signals | `src/activities/shared/get-llm-response/log-llm-request.ts`, `src/activities/shared/log-progress.ts` | Functional but fragmented |
| **Evals** | Custom `MetricDefinition` pattern in `.ai.test.ts` | `src/activities/shared/optimize-system-prompt/types.ts` | ~19 test files; ad-hoc |
| **Usage Tracking** | `createUsageRecord` linked to graph entities | `src/activities/shared/get-llm-response.ts` | Custom, tightly coupled |

### Mastra's Corresponding Features

| Area | Mastra Solution | Documentation |
|------|----------------|---------------|
| **Orchestration** | `createWorkflow` / `createStep` with suspend/resume | https://mastra.ai/docs/v1/workflows/overview |
| **Agents** | First-class `Agent` with tools, memory, maxSteps | https://mastra.ai/docs/v1/agents/overview |
| **Observability** | Built-in tracing + Langfuse/Braintrust/OTEL export | https://mastra.ai/docs/v1/observability/overview |
| **Evals** | `@mastra/evals` with built-in scorers, live sampling | https://mastra.ai/docs/v1/evals/overview |
| **Streaming** | Native `.stream()` with `onStepFinish` callbacks | https://mastra.ai/docs/v1/streaming/overview |

---

## Where Mastra Would Be a Win

### 1. Observability & Tracing (High Value)

**Current pain**: Logs are fragmented across JSON files, Sentry, and Temporal signals. No unified dashboard for:
- Token usage by step
- Latency per LLM call
- Agent decision paths
- Retry patterns

**Mastra solution**: Built-in tracing that captures model interactions, agent execution paths, and workflow steps. Exports to Langfuse, Braintrust, Datadog, or any OTEL-compatible platform.

**Effort to build without Mastra**: 2-4 weeks to integrate OTEL + build dashboard

### 2. Evaluation Framework (High Value)

**Current pain**: Evals are scattered across `.ai.test.ts` files with a custom `MetricDefinition` type:

```typescript
// Current pattern (optimize-system-prompt/types.ts)
export type MetricDefinition = {
  name: string;
  description: string;
  executeMetric: (params: {
    testingParams: { model: LlmParams["model"]; systemPrompt: string };
  }) => Promise<MetricResult>;
};
```

Missing:
- Live evaluation (sampling in production)
- Built-in scorers (hallucination, relevance, toxicity)
- CI/CD integration
- Historical trace scoring

**Mastra solution**: `@mastra/evals` provides:
- Built-in scorers for common metrics
- Asynchronous live evaluation with configurable sampling
- Trace scoring via Studio
- Automatic storage in `mastra_scorers` table

**Effort to build without Mastra**: 2-3 weeks to standardize + add live scoring

### 3. NER Inference Chain Structure (Medium Value)

**Current state**: The NER process is embedded in activities:
- `inferEntitySummaries` → `proposeEntities` → validation → claim generation

This two-phase pipeline is well-implemented but:
- Steps are not independently observable
- No standardized input/output schemas between steps
- Retry logic is interleaved with business logic

**Mastra opportunity**: The bounded NER chain (post-document-acquisition) maps naturally to Mastra workflows:

```typescript
// Potential Mastra workflow for NER
const nerWorkflow = createWorkflow({
  name: 'ner-extraction',
  inputSchema: z.object({
    content: z.string(),
    entityTypeIds: z.array(z.string()),
  }),
  outputSchema: z.object({
    proposedEntities: z.array(ProposedEntitySchema),
  }),
})
  .then(entityDiscoveryStep)
  .then(propertyExtractionStep)
  .then(validationStep)
  .then(claimGenerationStep)
  .commit();
```

Each step would:
- Have explicit input/output schemas
- Be independently traceable
- Support scorers for quality measurement
- Allow suspend/resume if needed

---

## Where Mastra Would NOT Help (or Hurt)

### 1. Temporal Durability (Keep Temporal)

The `researchEntitiesAction` has a 10-hour timeout with checkpoint/resume via Temporal signals:

```typescript
// checkpoints.ts - existing pattern
// @todo H-3129: this is only required because so much work is being done in a single long-running activity
//   – the better and more idiomatic Temporal solution is to split it up into multiple activities,
//     probably with the 'researchEntitiesAction' becoming a child workflow that calls activities
```

Mastra workflows support suspend/resume but lack:
- Cross-service orchestration
- Multi-hour activity guarantees
- Heartbeat-based failure detection

**Recommendation**: Keep Temporal for the outer orchestration. A Mastra workflow for NER could be called as a single Temporal activity.

### 2. Graph Integration (HASH-Specific)

Provenance tracking, claim generation, and entity persistence are deeply integrated with HASH Graph:
- `ProposedEntity` with `SourceProvenance`
- `createClaim` / `HashLinkEntity.create`
- `createUsageRecord` → `IncurredIn` links

Mastra has no equivalent abstractions. These remain custom.

### 3. Type-Safe Entity Schemas

The current JSON Schema → LLM tool generation is more precise than Mastra's Zod-based tools for the entity type system. Keep existing approach.

---

## Hybrid Architecture Proposal

```
┌─────────────────────────────────────────────────────────────────┐
│                      Temporal Orchestration                     │
│  (runFlowWorkflow, processFlowWorkflow, researchEntitiesAction) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Temporal Activity: inferEntitiesFromContent         │
│                              │                                   │
│   ┌──────────────────────────▼──────────────────────────────┐   │
│   │              Mastra NER Workflow                         │   │
│   │                                                          │   │
│   │  ┌────────────┐   ┌────────────┐   ┌────────────┐       │   │
│   │  │  Entity    │──▶│  Property  │──▶│ Validation │       │   │
│   │  │ Discovery  │   │ Extraction │   │  & Claims  │       │   │
│   │  └────────────┘   └────────────┘   └────────────┘       │   │
│   │       │                 │                │               │   │
│   │       ▼                 ▼                ▼               │   │
│   │   [Scorers]         [Scorers]        [Scorers]          │   │
│   │   - Recall          - Schema         - Claim            │   │
│   │   - Precision         Compliance      Validity          │   │
│   │                                                          │   │
│   │  ──────────────────────────────────────────────────────  │   │
│   │                  Mastra Tracing Layer                    │   │
│   │                  (→ Langfuse / Studio)                   │   │
│   └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
                    ProposedEntity[] → Graph persistence
```

### Integration Pattern

A Temporal activity could call a Mastra workflow internally:

```typescript
// Temporal activity wrapping Mastra workflow
export const inferEntitiesFromContentAction: AiFlowActionActivity<
  "inferEntitiesFromContent"
> = async ({ inputs }) => {
  // ... existing setup ...
  
  // Call Mastra workflow for the NER chain
  const mastra = new Mastra({ /* config */ });
  const nerWorkflow = mastra.getWorkflow('ner-extraction');
  const run = nerWorkflow.createRun();
  
  const result = await run.start({
    inputData: {
      content: webPage,
      entityTypeIds,
      relevantEntitiesPrompt,
    },
  });
  
  if (result.status === 'success') {
    return transformToProposedEntities(result.result);
  }
  
  // ... error handling ...
};
```

### Heartbeat Integration

For document-by-document durability within a batch, the existing heartbeat pattern could checkpoint after each Mastra workflow completion:

```typescript
for (const document of documents) {
  const result = await nerWorkflow.createRun().start({ inputData: document });
  
  // Checkpoint after each document
  Context.current().heartbeat({ 
    completedDocuments: [...completed, document.id],
    results: [...results, result],
  });
}
```

---

## Concrete Next Steps

### Phase 1: Add Mastra Evals (Low Risk, High Value)

1. Install `@mastra/evals` in `hash-ai-worker-ts`
2. Wrap existing `judgeAiOutputs` with Mastra scorers
3. Add built-in scorers (hallucination, answer relevance) to existing `.ai.test.ts` files
4. Configure live scoring with sampling for production

### Phase 2: Integrate Observability (Low Risk, High Value)

1. Add Langfuse exporter via Mastra's OTEL integration
2. Route `getLlmResponse` calls through Mastra's tracer
3. Gain dashboards without building them

### Phase 3: Prototype NER Workflow (Medium Risk, Medium Value)

1. Extract `inferEntitySummaries` → `proposeEntities` into a Mastra workflow
2. Define explicit step schemas
3. Add per-step scorers
4. Wrap in existing Temporal activity

### Phase 4: Evaluate for New Agent Work

For new agent development (not existing research agent), evaluate whether Mastra's `Agent` abstraction provides value over the current activity-based approach.

---

## Decision Matrix

| Capability | Keep Current | Adopt Mastra | Rationale |
|------------|--------------|--------------|-----------|
| **Temporal Workflows** | ✅ | | Durability, 10hr activities, heartbeat |
| **LLM Provider Abstraction** | ✅ | | Already works, 3 providers |
| **Observability/Tracing** | | ✅ | Major gap, Mastra provides dashboards |
| **Evals/Scorers** | | ✅ | Major gap, built-in metrics |
| **NER Inference Chain** | | ✅ (wrapped) | Better step isolation, scoring |
| **Research Agent** | ✅ | | Too complex to migrate, custom state |
| **Graph Integration** | ✅ | | HASH-specific, no Mastra equivalent |

---

## References

- Mastra Docs: https://mastra.ai/docs
- Mastra Evals: https://mastra.ai/docs/v1/evals/overview
- Mastra Observability: https://mastra.ai/docs/v1/observability/overview
- Mastra Workflows: https://mastra.ai/docs/v1/workflows/overview
- Current Architecture: `apps/hash-ai-worker-ts/_ai/architecture-overview.md`
- Checkpoint Implementation: `src/activities/flow-activities/research-entities-action/checkpoints.ts`

---

*Last updated: 2026-01-29*
