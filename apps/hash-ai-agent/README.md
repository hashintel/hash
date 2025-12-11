# HASH AI Agent (Mastra-based)

Mastra-based implementation of HASH's AI inference capabilities, focusing on Named Entity Recognition (NER) and entity extraction optimization.

## Project Structure

```sh
src/mastra/
├── agents/
│   └── entity-summary-agent.ts      # NER agent (baseline)
├── evals/
│   ├── test-data/
│   │   └── ner-test-cases.ts        # Test dataset with scoring logic
│   ├── test-entity-extraction.ts    # Simple smoke test
│   └── run-entity-extraction-eval.ts # Full evaluation runner
├── scorers/
│   └── entity-recall-scorer.ts      # Entity recall/precision scorer
├── shared/
│   ├── dereference-entity-type.ts   # Entity type schema utilities
│   └── generate-simplified-type-id.ts # Helper for type dereferencing
├── types/
│   └── entities.ts                  # Core entity type definitions
└── index.ts                         # Mastra instance registration
```

## Quick Start

### 1. Simple Test

Run a single test case to verify the agent works:

```bash
pnpm tsx src/mastra/evals/test-entity-extraction.ts
```

This will:

- Load the first test case from `ner-test-cases.ts`
- Run the entity summary agent
- Display extracted entities vs. expected entities

### 2. Full Evaluation

Run all test cases with scoring:

```bash
pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts
```

This will:

- Run all NER test cases
- Calculate entity recall, precision, and type accuracy
- Display average scores and detailed breakdowns

## Architecture

### Agents

**Entity Summary Agent** (`agents/entity-summary-agent.ts`)

- **Purpose**: Named Entity Recognition (NER) - identify entities in text
- **Model**: `google/gemini-2.0-flash-exp:free` (via OpenRouter)
- **Tool**: `registerEntitySummaries` for reporting found entities
- **Input**: Text + research goal + entity types
- **Output**: Array of entity summaries (name, summary, type)

### Scorers

**Entity Recall Scorer** (`scorers/entity-recall-scorer.ts`)

- **Purpose**: Measure extraction quality (recall, precision, type accuracy)
- **Methodology**: Ported from hash-ai-worker-ts optimization tests
- **Metrics**:
  - Gold entities found vs. missed (recall)
  - Irrelevant entities identified (false positives)
  - Wrong-type entities (type confusion)
- **Score**: 0-1 (1 = perfect extraction)

### Test Data

**NER Test Cases** (`evals/test-data/ner-test-cases.ts`)

- **Source**: Ported from hash-ai-worker-ts
- **Format**: Stable fixtures (no external dependencies)
- **Coverage**: AI companies, people, organizations, edge cases
- **Ground Truth**: Gold entities, irrelevant entities, wrong-type entities

### Type Definitions

**Entity Types** (`types/entities.ts`)

- `LocalEntitySummary` - Step 1: Entity name + summary + types
- `Claim` - Step 2: Facts about entities (for future phases)
- `ProposedEntity` - Step 3: Full entity with properties (for future phases)
- `SourceProvenance` - Provenance tracking

## Migration from hash-ai-worker-ts

This project migrates AI inference capabilities from `hash-ai-worker-ts` (Temporal-based) to Mastra architecture:

- **Workflows** (Temporal) → **Mastra Workflows** (structured steps)
- **Activities** (LLM-based) → **Mastra Agents** (with tools)
- **Activities** (deterministic) → **Mastra Tools**
- **AI Tests** → **Mastra Evals** (scorers)

See `docs/mastra-migration-plan.md` for complete architectural mapping.

## Next Steps (Future Phases)

- [ ] Create claim extraction agent
- [ ] Create entity proposal agent
- [ ] Build three-step workflow (summaries → claims → entities)
- [ ] Create additional scorers (property accuracy, claim accuracy)
- [ ] Add entity matching/deduplication agent
- [ ] Integrate with HASH Graph API (currently using fixtures)

## Development

### Prerequisites

- Node.js 22+
- pnpm
- OpenRouter API key (for Google models)

### Environment Variables

```bash
OPENROUTER_API_KEY=your_api_key_here
```

### Running Tests

```bash
# Quick smoke test
pnpm tsx src/mastra/evals/test-entity-extraction.ts

# Full evaluation suite
pnpm tsx src/mastra/evals/run-entity-extraction-eval.ts
```

### Type Checking

```bash
pnpm tsc --noEmit
```

## References

- [Mastra Documentation](https://mastra.ai/docs)
- [Original Plan](docs/ner-optimization-plan.md) - Original NER optimization plan
- [Migration Plan](docs/mastra-migration-plan.md) - Detailed migration architecture
