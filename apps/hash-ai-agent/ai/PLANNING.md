# hash-ai-worker-ts → hash-ai-agent Port Planning

## Source Tree (hash-ai-worker-ts)

Legend:

- ✅ = Ported to Mastra
- 🔶 = Partially ported / needs work
- ⬜ = Not yet ported (but relevant to entity extraction workflow)

```
.
├── src
│   ├── activities
│   │   ├── flow-activities
│   │   │   ├── shared
│   │   │   │   ├── infer-summaries-then-claims-from-text/
│   │   │   │   │   ├── get-entity-summaries-from-text.ai.test.ts    ✅ test ported
│   │   │   │   │   ├── get-entity-summaries-from-text.optimize/
│   │   │   │   │   │   └── test-data.ts                             ✅ → fixtures/entity-summary-fixtures.ts
│   │   │   │   │   ├── get-entity-summaries-from-text.optimize.ai.test.ts
│   │   │   │   │   ├── get-entity-summaries-from-text.ts            🔶 agent defined, orchestration missing
│   │   │   │   │   ├── infer-entity-claims-from-text-agent.ts       🔶 agent defined, validation/retry missing
│   │   │   │   │   ├── infer-entity-claims-from-text.ai.test.ts
│   │   │   │   │   └── infer-summaries-then-claims-from-text.ai.test.ts  ✅ test ported (1/4 fixtures active)
│   │   │   │   ├── infer-summaries-then-claims-from-text.ts         ⬜ orchestrator function
│   │   │   │   ├── claims.ts                                        ⬜ Claim type definitions
│   │   │   │   └── graph-requests.ts                                ⬜ graph persistence helpers
│   │   │   └── ...
│   │   └── shared
│   │       ├── dereference-entity-type.ts                           ✅ → utils/dereference-entity-type.ts
│   │       ├── get-flow-context.ts                                  ⬜ flow context (Mastra has own patterns)
│   │       └── get-llm-response/                                    ⬜ (Mastra handles LLM abstraction)
│   │           ├── types.ts                                         ⬜ LlmMessage, LlmToolDefinition types
│   │           └── ...
│   └── ...
└── ...
```

---

## Entity Extraction Workflow: Port Status

### What's Been Ported

| Source File | Mastra Destination | Notes |
|-------------|-------------------|-------|
| `get-entity-summaries-from-text.ts` | `agents/entity-summary-agent.ts` | Agent instructions ported; tool schema defined |
| `infer-entity-claims-from-text-agent.ts` | `agents/claim-extraction-agent.ts` | Agent instructions ported; tool schema defined |
| `test-data.ts` (optimize folder) | `fixtures/entity-summary-fixtures.ts` | Test fixtures with gold/irrelevant/wrong-type entities |
| `infer-summaries-then-claims-from-text.ai.test.ts` | `fixtures/infer-claims-fixtures.ts` | Test fixtures for claim extraction pipeline |
| `dereference-entity-type.ts` | `utils/dereference-entity-type.ts` | Type utilities for entity type dereferencing |
| (inline tool schemas) | `tools/register-summaries-tool.ts` | Zod schema for entity registration |
| (inline tool schemas) | `tools/submit-claims-tool.ts` | Zod schema for claim submission |
| (new for Mastra) | `scorers/entity-summaries-scorer.ts` | LLM-judged scorer for entity extraction quality |
| (new for Mastra) | `scorers/claims-scorer.ts` | LLM-judged scorer for claims structure validation |
| `get-entity-summaries-from-text.ai.test.ts` | `agents/entity-summary-agent.test.ts` | Entity extraction test using `runEvals` |
| `infer-summaries-then-claims-from-text.ai.test.ts` | `agents/claim-extraction-agent.test.ts` | Two-stage pipeline test (entity → claims) |

### What's NOT Yet Ported (Entity Extraction Scope)

#### 1. Orchestration Logic (`infer-summaries-then-claims-from-text.ts`)

The main coordinator that:

- Calls entity extraction first
- Groups entities by type
- Iterates over each entity to extract claims
- Aggregates results

**Source signature:**

```typescript
export const inferSummariesThenClaimsFromText = async (params: {
  text: string;
  url: string | null;
  title: string | null;
  contentType: "webpage" | "document";
  existingEntitiesOfInterest: LocalEntitySummary[];
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  goal: string;
  workerIdentifiers: WorkerIdentifiers;
}) => Promise<{ claims: Claim[]; entitySummaries: LocalEntitySummary[] }>
```

**Mastra equivalent needed:** A workflow that chains `entitySummaryAgent` → `claimExtractionAgent`

#### 2. Multi-Turn Validation & Retry (in `infer-entity-claims-from-text-agent.ts`)

The source has sophisticated validation:

- Max 3 retries per extraction
- Validates subject/object entity IDs exist
- Validates entity names match claim text
- Feeds back specific errors to LLM for correction
- Tracks valid claims across retry attempts

**Currently missing in Mastra:** The tools return mock `{ submitted: true }` without validation

#### 3. Claim Persistence to Graph

Source creates `ClaimEntity` in HASH graph:

```typescript
await createEntity({
  entityTypeId: systemEntityTypes.claim.entityTypeId,
  properties: { ... },
  provenance: { ... }
});
```

**Mastra tools currently:** Just return success without persisting

#### 4. Type Definitions

| Type | Source Location | Status |
|------|-----------------|--------|
| `LocalEntitySummary` | `infer-summaries-then-claims-from-text.ts` | ⬜ needs defining |
| `Claim` | `shared/claims.ts` | ⬜ needs defining |
| `DereferencedEntityTypesByTypeId` | `dereference-entity-type.ts` | 🔶 partially in utils |

#### 5. Model Configuration

| Task | Source Model | Current Mastra Model |
|------|--------------|---------------------|
| Entity extraction | Claude 3.5 Sonnet (temp 0) | `openrouter/google/gemini-2.5-flash-lite` |
| Claim extraction | GPT-4o 2024-08-06 (temp 0.5) | `openrouter/google/gemini-2.5-flash-lite` |

Source uses different models per task based on complexity.

---

## Key Differences: Source vs Mastra Architecture

| Aspect | Source (hash-ai-worker-ts) | Mastra Port |
|--------|---------------------------|-------------|
| LLM abstraction | Custom `getLlmResponse()` with multi-provider | Mastra's built-in model config |
| Tool execution | Inline in function, immediate persistence | Tool returns schema; execution separate |
| Validation | Multi-turn conversation with error feedback | Not yet implemented |
| State management | Temporal workflow activities | Mastra workflows (TBD) |
| Testing | Vitest with `ai.test.ts` pattern | Vitest with `@mastra/evals` scorers |

---

## Recommended Next Steps (Entity Extraction Only)

1. **Capture remaining HTML fixtures** - Run `scripts/capture-test-fixtures.ts` to fetch Sora paper, FTSE350, OpenAI models pages
2. **Enable additional test fixtures** - Uncomment the 3 fixtures in `infer-claims-fixtures.ts` once HTML is captured
3. **Define core types** - `LocalEntitySummary`, `Claim` in a shared types file
4. **Create Mastra workflow** - Chain the two agents with proper data flow
5. **Implement tool execution** - Move from mock responses to actual logic
6. **Add validation layer** - Port the retry/validation logic (may need custom step)
7. **Wire up graph persistence** - Connect to HASH graph for claim storage

---

## Current Mastra Project Structure

```
apps/hash-ai-agent/src/mastra/
├── agents/
│   ├── entity-summary-agent.ts          # Entity extraction agent
│   ├── entity-summary-agent.test.ts     # Test with runEvals + scorer
│   ├── claim-extraction-agent.ts        # Claim extraction agent
│   └── claim-extraction-agent.test.ts   # Two-stage pipeline test
├── fixtures/
│   ├── entity-summary-fixtures.ts       # Gold/irrelevant/wrong-type entity test data
│   └── infer-claims-fixtures.ts         # Pipeline test fixtures (1 active, 3 pending)
├── scorers/
│   ├── entity-summaries-scorer.ts       # Validates entity extraction quality
│   └── claims-scorer.ts                 # Validates claims structure & entity references
├── tools/
│   ├── register-summaries-tool.ts       # Entity registration tool schema
│   └── submit-claims-tool.ts            # Claim submission tool schema
└── utils/
    └── dereference-entity-type.ts       # Entity type utilities
```

## Test Architecture

Tests use Mastra's `runEvals` with custom scorers:

1. **Entity Summary Test** (`entity-summary-agent.test.ts`)
   - Single agent call
   - Scorer: `entitySummariesCompositeScorer` - compares extracted entities against gold/irrelevant/wrong-type lists

2. **Claim Extraction Test** (`claim-extraction-agent.test.ts`)
   - Two-stage pipeline: entity summary agent → claim extraction agent
   - Scorer: `claimsStructureScorer` - validates claim structure and entity ID references
   - Currently 1 of 4 fixtures active (Microsoft Wikipedia - uses static content)
   - 3 fixtures pending HTML capture (Sora paper, FTSE350, OpenAI models)
