# Session Handoff: Phase 1 Complete

**Date**: 2025-12-05
**Status**: ✅ Phase 1 Foundation Complete, Ready for Phase 2

## What We Accomplished

### 1. Architectural Understanding

- Thoroughly analyzed hash-ai-worker-ts codebase
- Mapped Temporal architecture to Mastra concepts
- Clarified: **Agents** (LLM inference) vs **Tools** (deterministic functions)
- Documented memory analysis (not needed for Phase 1 NER)
- Created comprehensive migration plan

### 2. Core Infrastructure

Created the foundation for Mastra-based NER:

**Types** (`src/mastra/types/entities.ts`):

- LocalEntitySummary, Claim, ProposedEntity with Zod schemas
- SourceProvenance tracking
- All types needed for 3-step extraction pipeline

**Utilities** (`src/mastra/shared/`):

- `dereference-entity-type.ts` (510 lines, pure TS logic)
- `generate-simplified-type-id.ts` (helper utility)

**Test Data** (`src/mastra/evals/test-data/ner-test-cases.ts`):

- 4 focused test cases (AI companies, people, organizations, edge cases)
- Stable fixtures (no external dependencies)
- Ground truth with gold/irrelevant/wrong-type entities
- `calculateNERScore()` function with weighted penalties

**Agent** (`src/mastra/agents/entity-summary-agent.ts`):

- NER agent using Google Gemini 2.0 Flash (via OpenRouter)
- `registerEntitySummaries` tool for structured output
- System prompt ported from hash-ai-worker-ts

**Scorer** (`src/mastra/scorers/entity-recall-scorer.ts`):

- 4-step Mastra scorer (preprocess → analyze → score → reason)
- Measures recall, precision, type accuracy
- Ported evaluation logic from hash-ai-worker-ts

**Test Scripts**:

- `test-entity-extraction.ts` - Simple smoke test
- `run-entity-extraction-eval.ts` - Full evaluation runner

**Documentation**:

- `mastra-migration-plan.md` - Complete architectural mapping
- `NEXT_STEPS.md` - Phase 2 roadmap
- `README.md` - Project overview

### 3. Registration

- Updated `src/mastra/index.ts` with entitySummaryAgent and entityRecallScorer
- No TypeScript diagnostics

## Current Test Status

**Running**: `pnpm tsx src/mastra/evals/test-entity-extraction.ts`

This test will verify:

- Agent can call LLM successfully
- `registerEntitySummaries` tool works
- Entity extraction produces output
- Integration with Mastra is working

## Next Session: Phase 2 Roadmap

### Priority 1: Claim Extraction Agent

**File**: `src/mastra/agents/claim-extraction-agent.ts`
**Source**: `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/infer-summaries-then-claims-from-text/infer-entity-claims-from-text-agent.ts`

Port:

- System prompt (claim extraction instructions)
- `submitClaims` tool definition
- Claim structure: subject + predicate + object + prepositional phrases
- Validation logic (verifies entity names appear in claim text)
- Temperature: 0.5 (for claim variation)

### Priority 2: Entity Proposal Agent

**File**: `src/mastra/agents/entity-proposal-agent.ts`
**Source**: `/apps/hash-ai-worker-ts/src/activities/flow-activities/shared/propose-entities-from-claims/propose-entity-from-claims-agent.ts`

Port:

- System prompt (convert claims to properties)
- `proposeEntity` and `abandonEntity` tools
- Property value + claim ID provenance tracking
- Entity type schema integration (use dereferenced types)

### Priority 3: Three-Step Workflow

**File**: `src/mastra/workflows/entity-extraction-workflow.ts`

Create:

- Step 1: Extract summaries (call entitySummaryAgent)
- Step 2: Extract claims (call claimExtractionAgent)
- Step 3: Propose entities (call entityProposalAgent)
- Workflow composition with `.then()` chaining

### Priority 4: Evaluation

Run comparative evaluation:

- Baseline vs. claims-based approach
- Measure recall, precision, property accuracy
- Track token usage and latency

## Key Decisions Made

1. **Graph API**: Using fixtures for Phase 1-2, defer real Graph integration
2. **Models**: Google Gemini via OpenRouter (cost-effective, fast)
3. **Test Data**: Stable fixtures only, no external URLs
4. **Pure Logic**: Copy directly from hash-ai-worker-ts (no changes)
5. **LLM Logic**: Extract system prompts, port to Mastra agents
6. **Memory**: Skip for Phase 1-2 (single-shot NER operations)
7. **Workflow Context**: Use Mastra's built-in context passing (not Temporal)

## Files Created (9 total)

1. `docs/mastra-migration-plan.md`
2. `docs/NEXT_STEPS.md`
3. `docs/SESSION_HANDOFF.md` (this file)
4. `README.md`
5. `src/mastra/types/entities.ts`
6. `src/mastra/shared/dereference-entity-type.ts`
7. `src/mastra/shared/generate-simplified-type-id.ts`
8. `src/mastra/evals/test-data/ner-test-cases.ts`
9. `src/mastra/agents/entity-summary-agent.ts`
10. `src/mastra/scorers/entity-recall-scorer.ts`
11. `src/mastra/evals/test-entity-extraction.ts`
12. `src/mastra/evals/run-entity-extraction-eval.ts`
13. `src/mastra/index.ts` (updated)

## Quick Reference Commands

```bash
# Navigate to project
cd apps/hash-ai-agent

# Run smoke test (currently running)
pnpm tsx src/mastra/evals/test-entity-extraction.ts

# Run full evaluation
pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts

# Type check
pnpm tsc --noEmit

# Check diagnostics
# Use IDE diagnostics tool
```

## Key Architecture Diagrams

### Mastra Architecture

```
Workflow (orchestration)
  ↓
  Steps (createStep)
  ↓
  Agents (LLM) + Tools (deterministic)
  ↓
  Agents use Tools
```

### Phase 2 Data Flow

```
Text → Entity Summaries → Claims → Proposed Entities

Step 1: entitySummaryAgent → LocalEntitySummary[]
Step 2: claimExtractionAgent → Claim[]
Step 3: entityProposalAgent → ProposedEntity[]
```

## Important Context

### hash-ai-worker-ts Location

- Path: `/Users/lunelson/Code/hashintel/hash/apps/hash-ai-worker-ts/`
- Key files in: `src/activities/flow-activities/shared/`

### hash-ai-agent Location

- Path: `/Users/lunelson/Code/hashintel/hash/apps/hash-ai-agent/`
- Mastra code in: `src/mastra/`

### Dependencies

- Mastra packages: `@mastra/core`, `@mastra/evals`, `@mastra/loggers`, `@mastra/libsql`
- OpenRouter API key: `process.env.OPENROUTER_API_KEY`
- Model: `openrouter/google/gemini-2.0-flash-exp:free`

## Continuation Prompt for Next Session

"Continue with Phase 2 of the NER migration: Create the claim extraction agent by porting the system prompt and logic from hash-ai-worker-ts. See docs/NEXT_STEPS.md for the detailed plan."

## Success Criteria for Phase 2

- [ ] Claim extraction agent created and working
- [ ] Entity proposal agent created and working
- [ ] Three-step workflow orchestrates all agents
- [ ] Evaluation shows improvement over baseline
- [ ] Test cases pass with claims-based approach
