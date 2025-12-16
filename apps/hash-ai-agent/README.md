# HASH AI Agent (Mastra-based)

Mastra-based implementation of HASH's AI inference capabilities, focusing on Named Entity Recognition (NER) and entity extraction optimization.

## Project Structure

```sh
src/mastra/
├── agents/
│   ├── generic-agent.ts             # General-purpose agent
│   └── ner-agent.ts                 # Named Entity Recognition agent
├── fixtures/
│   ├── entity-schemas/              # Dereferenced JSON schemas for entity types
│   │   ├── person.dereferenced.json
│   │   └── organization.dereferenced.json
│   ├── source-texts/                # Test source texts with ground truth
│   │   └── microsoft-wikipedia.ts   # Example fixture with expectedPersons
│   └── generate-schemas.ts          # Script to generate schema fixtures
├── scorers/
│   └── ner-people-scorer.ts         # NER people extraction scorer (recall + precision)
├── utils/
│   ├── schema-to-prompt-summary.ts  # Convert JSON schemas to LLM-friendly summaries
│   └── entity-type-to-yaml.ts       # (deprecated) YAML schema converter
├── workflows/
│   ├── ner-people-workflow.ts       # NER workflow for extracting people entities
│   └── ner-people-workflow.test.ts  # Eval test using runEvals + scorer
├── constants.ts                     # Shared constants (model ID, property URLs)
└── index.ts                         # Mastra instance registration
```

> **Note:** `_old/` directories contain archived/experimental code from earlier iterations.

## Quick Start

### Run the NER Evaluation

Run the NER people workflow evaluation using Vitest:

```bash
pnpm vitest src/mastra/workflows/ner-people-workflow.test.ts
```

This will:

- Execute the NER workflow on the Microsoft Wikipedia fixture
- Use the `nerPeopleScorer` to evaluate recall and precision
- Assert the overall score meets the threshold (> 0.7)

## Architecture

### Agents

**NER Agent** (`agents/ner-agent.ts`)

- **Purpose**: Named Entity Recognition (NER) - identify entities in text
- **Model**: `google/gemini-2.5-flash-lite` (via OpenRouter)
- **Input**: Source text + research goal + entity schemas
- **Output**: Structured array of entities matching provided schemas

**Generic Agent** (`agents/generic-agent.ts`)

- **Purpose**: General-purpose agent for ad-hoc tasks
- **Model**: Same as NER agent (shared via `constants.ts`)

### Workflows

**NER People Workflow** (`workflows/ner-people-workflow.ts`)

- **Purpose**: Extract person entities from source text
- **Steps**: Single step using `nerAgent` with structured output
- **Schema**: Uses dereferenced `person.json` schema from Block Protocol
- **Prompt**: Includes research goal and schema summary for context

### Scorers

**NER People Scorer** (`scorers/ner-people-scorer.ts`)

- **Purpose**: Evaluate NER extraction quality for people
- **Methodology**: LLM-assisted fuzzy name matching for variations
- **Metrics**:
  - Recall (70% weight): Expected persons found
  - Precision (30% weight): No false positives
- **Score**: 0-1 (1 = perfect extraction)

### Fixtures

**Entity Schemas** (`fixtures/entity-schemas/`)

- Dereferenced JSON schemas for `Person` and `Organization` entity types
- Generated from Block Protocol / HASH type definitions
- Used for structured output and prompt generation

**Source Texts** (`fixtures/source-texts/`)

- Test documents with ground truth (`expectedPersons`, `expectedOrganizations`)
- Examples: Microsoft Wikipedia article, news articles, research papers

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
# Required for LLM inference
OPENROUTER_API_KEY=your_api_key_here

# Optional: custom path to Mastra storage database
# Defaults to data/mastra.db relative to compiled entrypoint
MASTRA_DB_PATH=/path/to/custom/mastra.db
```

### Running Tests

```bash
# Run unit tests (excludes LLM-dependent evals)
pnpm test

# Run LLM-dependent evaluations (requires OPENROUTER_API_KEY)
pnpm test:evals
```

### Type Checking

```bash
pnpm tsc --noEmit
```

## References

- [Mastra Documentation](https://mastra.ai/docs)
- [Original Plan](docs/ner-optimization-plan.md) - Original NER optimization plan
- [Migration Plan](docs/mastra-migration-plan.md) - Detailed migration architecture
