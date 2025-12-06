# Mastra-Based NER/Entity Extraction Optimization Project

## Quick Start: First Implementation Steps

When ready to begin, start with these tasks in order:

1. **Create entity type schemas** (`src/mastra/types/entities.ts`)
   - Port `LocalEntitySummary` type from `hash-ai-worker-ts/src/activities/infer-entities/shared/`
   - Define generic NER types: Person, Organization, Location, Date, Event

2. **Create baseline extraction tool** (`src/mastra/tools/extract-entities-basic.ts`)
   - Single-pass LLM extraction as baseline benchmark

3. **Create entity recall scorer** (`src/mastra/scorers/entity-recall.ts`)
   - Using Mastra's `createScorer` with 4-step pipeline

4. **Audit test data** in `hash-ai-worker-ts/src/activities/shared/`
   - Look for `judge-ai-output-optimize/judge-test-data.ts` and similar

---

## Executive Summary

Migrate and optimize HASH's AI entity extraction capabilities from `hash-ai-worker-ts` to a structured Mastra-based architecture in `hash-ai-agent`. Focus on NER (Named Entity Recognition) with emphasis on:

- **Establishing baselines** for current performance
- **Decomposition techniques** for step-wise processing
- **Evaluation-driven optimization** for accuracy and cost efficiency

---

## Phase 1: Foundation & Baseline (Week 1-2)

### 1.1 Define Core Entity Types and Schemas

**Goal**: Establish the data structures for entity extraction

**Files to create**:

- `src/mastra/types/entities.ts` - Core entity type definitions
- `src/mastra/types/claims.ts` - Claims and relationship types
- `src/mastra/schemas/` - Zod schemas for entity validation

**Key schemas to port from hash-ai-worker-ts**:

- Entity summary schema (from `infer-entities/shared/`)
- Full entity properties schema
- Claims schema with source provenance
- Entity linking/deduplication types

### 1.2 Create Baseline Entity Extraction Tool

**Goal**: Simple single-pass NER tool as baseline

**Files to create**:

- `src/mastra/tools/extract-entities-basic.ts`

**Implementation**:

```typescript
// Single-pass extraction - baseline for comparison
const extractEntitiesBasic = createTool({
  id: "extract-entities-basic",
  description: "Extract all named entities from text in a single pass",
  inputSchema: z.object({
    text: z.string(),
    entityTypes: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    entities: z.array(EntitySchema),
  }),
  execute: async ({ text, entityTypes }) => { /* ... */ }
});
```

### 1.3 Create Evaluation Scorers for Entity Extraction

**Goal**: Build custom scorers to measure NER quality

**Files to create**:

- `src/mastra/scorers/entity-recall.ts` - Measures completeness (all entities found)
- `src/mastra/scorers/entity-precision.ts` - Measures accuracy (no hallucinated entities)
- `src/mastra/scorers/entity-property-accuracy.ts` - Property value correctness
- `src/mastra/scorers/entity-deduplication.ts` - Proper entity merging

**Example scorer structure**:

```typescript
export const entityRecallScorer = createScorer({
  name: "Entity Recall",
  description: "Measures percentage of ground truth entities found",
  type: "agent",
})
  .preprocess(({ run }) => {
    // Extract entities from output and ground truth
  })
  .analyze({
    description: "Compare extracted vs expected entities",
    outputSchema: z.object({
      foundEntities: z.array(z.string()),
      missedEntities: z.array(z.string()),
      totalExpected: z.number(),
    }),
    createPrompt: ({ run, results }) => /* ... */
  })
  .generateScore(({ results }) => {
    const { foundEntities, totalExpected } = results.analyzeStepResult;
    return foundEntities.length / totalExpected;
  })
  .generateReason({ /* ... */ });
```

### 1.4 Create Test Dataset

**Goal**: Golden dataset for benchmarking

**Files to create**:

- `src/mastra/evals/test-data/ner-test-cases.ts`

**Include**:

- Documents with known entities (ground truth)
- Varying complexity levels (simple → complex)
- Different domains (technical, business, scientific)
- Edge cases (ambiguous entities, multi-type entities)

---

## Phase 2: Two-Step Decomposition (Week 3-4)

### 2.1 Implement Two-Step Entity Extraction (Port from hash-ai-worker-ts)

**Goal**: Replicate the proven two-step approach

**Rationale** (from existing codebase):
> "Allows inferring more entities before hitting token limits"

**Files to create**:

- `src/mastra/tools/extract-entity-summaries.ts` - Step 1: Extract entity names + brief summaries
- `src/mastra/tools/extract-entity-properties.ts` - Step 2: Full property extraction per entity

**Step 1 - Entity Summaries**:

```typescript
const extractEntitySummaries = createTool({
  id: "extract-entity-summaries",
  description: "Extract entity names and brief summaries from text",
  inputSchema: z.object({
    text: z.string(),
    entityTypes: z.array(z.string()),
  }),
  outputSchema: z.object({
    summaries: z.array(z.object({
      name: z.string(),
      type: z.string(),
      briefSummary: z.string(),
      textSpan: z.object({ start: z.number(), end: z.number() }),
    })),
  }),
});
```

**Step 2 - Full Properties**:

```typescript
const extractEntityProperties = createTool({
  id: "extract-entity-properties",
  description: "Extract full properties for a specific entity",
  inputSchema: z.object({
    text: z.string(),
    entitySummary: EntitySummarySchema,
    propertySchema: z.record(z.any()), // Dynamic based on entity type
  }),
  outputSchema: z.object({
    entity: FullEntitySchema,
  }),
});
```

### 2.2 Create Two-Step Entity Extraction Workflow

**Goal**: Orchestrate the two-step process

**Files to create**:

- `src/mastra/workflows/extract-entities-two-step.ts`

```typescript
export const extractEntitiesTwoStep = createWorkflow({
  id: "extract-entities-two-step",
  description: "Two-step entity extraction for improved recall",
  inputSchema: z.object({
    text: z.string(),
    entityTypes: z.array(z.string()),
  }),
  outputSchema: z.object({
    entities: z.array(FullEntitySchema),
  }),
})
  .then(extractSummariesStep)
  .foreach(extractPropertiesStep, { concurrency: 5 })
  .then(deduplicateStep)
  .commit();
```

### 2.3 Compare Baseline vs Two-Step

**Goal**: Quantify improvement from decomposition

**Files to create**:

- `src/mastra/evals/compare-extraction-methods.eval.ts`

**Metrics to track**:

- Entity recall (completeness)
- Entity precision (accuracy)
- Token usage / cost
- Latency
- Property accuracy

---

## Phase 3: Claims-Based Extraction (Week 5-6)

### 3.1 Implement Claims Extraction

**Goal**: Separate entity recognition from relationship extraction

**Files to create**:

- `src/mastra/tools/extract-claims.ts`
- `src/mastra/types/claims.ts`

**Claims Schema** (from hash-ai-worker-ts):

```typescript
const ClaimSchema = z.object({
  claimId: z.string(),
  subjectEntityLocalId: z.string(),
  objectEntityLocalId: z.string().optional(),
  text: z.string(),
  prepositionalPhrases: z.array(z.string()),
  sources: z.array(SourceProvenanceSchema).optional(),
});
```

### 3.2 Create Three-Step Workflow

**Goal**: Entity summaries → Claims → Full entities with relationships

**Files to create**:

- `src/mastra/workflows/extract-entities-with-claims.ts`

```typescript
export const extractEntitiesWithClaims = createWorkflow({
  id: "extract-entities-with-claims",
  description: "Three-step extraction with claims for relationship inference",
})
  .then(extractSummariesStep)
  .then(extractClaimsStep)  // New: extract claims about entities
  .foreach(proposeEntitiesFromClaimsStep)
  .then(linkEntitiesStep)   // Create relationships from claims
  .commit();
```

### 3.3 Add Claims-Based Scorers

**Goal**: Evaluate relationship extraction quality

**Files to create**:

- `src/mastra/scorers/claim-accuracy.ts`
- `src/mastra/scorers/relationship-extraction.ts`

---

## Phase 4: Entity Deduplication & Matching (Week 7-8)

### 4.1 Implement Entity Matching Agent

**Goal**: Intelligent entity deduplication

**Files to create**:

- `src/mastra/agents/entity-matcher.ts`
- `src/mastra/tools/match-entity.ts`

**Port from hash-ai-worker-ts `match-existing-entity.ts`**:

- LLM-based semantic matching
- Cautious matching strategy (err on side of caution)
- Property merging for matched entities

### 4.2 Create Deduplication Scorer

**Goal**: Measure deduplication quality

**Files to create**:

- `src/mastra/scorers/deduplication-quality.ts`

**Metrics**:

- False positive rate (incorrectly merged entities)
- False negative rate (missed duplicates)
- Property conflict resolution quality

---

## Phase 5: Document Processing Pipeline (Week 9-10)

### 5.1 Create Document Chunking Tools

**Goal**: Handle large documents

**Files to create**:

- `src/mastra/tools/chunk-document.ts`
- `src/mastra/tools/merge-entity-results.ts`

### 5.2 Create Full Document Extraction Workflow

**Goal**: End-to-end document → entities pipeline

**Files to create**:

- `src/mastra/workflows/process-document.ts`

```typescript
export const processDocument = createWorkflow({
  id: "process-document",
  description: "Full document processing pipeline",
})
  .then(chunkDocumentStep)
  .foreach(extractEntitiesStep, { concurrency: 3 })
  .then(mergeResultsStep)
  .then(globalDeduplicationStep)
  .commit();
```

### 5.3 Add Document-Level Scorers

**Goal**: Evaluate full pipeline quality

**Files to create**:

- `src/mastra/scorers/document-coverage.ts`
- `src/mastra/scorers/cross-chunk-consistency.ts`

---

## Phase 6: Model Optimization & Cost Reduction (Week 11-12)

### 6.1 Implement Multi-Model Strategy

**Goal**: Use appropriate models for each step

**Strategy**:

- **Fast/cheap model** (e.g., GPT-4o-mini, Claude Haiku): Entity summaries, chunking
- **Accurate model** (e.g., GPT-4o, Claude Sonnet): Property extraction, complex entities
- **Judge model**: Evaluation, deduplication decisions

### 6.2 Create Model Router Agent

**Goal**: Dynamic model selection based on task complexity

**Files to create**:

- `src/mastra/agents/model-router.ts`

### 6.3 Cost/Quality Pareto Analysis

**Goal**: Find optimal cost/quality tradeoffs

**Files to create**:

- `src/mastra/evals/cost-quality-analysis.eval.ts`

**Track per approach**:

- Total tokens used (input + output)
- Estimated cost
- Quality scores (recall, precision, F1)
- Pareto-optimal configurations

---

## Phase 7: Consolidation & API Surface (Week 13-14)

### 7.1 Create NER Agent for API Exposure

**Goal**: Clean API surface for entity extraction

**Files to create**:

- `src/mastra/agents/ner-agent.ts`

```typescript
export const nerAgent = new Agent({
  id: "ner-agent",
  name: "NER Agent",
  description: "Named Entity Recognition agent for document processing",
  instructions: `You extract and classify named entities from documents...`,
  model: "openai/gpt-4o",
  tools: {
    extractEntitiesBasic,
    extractEntitiesTwoStep,
    extractEntitiesWithClaims,
  },
  workflows: {
    processDocument,
  },
  scorers: {
    entityRecall: { scorer: entityRecallScorer, sampling: { type: "ratio", rate: 0.1 } },
    entityPrecision: { scorer: entityPrecisionScorer, sampling: { type: "ratio", rate: 0.1 } },
  },
});
```

### 7.2 Prepare for HASH Graph Integration (Deferred)

**Goal**: Design clean interfaces for future integration

**Files to create**:

- `src/mastra/types/graph-interfaces.ts` - Abstract interfaces for entity persistence
- `src/mastra/tools/mock-graph-adapter.ts` - Mock implementation for testing

**Note**: Actual HASH Graph integration deferred to future phase. Focus on:

- Clean interface definitions
- Mock adapters for local testing
- Output format compatible with HASH Graph entity schema

---

## Key Metrics & Success Criteria

### Baseline Targets (to establish in Phase 1)

| Metric | Current (estimated) | Target |
|--------|---------------------|--------|
| Entity Recall | ~70% | ≥90% |
| Entity Precision | ~80% | ≥95% |
| Property Accuracy | ~75% | ≥90% |
| Cost per 1000 entities | $X | <50% of X |

### Evaluation Cadence

- **Per commit**: Run fast eval suite (subset of test cases)
- **Per PR**: Full eval suite with cost tracking
- **Weekly**: Comparison across approaches, Pareto analysis

---

## Files Structure Summary

```
apps/hash-ai-agent/src/mastra/
├── agents/
│   ├── ner-agent.ts
│   ├── entity-matcher.ts
│   └── model-router.ts
├── tools/
│   ├── extract-entities-basic.ts
│   ├── extract-entity-summaries.ts
│   ├── extract-entity-properties.ts
│   ├── extract-claims.ts
│   ├── match-entity.ts
│   ├── chunk-document.ts
│   └── merge-entity-results.ts
├── workflows/
│   ├── extract-entities-two-step.ts
│   ├── extract-entities-with-claims.ts
│   └── process-document.ts
├── scorers/
│   ├── entity-recall.ts
│   ├── entity-precision.ts
│   ├── entity-property-accuracy.ts
│   ├── entity-deduplication.ts
│   ├── claim-accuracy.ts
│   └── relationship-extraction.ts
├── types/
│   ├── entities.ts
│   └── claims.ts
├── schemas/
│   └── entity-schemas.ts
└── evals/
    ├── test-data/
    │   └── ner-test-cases.ts
    ├── compare-extraction-methods.eval.ts
    └── cost-quality-analysis.eval.ts
```

---

## Critical Dependencies

1. **Mastra packages** (already installed):
   - `@mastra/core` - Agents, tools, workflows
   - `@mastra/evals` - Scorers and evaluation
   - `@mastra/memory` - Conversation memory (for iterative extraction)

2. **Model access**:
   - OpenAI API (GPT-4o, GPT-4o-mini)
   - Anthropic API (Claude Sonnet, Haiku) via OpenRouter

3. **Test data**:
   - Need to create or port golden test dataset from hash-ai-worker-ts

---

## Decisions Made

1. **Entity Types**: Start with generic NER types (Person, Organization, Location, Date, Event), then extend to HASH-specific types from the graph schema.

2. **Test Data**: Partial data exists in hash-ai-worker-ts - will need to audit and augment.

3. **HASH Graph Integration**: Deferred - focus on extraction quality first, integrate later.

4. **Optimization Focus**: Accuracy first - maximize recall/precision, with future ability to vary dynamically per use case.

5. **Scope**: Pure extraction POC, no real-time latency requirements initially.
