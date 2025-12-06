# Next Session: Phase 2 Implementation

## Current Status

✅ **Phase 1 Foundation Complete**

We've successfully:

1. Mapped hash-ai-worker-ts architecture to Mastra concepts
2. Created entity type schemas with Zod validation
3. Ported test data (4 focused test cases)
4. Copied entity type dereferencing utility (pure TS logic)
5. Created baseline entity summary extraction agent
6. Created entity recall scorer
7. Registered everything in Mastra instance
8. Created test scripts

## Phase 2: Claims-Based Extraction

The next phase focuses on implementing the **modern claims-based approach** from hash-ai-worker-ts:

### Step 1: Create Claim Extraction Agent

**File**: `src/mastra/agents/claim-extraction-agent.ts`

**Source**: Port from `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.ts`

**What to port**:

- System prompt for claim extraction
- `submitClaims` tool definition
- Claim validation logic (3 retry max)
- Temperature setting (0.5 for claim variation)

**Agent structure**:

```typescript
export const claimExtractionAgent = new Agent({
  id: 'claim-extraction-agent',
  name: 'Claim Extraction Agent',
  instructions: '...', // Port system prompt
  model: 'openrouter/google/gemini-2.0-flash-exp:free',
  tools: {
    submitClaims: submitClaimsTool,
  },
});
```

### Step 2: Create Entity Proposal Agent

**File**: `src/mastra/agents/entity-proposal-agent.ts`

**Source**: Port from `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/propose-entities-from-claims/propose-entity-from-claims-agent.ts`

**What to port**:

- System prompt for entity proposal
- `proposeEntity` and `abandonEntity` tools
- Property value + claim ID tracking
- Entity type schema integration

### Step 3: Create Three-Step Workflow

**File**: `src/mastra/workflows/entity-extraction-workflow.ts`

**Structure**:

```typescript
const extractSummariesStep = createStep({
  id: 'extract-summaries',
  execute: async ({ inputData }) => {
    const result = await entitySummaryAgent.generate(...)
    return { summaries: [...] }
  }
})

const extractClaimsStep = createStep({
  id: 'extract-claims',
  execute: async ({ inputData }) => {
    const { summaries } = inputData
    const result = await claimExtractionAgent.generate(...)
    return { claims: [...] }
  }
})

const proposeEntitiesStep = createStep({
  id: 'propose-entities',
  execute: async ({ inputData }) => {
    const { summaries, claims } = inputData
    // For each summary, propose entity from claims
    const entities = await Promise.all(...)
    return { entities: [...] }
  }
})

export const entityExtractionWorkflow = createWorkflow({
  id: 'entity-extraction-workflow',
  inputSchema: z.object({ text: z.string(), ... }),
  outputSchema: z.object({ entities: z.array(...), claims: z.array(...) })
})
  .then(extractSummariesStep)
  .then(extractClaimsStep)
  .then(proposeEntitiesStep)
  .commit()
```

### Step 4: Add More Scorers

**Files to create**:

- `src/mastra/scorers/claim-accuracy-scorer.ts`
- `src/mastra/scorers/entity-property-scorer.ts`

### Step 5: Comparative Evaluation

**File**: `src/mastra/evals/compare-approaches.ts`

Compare:

- Baseline (single-pass) approach
- Claims-based (three-step) approach

Metrics:

- Entity recall
- Entity precision
- Property accuracy
- Token usage / cost
- Latency

## Key Files to Reference

### Source Files (hash-ai-worker-ts)

**Claim Extraction**:

- `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/claims.ts` - Type definitions
- `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.ts` - Agent implementation

**Entity Proposal**:

- `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/propose-entities-from-claims/propose-entity-from-claims-agent.ts` - Agent implementation

**Orchestration**:

- `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text.ts` - Workflow orchestration

### Target Files (hash-ai-agent)

**Already Created**:

- `src/mastra/types/entities.ts` - Has Claim and ProposedEntity schemas
- `src/mastra/agents/entity-summary-agent.ts` - Step 1 complete
- `src/mastra/evals/test-data/ner-test-cases.ts` - Test data ready

**To Create**:

- `src/mastra/agents/claim-extraction-agent.ts`
- `src/mastra/agents/entity-proposal-agent.ts`
- `src/mastra/workflows/entity-extraction-workflow.ts`

## Quick Commands

```bash
# Test current baseline
cd apps/hash-ai-agent
pnpm tsx src/mastra/evals/test-entity-extraction.ts

# Run full evaluation
pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts

# Type check
pnpm tsc --noEmit
```

## Migration Principles (Reminder)

1. **Fixture data first** - Use stable test data, no external URLs
2. **Copy pure TS logic** - Import directly from hash-ai-worker-ts
3. **Extract LLM logic to agents** - System prompts + tool definitions
4. **Work within Mastra** - Use workflows, not Temporal

## Questions to Resolve (Future)

- How to handle entity type dereferencing with fixture data?
- Should we create mock Graph API or use real client?
- How to handle provenance tracking without Graph?
- Entity matching: Phase 3 or Phase 4?

## Resources

- [Mastra Docs](https://mastra.ai/docs)
- [Migration Plan](mastra-migration-plan.md)
- [Original NER Plan](ner-optimization-plan.md)
