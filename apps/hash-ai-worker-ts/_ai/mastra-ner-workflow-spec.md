# Mastra NER Workflow Implementation Specification

## Overview

This document specifies the implementation of a Mastra-based Named Entity Recognition (NER) workflow that can be called as a service from Temporal activities. The goal is to gain Mastra's benefits (observability, evals, step isolation) while preserving Temporal's durability for the outer orchestration.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Proposed Mastra Architecture](#proposed-mastra-architecture)
3. [Step Definitions](#step-definitions)
4. [Workflow Variants](#workflow-variants)
5. [Observability & Tracing](#observability--tracing)
6. [Evaluation Framework](#evaluation-framework)
7. [Integration with Temporal](#integration-with-temporal)
8. [Benefits Over Current State](#benefits-over-current-state)
9. [Implementation Phases](#implementation-phases)
10. [Open Questions](#open-questions)

---

## Current State Analysis

### Two NER Pipelines

The codebase has **two distinct NER approaches**:

#### 1. Browser Plugin Flow (Legacy)
**Entry**: `inferEntitiesFromContentAction` → `inferEntitiesFromWebPageActivity`

```
WebPage Content
    ↓
┌─────────────────────────────────────────┐
│ inferEntitySummariesFromWebPage         │
│ - LLM: register_entity_summaries tool   │
│ - Output: ProposedEntitySummary[]       │
│ - Max 10 iterations                     │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ proposeEntities                         │
│ - LLM: create_entities tool calls       │
│ - Batches of 10 entities                │
│ - Schema validation + retry             │
│ - Max 30 iterations                     │
└─────────────────────────────────────────┘
    ↓
ProposedEntity[] with properties
```

**Key files**:
- `src/activities/infer-entities-from-web-page-activity.ts`
- `src/activities/infer-entities/infer-entity-summaries.ts`
- `src/activities/infer-entities/propose-entities.ts`

#### 2. Research Flow (Modern)
**Entry**: `researchEntitiesAction` → various agents

```
Content (web page or document)
    ↓
┌─────────────────────────────────────────┐
│ getEntitySummariesFromText              │
│ - LLM: registerEntitySummaries tool     │
│ - Output: LocalEntitySummary[]          │
│ - Single pass (no iteration)            │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ inferEntityClaimsFromTextAgent          │
│ - LLM: submitClaims tool                │
│ - Creates Claim entities in graph       │
│ - Retry with validation feedback        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ proposeEntityFromClaimsAgent            │
│ - LLM: proposeEntity tool               │
│ - Maps claims to entity properties      │
│ - Tracks which claims used              │
└─────────────────────────────────────────┘
    ↓
ProposedEntity[] with claim provenance
```

**Key files**:
- `src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/`
- `src/activities/flow-activities/shared/propose-entities-from-claims/`

#### 3. Document Metadata Flow
**Entry**: `inferMetadataFromDocumentAction`

```
PDF/Document
    ↓
┌─────────────────────────────────────────┐
│ getLlmAnalysisOfDoc (Gemini)            │
│ - Analyzes full document                │
│ - provideDocumentMetadata tool          │
│ - Identifies document type              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ judgeAiOutputs                          │
│ - Validates LLM output                  │
│ - Issues corrections                    │
│ - delete-unfounded, correct-incorrect   │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ generateProposedEntitiesAndCreateClaims │
│ - Creates author entities               │
│ - Links authors to document             │
└─────────────────────────────────────────┘
    ↓
DocumentData + ProposedEntity[] (authors)
```

**Key files**:
- `src/activities/flow-activities/infer-metadata-from-document-action/`

### Current Limitations

| Issue | Impact | Affected Code |
|-------|--------|---------------|
| **No step-level tracing** | Can't isolate which step failed or was slow | All pipelines |
| **Interleaved retry logic** | Business logic mixed with error handling | `proposeEntities.ts`, `infer-entity-summaries.ts` |
| **No standardized schemas** | Each step has ad-hoc input/output types | `inference-types.ts` |
| **No per-step evals** | Can only evaluate end-to-end | `.ai.test.ts` files |
| **No confidence scores** | Can't rank extraction quality | All entity outputs |
| **Inconsistent iteration limits** | 10 for summaries, 30 for properties | Different files |
| **No streaming** | Blocks until full LLM response | `getLlmResponse` |

---

## Proposed Mastra Architecture

### Core Workflow Structure

```typescript
// src/mastra/workflows/ner-extraction.ts
import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';

export const nerExtractionWorkflow = createWorkflow({
  name: 'ner-extraction',
  inputSchema: z.object({
    content: z.union([
      z.string(), // Plain text
      z.object({ // WebPage
        url: z.string(),
        title: z.string(),
        htmlContent: z.string(),
      }),
    ]),
    entityTypeIds: z.array(z.string().url()),
    relevantEntitiesPrompt: z.string().optional(),
    model: z.enum(['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro']).default('gpt-4o'),
  }),
  outputSchema: z.object({
    entitySummaries: z.array(LocalEntitySummarySchema),
    claims: z.array(ClaimSchema),
    proposedEntities: z.array(ProposedEntitySchema),
    metrics: z.object({
      totalTokens: z.number(),
      latencyMs: z.number(),
      stepMetrics: z.record(z.string(), StepMetricsSchema),
    }),
  }),
})
  .then(entityDiscoveryStep)
  .then(claimExtractionStep)
  .then(entityProposalStep)
  .then(validationStep)
  .commit();
```

### Workflow State Schema

```typescript
// Shared state accessible across all steps
const workflowStateSchema = z.object({
  // Accumulated metrics
  tokenUsage: z.array(z.object({
    step: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
  })),
  
  // Provenance tracking
  sources: z.array(SourceProvenanceSchema),
  
  // Error accumulation for debugging
  warnings: z.array(z.object({
    step: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  })),
  
  // Dereferenced entity types (computed once, shared)
  dereferencedEntityTypes: z.record(z.string(), DereferencedEntityTypeSchema),
});
```

---

## Step Definitions

### Step 1: Entity Discovery

**Purpose**: Identify all entity candidates in the content (NER Phase 1)

```typescript
// src/mastra/steps/entity-discovery.ts
import { createStep } from '@mastra/core';

export const entityDiscoveryStep = createStep({
  name: 'entity-discovery',
  description: 'Identify entity candidates from content using LLM',
  
  inputSchema: z.object({
    content: ContentSchema,
    entityTypeIds: z.array(z.string().url()),
    relevantEntitiesPrompt: z.string().optional(),
    model: ModelSchema,
  }),
  
  outputSchema: z.object({
    entitySummaries: z.array(LocalEntitySummarySchema),
    suggestedNewTypes: z.array(z.object({
      title: z.string(),
      description: z.string(),
      matchedEntities: z.array(z.string()), // localIds
    })),
    usage: LlmUsageSchema,
  }),
  
  execute: async ({ input, context, mastra }) => {
    const { content, entityTypeIds, relevantEntitiesPrompt, model } = input;
    
    // Get dereferenced entity types from workflow state
    const dereferencedTypes = context.state.dereferencedEntityTypes;
    
    // Build the LLM prompt
    const prompt = buildEntityDiscoveryPrompt({
      content,
      dereferencedTypes,
      relevantEntitiesPrompt,
    });
    
    // Call LLM via Mastra agent or direct
    const agent = mastra.getAgent('entity-recognizer');
    const response = await agent.generate({
      prompt,
      tools: [registerEntitySummariesTool],
      maxSteps: 10, // Internal iteration limit
      onStepFinish: (step) => {
        // Log progress for observability
        mastra.logger.info('Entity discovery iteration', {
          iteration: step.stepNumber,
          entitiesFound: step.toolCalls?.length ?? 0,
        });
      },
    });
    
    return {
      entitySummaries: response.entitySummaries,
      suggestedNewTypes: response.suggestedNewTypes ?? [],
      usage: response.usage,
    };
  },
});
```

**Scorers for this step**:
- `entityRecallScorer`: Did we find all expected entities?
- `entityPrecisionScorer`: Are found entities actually in the content?
- `typeAccuracyScorer`: Are entities assigned correct types?

### Step 2: Claim Extraction

**Purpose**: Extract subject-predicate-object claims about discovered entities

```typescript
// src/mastra/steps/claim-extraction.ts
export const claimExtractionStep = createStep({
  name: 'claim-extraction',
  description: 'Extract claims about entities from content',
  
  inputSchema: z.object({
    content: ContentSchema,
    entitySummaries: z.array(LocalEntitySummarySchema),
    dereferencedEntityTypes: z.record(z.string(), DereferencedEntityTypeSchema),
  }),
  
  outputSchema: z.object({
    claims: z.array(ClaimSchema),
    usage: LlmUsageSchema,
    validationErrors: z.array(z.object({
      claimText: z.string(),
      error: z.string(),
    })),
  }),
  
  execute: async ({ input, context, mastra }) => {
    const { content, entitySummaries, dereferencedEntityTypes } = input;
    
    // Group entities by type for batched claim extraction
    const entitiesByType = groupBy(entitySummaries, e => e.entityTypeIds[0]);
    
    const allClaims: Claim[] = [];
    const allErrors: ValidationError[] = [];
    
    for (const [typeId, entities] of Object.entries(entitiesByType)) {
      const entityType = dereferencedEntityTypes[typeId];
      
      const agent = mastra.getAgent('claim-extractor');
      const response = await agent.generate({
        prompt: buildClaimExtractionPrompt({
          content,
          subjectEntities: entities,
          entityType,
          potentialObjectEntities: entitySummaries.filter(e => !entities.includes(e)),
        }),
        tools: [submitClaimsTool],
        maxSteps: 5,
      });
      
      const { validClaims, errors } = validateClaims(response.claims, {
        subjectEntities: entities,
        objectEntities: entitySummaries,
      });
      
      allClaims.push(...validClaims);
      allErrors.push(...errors);
    }
    
    return {
      claims: allClaims,
      usage: aggregateUsage(),
      validationErrors: allErrors,
    };
  },
});
```

**Scorers for this step**:
- `claimCompletenessScorer`: Are all facts represented as claims?
- `claimStructureScorer`: Do claims follow subject-predicate-object format?
- `claimGroundingScorer`: Are claims grounded in source content?

### Step 3: Entity Proposal

**Purpose**: Map claims to entity properties and generate ProposedEntity objects

```typescript
// src/mastra/steps/entity-proposal.ts
export const entityProposalStep = createStep({
  name: 'entity-proposal',
  description: 'Generate proposed entities from claims',
  
  inputSchema: z.object({
    entitySummaries: z.array(LocalEntitySummarySchema),
    claims: z.array(ClaimSchema),
    dereferencedEntityTypes: z.record(z.string(), DereferencedEntityTypeSchema),
  }),
  
  outputSchema: z.object({
    proposedEntities: z.array(ProposedEntitySchema),
    unmappedClaims: z.array(ClaimSchema),
    usage: LlmUsageSchema,
  }),
  
  execute: async ({ input, mastra }) => {
    const { entitySummaries, claims, dereferencedEntityTypes } = input;
    
    const proposedEntities: ProposedEntity[] = [];
    const unmappedClaims: Claim[] = [];
    
    for (const summary of entitySummaries) {
      const entityType = dereferencedEntityTypes[summary.entityTypeIds[0]];
      const relevantClaims = claims.filter(c => 
        c.subjectEntityLocalId === summary.localId
      );
      
      const agent = mastra.getAgent('entity-proposer');
      const response = await agent.generate({
        prompt: buildEntityProposalPrompt({
          entitySummary: summary,
          claims: relevantClaims,
          entityType,
        }),
        tools: [proposeEntityTool],
        outputSchema: ProposedEntitySchema,
      });
      
      proposedEntities.push({
        localEntityId: summary.localId,
        entityTypeIds: summary.entityTypeIds,
        properties: response.properties,
        propertyMetadata: buildPropertyMetadata(response, relevantClaims),
        claims: {
          isSubjectOf: relevantClaims.map(c => c.claimId),
          isObjectOf: claims
            .filter(c => c.objectEntityLocalId === summary.localId)
            .map(c => c.claimId),
        },
        provenance: context.state.provenance,
      });
      
      unmappedClaims.push(
        ...relevantClaims.filter(c => !response.usedClaimIds.includes(c.claimId))
      );
    }
    
    return { proposedEntities, unmappedClaims, usage: aggregateUsage() };
  },
});
```

**Scorers for this step**:
- `propertyMappingScorer`: Are claims correctly mapped to properties?
- `schemaComplianceScorer`: Do entities match their type schemas?
- `provenanceCompletenessScorer`: Are all property sources tracked?

### Step 4: Validation & Judgment

**Purpose**: Review and correct LLM outputs using a judge model

```typescript
// src/mastra/steps/validation.ts
export const validationStep = createStep({
  name: 'validation',
  description: 'Validate and correct proposed entities using judge model',
  
  inputSchema: z.object({
    proposedEntities: z.array(ProposedEntitySchema),
    content: ContentSchema,
    dereferencedEntityTypes: z.record(z.string(), DereferencedEntityTypeSchema),
  }),
  
  outputSchema: z.object({
    validatedEntities: z.array(ProposedEntitySchema),
    corrections: z.array(z.object({
      entityId: z.string(),
      propertyPath: z.array(z.string()),
      correctionType: z.enum(['correct-missing', 'correct-incorrect', 'delete-unfounded']),
      originalValue: z.unknown().optional(),
      correctedValue: z.unknown().optional(),
      reasoning: z.string(),
    })),
    confidenceScores: z.record(z.string(), z.number()), // entityId -> 0-1
    usage: LlmUsageSchema,
  }),
  
  execute: async ({ input, mastra }) => {
    const { proposedEntities, content, dereferencedEntityTypes } = input;
    
    const agent = mastra.getAgent('entity-judge');
    const corrections: Correction[] = [];
    const confidenceScores: Record<string, number> = {};
    
    for (const entity of proposedEntities) {
      const response = await agent.generate({
        prompt: buildJudgePrompt({
          entity,
          content,
          entityType: dereferencedEntityTypes[entity.entityTypeIds[0]],
        }),
        tools: [judgeEntityTool],
      });
      
      corrections.push(...response.corrections.map(c => ({
        entityId: entity.localEntityId,
        ...c,
      })));
      
      // Calculate confidence based on corrections
      confidenceScores[entity.localEntityId] = calculateConfidence(
        entity,
        response.corrections,
        response.score,
      );
    }
    
    // Apply corrections
    const validatedEntities = applyCorrections(proposedEntities, corrections);
    
    return {
      validatedEntities,
      corrections,
      confidenceScores,
      usage: aggregateUsage(),
    };
  },
});
```

**Scorers for this step**:
- `hallucinationDetectionScorer`: Were unfounded values correctly identified?
- `correctionAccuracyScorer`: Were corrections appropriate?
- `confidenceCalibrationScorer`: Do confidence scores correlate with actual accuracy?

---

## Workflow Variants

### Variant A: Quick Extraction (Browser Plugin)

Simpler flow for real-time extraction, skipping claims.

```typescript
export const quickNerWorkflow = createWorkflow({
  name: 'quick-ner-extraction',
  // ... schemas ...
})
  .then(entityDiscoveryStep)
  .then(directPropertyExtractionStep) // Skip claims, extract properties directly
  .then(lightValidationStep) // Lighter validation
  .commit();
```

### Variant B: Research Extraction (Full Provenance)

Full claims-based flow with complete provenance tracking.

```typescript
export const researchNerWorkflow = createWorkflow({
  name: 'research-ner-extraction',
  // ... schemas ...
})
  .then(entityDiscoveryStep)
  .then(claimExtractionStep)
  .then(entityProposalStep)
  .then(validationStep)
  .then(deduplicationStep) // Match against existing entities
  .commit();
```

### Variant C: Document Metadata

Specialized for PDF/document analysis.

```typescript
export const documentNerWorkflow = createWorkflow({
  name: 'document-ner-extraction',
  inputSchema: z.object({
    fileEntity: FileEntitySchema,
  }),
  // ... output schema ...
})
  .then(documentAnalysisStep) // Gemini for document understanding
  .then(metadataExtractionStep)
  .then(authorExtractionStep)
  .then(validationStep)
  .commit();
```

---

## Observability & Tracing

### Mastra Configuration

```typescript
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { LangfuseExporter } from '@mastra/langfuse';

export const mastra = new Mastra({
  name: 'hash-ner',
  storage: {
    default: { type: 'libsql', url: process.env.MASTRA_DB_URL },
    observability: { type: 'clickhouse', url: process.env.CLICKHOUSE_URL },
  },
  telemetry: {
    tracing: {
      enabled: true,
      exporter: new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        host: process.env.LANGFUSE_HOST,
      }),
    },
  },
  workflows: {
    nerExtractionWorkflow,
    quickNerWorkflow,
    researchNerWorkflow,
    documentNerWorkflow,
  },
  agents: {
    'entity-recognizer': entityRecognizerAgent,
    'claim-extractor': claimExtractorAgent,
    'entity-proposer': entityProposerAgent,
    'entity-judge': entityJudgeAgent,
  },
});
```

### What Gets Traced Automatically

| Trace Type | Current State | With Mastra |
|------------|--------------|-------------|
| LLM call latency | `logLlmRequest` to file | Langfuse spans with auto-timing |
| Token usage | `createUsageRecord` | Per-step automatic tracking |
| Step duration | Not tracked | Workflow step spans |
| Error traces | Sentry (separate) | Inline with execution trace |
| Retry attempts | Log messages only | Structured retry metadata |
| Model parameters | `logLlmRequest` JSON | Trace attributes |

### Custom Trace Attributes

```typescript
// Add custom attributes to traces
const entityDiscoveryStep = createStep({
  // ...
  execute: async ({ input, context, mastra }) => {
    // Add custom span attributes
    context.trace.setAttributes({
      'ner.entity_type_count': input.entityTypeIds.length,
      'ner.content_length': input.content.length,
      'ner.has_relevance_prompt': !!input.relevantEntitiesPrompt,
    });
    
    // ... execution ...
    
    context.trace.setAttributes({
      'ner.entities_found': result.entitySummaries.length,
      'ner.new_types_suggested': result.suggestedNewTypes.length,
    });
  },
});
```

---

## Evaluation Framework

### Built-in Scorers

```typescript
// src/mastra/scorers/ner-scorers.ts
import { createScorer } from '@mastra/evals';

export const entityRecallScorer = createScorer({
  name: 'entity-recall',
  description: 'Measures what fraction of expected entities were found',
  
  execute: async ({ input, output, context }) => {
    // For live evaluation, we can't compare to ground truth
    // Use heuristic: entities mentioned in content but not extracted
    const contentEntities = extractNamedEntitiesHeuristic(input.content);
    const foundEntities = new Set(output.entitySummaries.map(e => e.name.toLowerCase()));
    
    const missed = contentEntities.filter(e => !foundEntities.has(e.toLowerCase()));
    const recall = (contentEntities.length - missed.length) / contentEntities.length;
    
    return {
      score: recall,
      reasoning: missed.length > 0 
        ? `Potentially missed entities: ${missed.join(', ')}`
        : 'All detected entities appear to be covered',
    };
  },
});

export const claimGroundingScorer = createScorer({
  name: 'claim-grounding',
  description: 'Verifies claims are grounded in source content',
  
  execute: async ({ input, output }) => {
    const { content } = input;
    const { claims } = output;
    
    let groundedCount = 0;
    const ungroundedClaims: string[] = [];
    
    for (const claim of claims) {
      const isGrounded = await verifyClaimInContent(claim.text, content);
      if (isGrounded) {
        groundedCount++;
      } else {
        ungroundedClaims.push(claim.text);
      }
    }
    
    return {
      score: groundedCount / claims.length,
      reasoning: ungroundedClaims.length > 0
        ? `Potentially ungrounded claims: ${ungroundedClaims.slice(0, 3).join('; ')}`
        : 'All claims appear grounded in source content',
    };
  },
});

export const confidenceCalibrationScorer = createScorer({
  name: 'confidence-calibration',
  description: 'Checks if confidence scores correlate with actual quality',
  
  // This requires historical data to compare
  execute: async ({ output, historicalData }) => {
    // Compare predicted confidence to actual accuracy from user feedback
    // ...
  },
});
```

### Registering Scorers

```typescript
// src/mastra/index.ts
mastra.registerScorers({
  agents: {
    'entity-recognizer': {
      scorers: [entityRecallScorer, entityPrecisionScorer],
      sampling: { rate: 0.1 }, // Score 10% of production calls
    },
    'claim-extractor': {
      scorers: [claimGroundingScorer, claimStructureScorer],
      sampling: { rate: 0.1 },
    },
    'entity-judge': {
      scorers: [hallucinationDetectionScorer],
      sampling: { rate: 0.2 }, // Higher rate for quality-critical step
    },
  },
  workflows: {
    'ner-extraction': {
      scorers: [endToEndAccuracyScorer],
      sampling: { rate: 0.05 }, // Lower rate for expensive end-to-end eval
    },
  },
});
```

### Test Data Integration

```typescript
// src/mastra/evals/ner-test-suite.ts
import { createTestSuite } from '@mastra/evals';

export const nerTestSuite = createTestSuite({
  name: 'ner-extraction-tests',
  workflow: 'ner-extraction',
  
  testCases: [
    {
      name: 'FTSE350 table extraction',
      input: {
        content: ftse350TableHtml,
        entityTypeIds: ['https://hash.ai/@h/types/entity-type/company/v/1'],
        relevantEntitiesPrompt: 'Extract all FTSE350 constituents',
      },
      expectedOutput: {
        entityCount: { min: 350 },
        entityTypes: ['Company'],
      },
    },
    {
      name: 'Wikipedia person extraction',
      input: {
        content: billGatesWikipedia,
        entityTypeIds: [
          'https://hash.ai/@h/types/entity-type/person/v/1',
          'https://hash.ai/@h/types/entity-type/organization/v/1',
        ],
      },
      expectedOutput: {
        mustContainEntities: ['Bill Gates', 'Microsoft', 'Melinda Gates'],
      },
    },
    // ... more test cases from existing .ai.test.ts files
  ],
});
```

---

## Integration with Temporal

### Temporal Activity Wrapper

```typescript
// src/activities/flow-activities/infer-entities-from-content-action.ts
import { mastra } from '../../mastra/index.js';

export const inferEntitiesFromContentAction: AiFlowActionActivity<
  "inferEntitiesFromContent"
> = async ({ inputs }) => {
  const { content, entityTypeIds, model, relevantEntitiesPrompt } = 
    getSimplifiedAiFlowActionInputs({ inputs, actionType: "inferEntitiesFromContent" });

  const { flowEntityId, userAuthentication, stepId, webId } = await getFlowContext();

  // Get the Mastra workflow
  const workflow = mastra.getWorkflow('ner-extraction');
  const run = workflow.createRun({
    runId: `${flowEntityId}-${stepId}`, // Link to Temporal execution
  });

  // Execute the Mastra workflow
  const result = await run.start({
    inputData: {
      content,
      entityTypeIds,
      relevantEntitiesPrompt,
      model: inferenceModelAliasToSpecificModel[model],
    },
    // Pass context for provenance
    context: {
      flowEntityId,
      stepId,
      webId,
      userActorId: userAuthentication.actorId,
    },
  });

  if (result.status === 'failed') {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: result.error.message,
    };
  }

  // Transform Mastra output to HASH format
  const proposedEntities = transformMastraEntities(
    result.result.proposedEntities,
    { flowEntityId, stepId, webId },
  );

  // Record usage in HASH graph (preserving existing behavior)
  await recordUsageFromMastraMetrics(result.result.metrics, {
    flowEntityId,
    stepId,
    webId,
    userActorId: userAuthentication.actorId,
  });

  return {
    code: StatusCode.Ok,
    contents: [{
      outputs: [{
        outputName: "proposedEntities",
        payload: { kind: "ProposedEntity", value: proposedEntities },
      }],
    }],
  };
};
```

### Document-Level Heartbeating

For batch processing with durability:

```typescript
// src/activities/flow-activities/research-entities-action.ts
export const researchEntitiesAction = async (params) => {
  const { documents } = params;
  
  // Get checkpoint if resuming
  const checkpoint = await getCheckpoint();
  const processedDocIds = checkpoint?.processedDocumentIds ?? [];
  
  const results: ProposedEntity[][] = checkpoint?.results ?? [];
  
  for (const document of documents) {
    if (processedDocIds.includes(document.id)) {
      continue; // Already processed
    }
    
    // Run Mastra workflow for this document
    const workflow = mastra.getWorkflow('research-ner-extraction');
    const result = await workflow.createRun().start({
      inputData: { content: document.content, /* ... */ },
    });
    
    if (result.status === 'success') {
      results.push(result.result.proposedEntities);
      processedDocIds.push(document.id);
      
      // Heartbeat with checkpoint state
      Context.current().heartbeat({
        processedDocumentIds: processedDocIds,
        results,
      });
    }
  }
  
  return results.flat();
};
```

---

## Benefits Over Current State

### 1. Observability

| Metric | Current | With Mastra |
|--------|---------|-------------|
| **Trace granularity** | Per-activity | Per-step within workflow |
| **Dashboard** | None (log files) | Langfuse/Studio built-in |
| **Token breakdown** | Aggregated | Per-step attribution |
| **Latency analysis** | Manual log parsing | Automatic waterfall visualization |
| **Error correlation** | Sentry (separate system) | Inline with traces |

### 2. Evaluation

| Capability | Current | With Mastra |
|------------|---------|-------------|
| **Scorer types** | Custom `MetricDefinition` | Built-in + custom |
| **Live evaluation** | None | 0-100% sampling rate |
| **Historical scoring** | None | Score past traces |
| **CI integration** | vitest only | `mastra eval` CLI |
| **Confidence scores** | Not tracked | Per-entity confidence |

### 3. Code Organization

| Aspect | Current | With Mastra |
|--------|---------|-------------|
| **Step isolation** | Logic interleaved | Clean step boundaries |
| **Schema definitions** | Ad-hoc types | Zod schemas with validation |
| **Retry logic** | Mixed with business logic | Handled by framework |
| **Error handling** | Per-file patterns | Consistent workflow error states |

### 4. Developer Experience

| Aspect | Current | With Mastra |
|--------|---------|-------------|
| **Testing individual steps** | Difficult | `mastra dev` + Studio |
| **Prompt iteration** | Redeploy required | Hot reload in Studio |
| **A/B testing prompts** | Custom infra needed | Dynamic instructions |
| **Multi-model comparison** | Manual | Model router |

### 5. Future Capabilities

| Feature | Current | With Mastra |
|---------|---------|-------------|
| **Streaming** | Not implemented | Native `.stream()` |
| **Agent memory** | N/A | Working memory, semantic recall |
| **MCP integration** | N/A | Built-in MCPClient/MCPServer |
| **Multi-agent** | Custom coordination | `Agent.network()` |

---

## Implementation Phases

### Phase 1: Foundation (1-2 weeks)

1. Add `@mastra/core` and `@mastra/evals` to `hash-ai-worker-ts`
2. Set up Mastra instance with storage and telemetry
3. Define Zod schemas for all data types (reuse existing TypeScript types)
4. Configure Langfuse exporter

**Deliverables**:
- `src/mastra/index.ts` - Mastra configuration
- `src/mastra/schemas/` - Zod schema definitions
- Updated `package.json` with Mastra dependencies

### Phase 2: Quick NER Workflow (2-3 weeks)

1. Implement `entityDiscoveryStep`
2. Implement `directPropertyExtractionStep` (simplified, no claims)
3. Implement `lightValidationStep`
4. Integrate with `inferEntitiesFromContentAction`
5. Add basic scorers

**Deliverables**:
- `src/mastra/workflows/quick-ner.ts`
- `src/mastra/steps/entity-discovery.ts`
- `src/mastra/steps/direct-property-extraction.ts`
- `src/mastra/scorers/basic-scorers.ts`
- Updated `infer-entities-from-content-action.ts`

### Phase 3: Full Research Workflow (3-4 weeks)

1. Implement `claimExtractionStep`
2. Implement `entityProposalStep`
3. Implement `validationStep` with judge model
4. Add claim-specific scorers
5. Integrate with research flows

**Deliverables**:
- `src/mastra/workflows/research-ner.ts`
- `src/mastra/steps/claim-extraction.ts`
- `src/mastra/steps/entity-proposal.ts`
- `src/mastra/steps/validation.ts`
- Advanced scorers

### Phase 4: Document Workflow (1-2 weeks)

1. Implement `documentAnalysisStep` (Gemini)
2. Implement `metadataExtractionStep`
3. Integrate with `inferMetadataFromDocumentAction`

**Deliverables**:
- `src/mastra/workflows/document-ner.ts`
- Updated `infer-metadata-from-document-action.ts`

### Phase 5: Observability & Evals Rollout (2 weeks)

1. Configure production Langfuse
2. Set up eval pipelines in CI
3. Create dashboards for key metrics
4. Document runbooks

**Deliverables**:
- Langfuse dashboards
- CI eval configuration
- Operations documentation

---

## External Project Development

This section covers developing the Mastra workflows in a **separate project outside the HASH monorepo**, which provides cleaner separation and easier iteration.

### Dependency Analysis

The current NER logic relies on monorepo-internal packages:

| Package | What It Provides | Published? |
|---------|-----------------|------------|
| `@blockprotocol/type-system` | `EntityId`, `VersionedUrl`, `PropertyValue`, etc. | ✅ npm |
| `@local/hash-isomorphic-utils` | `ProposedEntity`, flow types, ontology IDs | ❌ Private |
| `@local/hash-graph-sdk` | `HashEntity`, `createClaim`, entity operations | ❌ Private |
| `@local/hash-graph-client` | GraphQL client for Graph service | ❌ Private |
| `@local/hash-backend-utils` | `createGraphClient`, flow utilities | ❌ Private |

### Recommended Architecture

Use an **HTTP boundary** between the HASH monorepo and the external Mastra project:

```
┌─────────────────────────────────────────────────────────┐
│                   HASH Monorepo                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Temporal Activity                   │    │
│  │  inferEntitiesFromContentAction                  │    │
│  │                                                  │    │
│  │  1. Dereference entity types (Graph API)        │    │
│  │  2. Call Mastra service (HTTP)                  │    │
│  │  3. Transform response to ProposedEntity[]      │    │
│  │  4. Record usage, create claims, persist        │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          │ HTTP POST                     │
│                          ▼                               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 Mastra Project (External)                │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Mastra HTTP Server                  │    │
│  │  POST /ner/extract                              │    │
│  │                                                  │    │
│  │  Input:                                         │    │
│  │    - content (string or WebPage)                │    │
│  │    - entityTypeSchemas (JSON, pre-dereferenced) │    │
│  │    - relevantEntitiesPrompt                     │    │
│  │                                                  │    │
│  │  Output:                                        │    │
│  │    - entitySummaries[]                          │    │
│  │    - claims[] (as data, not persisted)          │    │
│  │    - proposedEntities[] (plain JSON)            │    │
│  │    - metrics                                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Mastra Workflows                    │    │
│  │  - Entity Discovery Step                        │    │
│  │  - Claim Extraction Step                        │    │
│  │  - Entity Proposal Step                         │    │
│  │  - Validation Step                              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Observability: Langfuse / Studio                        │
│  Evals: @mastra/evals scorers                           │
└─────────────────────────────────────────────────────────┘
```

### Benefits of External Development

| Benefit | Description |
|---------|-------------|
| **Clean boundary** | Mastra knows nothing about HASH Graph internals |
| **Type safety at boundary** | Define Zod schemas in Mastra, map to HASH types in Temporal |
| **Independent deployment** | Mastra service can run anywhere |
| **Easier testing** | Test Mastra workflows without full HASH stack |
| **Gradual migration** | Swap in Mastra incrementally |
| **Faster iteration** | No monorepo build overhead during development |

### Local Service Ports

When running HASH services locally (via `apps/hash-external-services`):

| Service | Port | Purpose | Needed by Mastra? |
|---------|------|---------|-------------------|
| Graph API | 4000 | Entity/type operations | ❌ (schemas passed in) |
| Temporal | 7233 | Workflow orchestration | ❌ (Mastra has own) |
| Vault | 8200 | Secrets (API keys) | ❌ (use .env) |
| PostgreSQL | 5432 | Backing store | ❌ (Mastra has own) |
| **Mastra** | 4111 | Mastra Studio (dev) | ✅ (your project) |

The Mastra project only needs to expose an HTTP endpoint that the Temporal activity calls.

### API Contract

Define a shared contract between the two systems:

```typescript
// Shared contract (can be a small package or just duplicated)
import { z } from 'zod';

// --- Request ---

const WebPageSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  htmlContent: z.string(),
});

const EntityTypeSchemaSchema = z.object({
  $id: z.string().url(), // VersionedUrl
  title: z.string(),
  description: z.string().optional(),
  properties: z.record(z.unknown()), // Dereferenced property schemas
  required: z.array(z.string()).optional(),
  links: z.record(z.unknown()).optional(),
});

export const NerRequestSchema = z.object({
  content: z.union([z.string(), WebPageSchema]),
  entityTypeSchemas: z.array(EntityTypeSchemaSchema),
  relevantEntitiesPrompt: z.string().optional(),
  model: z.enum(['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro']).optional(),
});

// --- Response ---

const EntitySummarySchema = z.object({
  localId: z.string(), // Generated UUID
  name: z.string(),
  summary: z.string(),
  entityTypeIds: z.array(z.string().url()),
});

const ClaimDataSchema = z.object({
  claimId: z.string(),
  subjectEntityLocalId: z.string(),
  objectEntityLocalId: z.string().optional(),
  text: z.string(),
  prepositionalPhrases: z.array(z.string()),
});

const ProposedEntityDataSchema = z.object({
  localEntityId: z.string(),
  entityTypeIds: z.array(z.string().url()),
  properties: z.record(z.unknown()),
  summary: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceClaimIds: z.array(z.string()),
});

const MetricsSchema = z.object({
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  latencyMs: z.number(),
  stepMetrics: z.record(z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    latencyMs: z.number(),
  })),
});

export const NerResponseSchema = z.object({
  status: z.enum(['success', 'partial', 'error']),
  entitySummaries: z.array(EntitySummarySchema),
  claims: z.array(ClaimDataSchema),
  proposedEntities: z.array(ProposedEntityDataSchema),
  metrics: MetricsSchema,
  errors: z.array(z.object({
    step: z.string(),
    message: z.string(),
  })).optional(),
});

export type NerRequest = z.infer<typeof NerRequestSchema>;
export type NerResponse = z.infer<typeof NerResponseSchema>;
```

### Temporal Activity Integration

The Temporal activity calls the Mastra service and transforms the response:

```typescript
// src/activities/flow-activities/infer-entities-from-content-action.ts
import type { NerRequest, NerResponse } from '@hash/ner-contract';

const MASTRA_NER_URL = process.env.MASTRA_NER_SERVICE_URL ?? 'http://localhost:3000';

export const inferEntitiesFromContentAction: AiFlowActionActivity<
  "inferEntitiesFromContent"
> = async ({ inputs }) => {
  const { content, entityTypeIds, model, relevantEntitiesPrompt } = 
    getSimplifiedAiFlowActionInputs({ inputs, actionType: "inferEntitiesFromContent" });

  const { flowEntityId, userAuthentication, stepId, webId } = await getFlowContext();

  // 1. Dereference entity types (this stays in HASH)
  const dereferencedTypes = await getDereferencedEntityTypesActivity({
    graphApiClient,
    entityTypeIds,
    actorId: userAuthentication.actorId,
  });

  // 2. Build request for Mastra service
  const nerRequest: NerRequest = {
    content,
    entityTypeSchemas: Object.values(dereferencedTypes).map(t => ({
      $id: t.schema.$id,
      title: t.schema.title,
      description: t.schema.description,
      properties: t.schema.properties,
      required: t.schema.required,
      links: t.links,
    })),
    relevantEntitiesPrompt,
    model: inferenceModelAliasToSpecificModel[model],
  };

  // 3. Call Mastra service
  const response = await fetch(`${MASTRA_NER_URL}/ner/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nerRequest),
  });

  if (!response.ok) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Mastra NER service error: ${response.status}`,
    };
  }

  const nerResponse: NerResponse = await response.json();

  if (nerResponse.status === 'error') {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: nerResponse.errors?.[0]?.message ?? 'Unknown NER error',
    };
  }

  // 4. Transform to HASH ProposedEntity format
  const proposedEntities = transformMastraToHashEntities(
    nerResponse.proposedEntities,
    nerResponse.claims,
    { flowEntityId, stepId, webId },
  );

  // 5. Record usage (optional: create claims in Graph)
  await recordUsageMetrics(nerResponse.metrics, {
    flowEntityId,
    stepId,
    webId,
    userActorId: userAuthentication.actorId,
  });

  return {
    code: StatusCode.Ok,
    contents: [{
      outputs: [{
        outputName: "proposedEntities",
        payload: { kind: "ProposedEntity", value: proposedEntities },
      }],
    }],
  };
};

function transformMastraToHashEntities(
  mastraEntities: NerResponse['proposedEntities'],
  mastraClaims: NerResponse['claims'],
  context: { flowEntityId: EntityId; stepId: string; webId: WebId },
): ProposedEntity[] {
  return mastraEntities.map(entity => ({
    localEntityId: entityIdFromComponents(context.webId, entity.localEntityId as EntityUuid),
    entityTypeIds: entity.entityTypeIds as VersionedUrl[],
    properties: entity.properties,
    propertyMetadata: buildPropertyMetadata(entity, mastraClaims),
    claims: {
      isSubjectOf: mastraClaims
        .filter(c => c.subjectEntityLocalId === entity.localEntityId)
        .map(c => c.claimId as EntityId),
      isObjectOf: mastraClaims
        .filter(c => c.objectEntityLocalId === entity.localEntityId)
        .map(c => c.claimId as EntityId),
    },
    provenance: {
      actorType: 'ai',
      origin: {
        type: 'flow',
        id: context.flowEntityId,
        stepIds: [context.stepId],
      },
    },
  }));
}
```

### Mastra Server Setup

In your external Mastra project:

```typescript
// src/server.ts
import { Mastra } from '@mastra/core';
import { serve } from '@mastra/core/server';
import { nerExtractionWorkflow } from './workflows/ner-extraction';
import { NerRequestSchema, NerResponseSchema } from './contract';

const mastra = new Mastra({
  name: 'hash-ner-service',
  workflows: { nerExtractionWorkflow },
  // ... agents, storage, telemetry
});

// Mastra's built-in server with custom endpoint
const app = serve(mastra, {
  port: 3000,
  routes: {
    '/ner/extract': {
      POST: async (req) => {
        const body = await req.json();
        const input = NerRequestSchema.parse(body);
        
        const workflow = mastra.getWorkflow('ner-extraction');
        const run = workflow.createRun();
        const result = await run.start({ inputData: input });
        
        if (result.status === 'success') {
          return Response.json(NerResponseSchema.parse({
            status: 'success',
            ...result.result,
          }));
        }
        
        return Response.json({
          status: 'error',
          entitySummaries: [],
          claims: [],
          proposedEntities: [],
          metrics: { totalInputTokens: 0, totalOutputTokens: 0, latencyMs: 0, stepMetrics: {} },
          errors: [{ step: 'workflow', message: result.error?.message ?? 'Unknown' }],
        }, { status: 500 });
      },
    },
  },
});

console.log('Mastra NER service running on http://localhost:3000');
```

### Development Workflow

1. **Start HASH services** (if you need to test full integration):
   ```bash
   cd apps/hash-external-services && yarn deploy
   yarn start:graph
   ```

2. **Start Mastra project** (separate terminal):
   ```bash
   cd ~/my-mastra-ner-project
   npx mastra dev  # Studio at localhost:4111
   # or
   yarn start      # HTTP server at localhost:3000
   ```

3. **Test Mastra in isolation** (no HASH needed):
   - Use Mastra Studio to test workflows with sample inputs
   - Run `mastra eval` for scorer tests

4. **Test integration**:
   - Start both HASH and Mastra services
   - Trigger a flow via HASH frontend or API
   - Observe traces in Langfuse

### Caveats

| Issue | Mitigation |
|-------|------------|
| **Type drift** | Keep contract schemas in sync; consider shared package |
| **Network latency** | Minimal for local dev; consider embedding for production |
| **Error propagation** | Map Mastra errors to HASH `StatusCode` values |
| **Claim persistence** | Either persist in Mastra (needs Graph access) or return as data |
| **Authentication** | Mastra service is internal; add auth if exposed |

---

## Open Questions

### Technical

1. **Storage for Mastra state**: Use existing PostgreSQL or add LibSQL?
2. **ClickHouse for observability**: Worth adding to infrastructure?
3. **Streaming**: Should we prioritize streaming for any workflows?
4. **Agent memory**: Would memory across research sessions help?

### Migration

1. **Browser plugin flow**: Migrate to Mastra or keep legacy?
2. **Existing tests**: Convert `.ai.test.ts` to Mastra test suites?
3. **Dual-running**: Period where both old and new coexist?

### Scope

1. **Research agent**: Include coordinating/sub-coordinating agents in Mastra, or keep as Temporal activities?
2. **Deduplication**: Implement `matchExistingEntity` as Mastra step?

### External Development

1. **Shared contract package**: Publish to private registry or duplicate?
2. **Claim creation**: Should Mastra call Graph API to persist claims, or return claim data for Temporal to persist?
3. **Production deployment**: Run Mastra as sidecar, separate service, or embed in worker?

---

## References

- Mastra Workflows: https://mastra.ai/docs/v1/workflows/overview
- Mastra Evals: https://mastra.ai/docs/v1/evals/overview
- Mastra Observability: https://mastra.ai/docs/v1/observability/overview
- Current Architecture: `apps/hash-ai-worker-ts/_ai/architecture-overview.md`
- Mastra Evaluation: `apps/hash-ai-worker-ts/_ai/mastra-evaluation.md`

---

*Last updated: 2026-01-29*
