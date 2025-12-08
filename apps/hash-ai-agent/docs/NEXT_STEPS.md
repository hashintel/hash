# Next Session: Phase 3 - Testing and Evaluation

## Current Status

✅ **Phase 2 Implementation Complete** (see `SESSION_HANDOFF.md`)

The full NER pipeline has been implemented:

- Fixtures system for testing without Graph API
- 3 agents (entity summary, claim extraction, entity proposal)
- 5-step workflow (get types → extract → dedupe → claims → propose)
- Integration test script ready

## Immediate Next Step: Test the Implementation

```bash
cd apps/hash-ai-agent
pnpm tsx src/mastra/evals/test-ner-workflow.ts
```

**Expected behavior**:

1. Loads Person and Organization fixtures
2. Extracts entities from sample text (OpenAI, Sam Altman, Elon Musk, etc.)
3. Deduplicates by name similarity
4. Extracts claims about entities
5. Proposes entities with properties and provenance

**If it fails**, debug in this order:

1. Check TypeScript compilation: `pnpm tsc --noEmit`
2. Check agent tool registration in `index.ts`
3. Check step imports in `workflows/ner-workflow.ts`
4. Add console.log statements to trace execution

## Phase 3: Evaluation and Optimization

Once the workflow runs successfully:

### Step 1: Validate Output Quality

Compare NER workflow output against expected entities:

- Are all expected entities found? (recall)
- Are there false positives? (precision)
- Are properties correctly populated?
- Are claims accurate?

### Step 2: Add More Test Cases

Expand `evals/test-ner-workflow.ts` with:

- Edge cases (ambiguous names, partial information)
- Different domains (tech, finance, healthcare)
- Longer documents

### Step 3: Create Comparison Evaluation

**File**: `src/mastra/evals/compare-approaches.ts`

Compare:

- Baseline (single-pass entity extraction)
- Full pipeline (5-step workflow)

Metrics:

- Entity recall / precision
- Property accuracy
- Token usage / cost
- Latency

### Step 4: Tune Agent Prompts

Based on evaluation results:

- Adjust temperature settings
- Refine system prompts for edge cases
- Tune deduplication similarity threshold

### Step 5: Add Graph API Integration (Future)

Replace fixtures with live Graph API calls:

- Create `getDereferencedEntityTypesFromGraph()` function
- Add authentication/context handling
- Test with real entity types from the database

## Quick Commands

```bash
# Navigate to project
cd apps/hash-ai-agent

# Run the NER workflow test (START HERE)
pnpm tsx src/mastra/evals/test-ner-workflow.ts

# Test baseline entity extraction (for comparison)
pnpm tsx src/mastra/evals/test-entity-extraction.ts

# Run full evaluation suite
pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts

# Type check
pnpm tsc --noEmit
```

## Key Architecture Reminders

### Step as Type Boundary

- Workflow steps have Zod schemas for input/output
- Agents receive string prompts, respond via tool calls
- Parse tool call `args` to extract structured data

### Tool Response Pattern

```typescript
const toolCalls = result.toolCalls ?? [];
const registerCall = toolCalls.find(
  (tc) => tc.name === "register-entity-summaries"
);
const entities = registerCall?.args?.entitySummaries ?? [];
```

### Per-Type Processing

- Large schemas can overflow context
- Process one entity type at a time
- Accumulate results across iterations

### Extract Then Deduplicate

- LLMs are better at extraction than filtering
- Extract all possible entities first
- Merge duplicates in a separate deterministic step

## Files Reference

### Core Implementation

- `workflows/ner-workflow.ts` - Main 5-step pipeline
- `workflows/steps/` - Individual step implementations
- `agents/` - Agent definitions (entity-summary, claim-extraction, entity-proposal)

### Fixtures

- `fixtures/entity-types/` - Dereferenced Person and Organization types

### Testing

- `evals/test-ner-workflow.ts` - Integration test (run this first!)
- `evals/test-entity-extraction.ts` - Baseline test

## Continuation Prompt

"Run the NER workflow test with `pnpm tsx src/mastra/evals/test-ner-workflow.ts` and debug any issues. Then evaluate output quality and compare against baseline extraction."
