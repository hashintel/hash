# Understanding hash-ai-worker-ts → Mastra Migration

## Mental Model: What hash-ai-worker-ts Does

The `hash-ai-worker-ts` is a **Temporal-based AI orchestration engine** that:

1. **Executes long-running AI workflows** (entity extraction, web research, document processing)
2. **Coordinates multiple LLM calls** with proper error handling and retries
3. **Integrates with HASH Graph** for entity storage, retrieval, and type resolution
4. **Manages complex multi-agent systems** for research and entity extraction
5. **Tracks provenance** of AI-generated data through claims and property metadata

Think of it as: **"AI microservice orchestrator with graph database integration"**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  hash-ai-worker-ts                      │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐ │
│  │   Workflows  │───▶│  Activities  │───▶│  Shared  │ │
│  │ (Orchestrate)│    │ (Execute)    │    │  (Utils) │ │
│  └──────────────┘    └──────────────┘    └──────────┘ │
│         │                   │                   │      │
└─────────┼───────────────────┼───────────────────┼──────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐       ┌──────────┐
    │ Temporal │        │   LLMs   │       │  Graph   │
    │  Server  │        │OpenAI/etc│       │   API    │
    └──────────┘        └──────────┘       └──────────┘
```

---

## Directory Structure Breakdown

### `/src/` - Root Level

| File | Purpose | Mastra Equivalent |
|------|---------|-------------------|
| `main.ts` | Worker initialization, Temporal connection | Mastra app bootstrap (`mastra init`) |
| `workflows.ts` | Public workflow APIs | Agent methods / workflow exports |
| `activities.ts` | Activity factory (dependency injection) | Tool/agent registration |

### `/src/activities/` - Core Logic

#### Key Directories:

**`flow-activities/`** - Action Implementations

- Each subdirectory is a **self-contained action** (like a Mastra Tool)
- Examples:
  - `research-entities-action/` → Multi-agent research system
  - `infer-metadata-from-document-action/` → Document entity extraction
  - `persist-entity-action/` → Entity storage
  - `get-web-page-action/` → Web scraping

**`infer-entities/`** - Legacy Entity Extraction

- **Two-step process**: summaries → full properties
- **Used by**: Browser plugin for inline entity recognition
- **Status**: Being superseded by claims-based approach

**`shared/`** - Reusable Utilities

- LLM abstraction (`get-llm-response/`)
- Entity matching (`match-existing-entity.ts`)
- Embeddings (`embeddings.ts`)
- Activity logging, context retrieval, validation

### `/src/workflows/` - Orchestration

**`run-flow-workflow.ts`** - Main Flow Orchestrator

- Manages step execution order
- Handles parallel groups
- Processes signals (external inputs) and queries (status checks)
- **Mastra equivalent**: Workflow with `.then()` and `.foreach()`

---

## Mapping to Mastra Concepts

### **CRITICAL: Agents vs Tools**

Per Mastra documentation:

**Agents:**

- Use LLM reasoning/generation
- Have instructions (system prompt)
- Decide which tools to call based on user input
- Example: Weather agent that interprets user questions and decides when to fetch weather

**Tools:**

- Perform specific operations (API calls, database queries, custom functions)
- Have structured input/output schemas (Zod)
- Are called by agents, not directly by users
- Example: Tool that fetches weather data from API

**Key Rule:** If it uses LLM inference → Agent. If it's deterministic/external call → Tool.

**Mastra Architecture Summary:**

```
┌─────────────────────────────────────────────────────────────┐
│                     Mastra Application                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Workflow                          │  │
│  │  (Deterministic orchestration)                       │  │
│  │                                                      │  │
│  │  Step 1 → Step 2 → Step 3 → Step 4                 │  │
│  │    ↓        ↓        ↓        ↓                     │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                  │  │
│  │  │Agent│ │Tool │ │Agent│ │Tool │                  │  │
│  │  │(LLM)│ │(API)│ │(LLM)│ │(fn) │                  │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘                  │  │
│  │     │                │                              │  │
│  │     └─── Tools ──────┘                              │  │
│  │     (Agent uses tools)                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Optional: Memory (for conversational agents)               │
│  Optional: Evals (scorers for quality measurement)          │
└──────────────────────────────────────────────────────────────┘
```

**Hierarchy:**

1. **Workflow** orchestrates **Steps**
2. **Steps** call **Agents** and/or **Tools**
3. **Agents** use **Tools** (optional)
4. **Memory** (optional, for multi-turn conversations)
5. **Evals** (optional, for measuring quality)

---

### 1. **Workflows** → **Mastra Workflows**

**Key Distinction:** Per Mastra docs, workflows orchestrate "complex sequences of tasks using clear, structured steps rather than relying on the reasoning of a single agent."

**Mastra Workflow Architecture:**

- **Steps** (`createStep`): Building blocks with input/output schemas
- **Workflows** (`createWorkflow`): Compose steps with `.then()`, `.foreach()`, etc.
- **Steps can call**: Agents, tools, or other workflows
- **Control flow**: Deterministic orchestration (not agent reasoning)

**Current (Temporal):**

```typescript
export const runFlow = createWorkflow({
  id: "run-flow",
  steps: [...],
  execute: async (params) => {
    // Orchestrate activities
  }
})
```

**Mastra Equivalent:**

```typescript
// Step 1: Extract entity summaries (calls agent)
const extractSummariesStep = createStep({
  id: "extract-summaries",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({ summaries: z.array(EntitySummarySchema) }),
  execute: async ({ inputData }) => {
    const result = await entitySummaryAgent.generate(inputData.text)
    return { summaries: result.entities }
  }
})

// Step 2: Extract claims for each entity (calls agent in parallel)
const extractClaimsStep = createStep({
  id: "extract-claims",
  inputSchema: z.object({
    text: z.string(),
    summaries: z.array(EntitySummarySchema)
  }),
  outputSchema: z.object({ claims: z.array(ClaimSchema) }),
  execute: async ({ inputData }) => {
    // Call claim extraction agent
  }
})

// Workflow: Compose steps
export const entityExtractionWorkflow = createWorkflow({
  id: "entity-extraction-workflow",
  inputSchema: z.object({ text: z.string() }),
  outputSchema: z.object({
    entities: z.array(EntitySchema),
    claims: z.array(ClaimSchema)
  })
})
  .then(extractSummariesStep)
  .then(extractClaimsStep)
  .then(proposeEntitiesStep)
  .commit()
```

**Key Files:**

- `/workflows/run-flow-workflow.ts` → `src/mastra/workflows/entity-extraction-workflow.ts`
- `/workflows/run-flow-workflow/initialize-flow.ts` → Workflow setup logic (may become initial step)

---

### 2. **Activities** → **Mastra Agents or Tools (depends on type)**

**CRITICAL DISTINCTION:**

**LLM Inference Activities** → **Mastra Agents**

- Activities that use LLM reasoning/generation
- Examples: Entity extraction, claim inference, entity matching

**Deterministic/External Activities** → **Mastra Tools**

- Pure functions, external API calls, data transformations
- Examples: Web scraping, file parsing, entity type dereferencing

**Example: Entity Extraction (LLM-based) → Agent**

```typescript
// Current (Temporal Activity with LLM)
export const inferEntitiesFromText = async (params) => {
  const llmResponse = await getLlmResponse({
    systemPrompt: "...",
    tools: [registerEntitySummaries],
    ...
  })
  return { entities: [...] }
}

// Mastra Equivalent → AGENT
export const entityExtractionAgent = new Agent({
  id: "entity-extraction-agent",
  name: "Entity Extraction Agent",
  instructions: "You extract named entities from text...",
  model: "google/gemini-flash-2.0",
  tools: {
    registerEntitySummaries
  }
})
```

**Example: Web Scraping (Deterministic) → Tool**

```typescript
// Current (Temporal Activity, no LLM)
export const getWebPageContent = async (params: {
  url: string
}) => {
  const response = await fetch(url)
  const html = await response.text()
  return { content: html }
}

// Mastra Equivalent → TOOL
export const getWebPageContent = createTool({
  id: "get-web-page-content",
  description: "Fetch and return web page content",
  inputSchema: z.object({
    url: z.string()
  }),
  outputSchema: z.object({
    content: z.string()
  }),
  execute: async ({ url }) => {
    const response = await fetch(url)
    return { content: await response.text() }
  }
})
```

**Key Files Mapping:**

**→ Mastra Agents (LLM-based):**

- `/activities/flow-activities/shared/get-entity-summaries-from-text.ts` → Agent
- `/activities/flow-activities/shared/infer-entity-claims-from-text-agent.ts` → Agent
- `/activities/flow-activities/shared/propose-entity-from-claims-agent.ts` → Agent
- `/activities/shared/match-existing-entity.ts` → Agent (with tool for reporting)

**→ Mastra Tools (Deterministic):**

- `/activities/flow-activities/get-web-page-action/` → Tool (web scraping)
- `/activities/shared/dereference-entity-type.ts` → Internal utility or Tool
- Web search, file parsing, etc. → Tools

**→ Internal Utilities (Not exposed as Agent/Tool):**

- `/activities/shared/get-llm-response/` → Replaced by Mastra's LLM abstractions

---

### 3. **Multi-Agent Coordination** → **Mastra Agents**

**Current (Coordinating Agent Pattern):**

```typescript
// In research-entities-action/coordinating-agent.ts
const coordinatingAgent = {
  systemPrompt: "You are a research coordinator...",
  tools: [queryEntities, searchWeb, inferEntities],
  execute: async () => {
    // Orchestrate research with multiple calls
  }
}
```

**Mastra Equivalent:**

```typescript
export const researchAgent = new Agent({
  id: "research-agent",
  name: "Research Coordinator",
  instructions: "You are a research coordinator...",
  model: "openai/gpt-4o",
  tools: {
    queryEntities,
    searchWeb,
    inferEntities
  }
})
```

**Key Files:**

- `/activities/flow-activities/research-entities-action/coordinating-agent.ts` → Agent
- `/activities/flow-activities/research-entities-action/link-follower-agent.ts` → Agent

---

### 4. **Test Data + AI Tests** → **Mastra Evals**

**Current (Vitest AI Tests):**

```typescript
// In infer-summaries-then-claims-from-text/...ai.test.ts
describe("Entity Summary Inference", () => {
  it("should extract entities from text", async () => {
    const result = await getEntitySummariesFromText({...})
    expect(result.entities).toHaveLength(5)
  })
})
```

**Mastra Equivalent:**

```typescript
export const entityRecallScorer = createScorer({
  name: "Entity Recall",
  description: "Measures entity extraction completeness",
  type: "agent"
})
  .preprocess(({ run }) => {
    // Extract entities and ground truth
  })
  .analyze({
    description: "Compare extracted vs expected",
    outputSchema: z.object({
      foundEntities: z.array(z.string()),
      missedEntities: z.array(z.string())
    }),
    createPrompt: ({ results }) => "..."
  })
  .generateScore(({ results }) => {
    return results.foundEntities.length / results.totalExpected
  })
  .generateReason(({ results }) => "...")
```

**Key Files:**

- `/activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.optimize/test-data.ts` → Test dataset
- `/activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.ai.test.ts` → Eval
- `/activities/shared/match-existing-entity.optimize.ai.test.ts` → Eval

---

### 5. **LLM Abstraction** → **Mastra Model Configuration**

**Current (Custom Abstraction):**

```typescript
// In activities/shared/get-llm-response/
export const getLlmResponse = async (params: {
  provider: "openai" | "anthropic" | "google-vertex-ai";
  model: string;
  systemPrompt: string;
  messages: Message[];
  tools?: Tool[];
}) => {
  // Route to appropriate LLM API
}
```

**Mastra Equivalent:**

```typescript
// In agent/tool definition
export const myAgent = new Agent({
  model: "openai/gpt-4o", // Mastra handles routing
  // or
  model: "anthropic/claude-3-5-sonnet-20241022"
})
```

**Key Files:**

- `/activities/shared/get-llm-response/` → Mostly replaced by Mastra's built-in LLM routing
- `/activities/shared/get-llm-response/llm-message.ts` → Message type mapping

---

## Entity Extraction: Two Approaches

### Approach 1: Legacy (Browser Plugin) - Two-Step

**Files:**

- `/activities/infer-entities/infer-entity-summaries.ts` (Step 1)
- `/activities/infer-entities/propose-entities.ts` (Step 2)
- `/activities/infer-entities-from-web-page-activity.ts` (Entry point)

**Process:**

1. **Step 1**: Extract entity summaries (names + brief descriptions)
2. **Step 2**: For each summary, extract full properties

**Data Flow:**

```
Text → ProposedEntitySummary[] → ProposedEntity[]
```

**Mastra Mapping:**

```typescript
// Tool 1: Extract summaries
extractEntitySummaries = createTool({...})

// Tool 2: Extract properties
extractEntityProperties = createTool({...})

// Workflow: Orchestrate
extractEntitiesTwoStep = createWorkflow({...})
  .then(extractSummaries)
  .foreach(extractProperties, { concurrency: 5 })
  .commit()
```

---

### Approach 2: Modern (Flow-Based) - Claims-Based

**Files:**

- `/activities/flow-activities/shared/get-entity-summaries-from-text.ts` (Step 1)
- `/activities/flow-activities/shared/infer-entity-claims-from-text-agent.ts` (Step 2)
- `/activities/flow-activities/shared/propose-entity-from-claims-agent.ts` (Step 3)
- `/activities/flow-activities/shared/infer-summaries-then-claims-from-text.ts` (Orchestrator)

**Process:**

1. **Step 1**: NER - identify entity names and types
2. **Step 2**: Claim extraction - extract facts about entities
3. **Step 3**: Entity proposal - convert claims to properties

**Data Flow:**

```
Text → LocalEntitySummary[] → Claim[] → ProposedEntity[]
```

**Why Claims?**

- **Provenance tracking**: Know which claims led to which properties
- **Relationship inference**: Claims naturally express entity links
- **Validation**: Easier to validate individual claims than full entities

**Mastra Mapping:**

```typescript
// Tool 1: NER
extractEntitySummaries = createTool({...})

// Tool 2: Claim extraction
extractClaims = createTool({...})

// Tool 3: Entity proposal
proposeEntityFromClaims = createTool({...})

// Workflow: Orchestrate
extractEntitiesWithClaims = createWorkflow({...})
  .then(extractSummaries)
  .then(extractClaims)
  .foreach(proposeEntityFromClaims)
  .commit()
```

---

## Key External Dependencies to Replicate

### 1. **HASH Graph API** (Critical)

**What it does:**

- Entity CRUD operations
- Type schema queries (entity types, property types)
- Semantic search via embeddings
- Temporal-axis queries (time-aware data)

**Files:**

- `/activities/shared/graph-api-client.ts` - Client wrapper
- Uses `@local/hash-graph-client` and `@local/hash-graph-sdk`

**Mastra Strategy:**

- **Option A**: Mock the Graph API for local testing
- **Option B**: Create a lightweight adapter that wraps Graph API calls
- **Option C**: Use Mastra's storage adapters (if sufficient)

**Key Operations:**

```typescript
// Query entities
await graphApi.getEntitiesByQuery({
  filter: {...},
  temporalAxes: currentTimeInstantTemporalAxes
})

// Create entity
await HashEntity.create(graphApi, authentication, {
  entityTypeId: "...",
  properties: {...}
})

// Query types
await queryEntityTypeSubgraph(graphApi, authentication, {
  filter: { equal: [{ path: ["versionedUrl"], parameter: "..." }] }
})
```

---

### 2. **Entity Type Resolution**

**What it does:**

- Fetches entity type schemas from Graph
- Dereferences nested property definitions
- Generates LLM prompts with type constraints

**Files:**

- `/activities/shared/dereference-entity-type.ts`
- `/activities/infer-entities/shared/get-entity-type-for-llm-prompt.ts`

**Mastra Strategy:**

- Port type dereferencing logic to Mastra
- Create schemas directory with Zod schemas
- Generate system prompts from schemas

---

### 3. **Entity Matching / Deduplication**

**What it does:**

- LLM-based semantic matching to find duplicate entities
- Cautious matching (prefers false negatives over false positives)
- Property merging for matched entities

**Files:**

- `/activities/shared/match-existing-entity.ts` (273 lines)
- `/activities/shared/find-existing-entity.ts` (Uses embeddings + LLM)

**Mastra Strategy:**

- Port as Mastra Tool: `matchEntity`
- Create scorer to evaluate matching quality

---

### 4. **Temporal Context**

**What it does:**

- Provides workflow execution context to activities
- Access to workflow history, parameters, and cancellation signals

**Files:**

- `/activities/shared/get-flow-context.ts`

**Mastra Strategy:**

- **Not needed** - Mastra workflows have built-in context passing
- Workflow inputs become step inputs automatically

---

## File Mapping Summary

### Core Files to Port

| hash-ai-worker-ts File | Mastra Destination | Type | Reason |
|------------------------|-------------------|------|---------|
| `/activities/flow-activities/research-entities-action/coordinating-agent.ts` | `src/mastra/agents/research-agent.ts` | **Agent** | Uses LLM reasoning to coordinate research |
| `/activities/flow-activities/shared/get-entity-summaries-from-text.ts` | `src/mastra/agents/entity-summary-agent.ts` | **Agent** | LLM-based NER (entity recognition) |
| `/activities/flow-activities/shared/infer-entity-claims-from-text-agent.ts` | `src/mastra/agents/claim-extraction-agent.ts` | **Agent** | LLM-based claim inference |
| `/activities/flow-activities/shared/propose-entity-from-claims-agent.ts` | `src/mastra/agents/entity-proposal-agent.ts` | **Agent** | LLM converts claims to entity properties |
| `/activities/shared/match-existing-entity.ts` | `src/mastra/agents/entity-matcher-agent.ts` | **Agent** | LLM-based semantic entity matching |
| `/activities/infer-entities/infer-entity-summaries.ts` | `src/mastra/agents/entity-summary-agent.ts` | **Agent** | Legacy two-step: LLM entity summary extraction |
| `/activities/infer-entities/propose-entities.ts` | `src/mastra/agents/entity-property-agent.ts` | **Agent** | Legacy two-step: LLM property extraction |
| `/activities/flow-activities/get-web-page-action/` | `src/mastra/tools/fetch-web-page.ts` | **Tool** | Deterministic web scraping (no LLM) |
| `/activities/shared/dereference-entity-type.ts` | `src/mastra/shared/dereference-entity-type.ts` | **Utility** | Pure TS logic - copy directly |
| `/workflows/run-flow-workflow.ts` | `src/mastra/workflows/entity-extraction-workflow.ts` | **Workflow** | Orchestrates agents + tools |
| `/activities/flow-activities/shared/infer-summaries-then-claims-from-text.optimize/test-data.ts` | `src/mastra/evals/test-data/ner-test-cases.ts` | **Test Data** | Evaluation golden dataset |
| `/activities/flow-activities/shared/get-entity-summaries-from-text.ai.test.ts` | `src/mastra/evals/entity-recall.eval.ts` | **Eval** | Mastra scorer for entity recall |

### Utility Files (Reference Only)

| File | Purpose | Mastra Approach |
|------|---------|-----------------|
| `/activities/shared/get-llm-response/` | LLM abstraction | Use Mastra's built-in LLM routing |
| `/activities/shared/activity-logger.ts` | Structured logging | Use Mastra's logging |
| `/activities/shared/embeddings.ts` | Embedding generation | Port as internal utility (or use Mastra's) |
| `/activities/shared/graph-api-client.ts` | Graph API client | Mock with fixtures (Phase 1) |

---

## Critical Type Definitions

### Entity Types (from `hash-ai-worker-ts`)

```typescript
// LocalEntitySummary (Modern approach)
{
  localId: EntityId;
  name: string;
  summary: string;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
}

// Claim (Modern approach)
{
  claimId: EntityId;
  subjectEntityLocalId: EntityId;
  objectEntityLocalId?: EntityId | null;
  text: string;
  prepositionalPhrases: string[];
  sources?: SourceProvenance[];
}

// ProposedEntity (Output)
{
  localEntityId: EntityUuid;
  entityTypeIds: VersionedUrl[];
  properties: Record<string, unknown>;
  propertyMetadata: {...};
  claims?: { isSubjectOf: Claim[], isObjectOf: Claim[] };
  sourceEntityId?: { kind: "proposed-entity", localId: EntityId };
  targetEntityId?: { kind: "proposed-entity", localId: EntityId };
}
```

### Mastra Schema Definitions

```typescript
// src/mastra/types/entities.ts
export const LocalEntitySummarySchema = z.object({
  localId: z.string(),
  name: z.string(),
  summary: z.string(),
  entityTypeIds: z.array(z.string()).min(1)
})

export const ClaimSchema = z.object({
  claimId: z.string(),
  subjectEntityLocalId: z.string(),
  objectEntityLocalId: z.string().optional(),
  text: z.string(),
  prepositionalPhrases: z.array(z.string()),
  sources: z.array(SourceProvenanceSchema).optional()
})

export const ProposedEntitySchema = z.object({
  localEntityId: z.string(),
  entityTypeIds: z.array(z.string()),
  properties: z.record(z.unknown()),
  propertyMetadata: PropertyMetadataSchema.optional(),
  claims: z.object({
    isSubjectOf: z.array(ClaimSchema),
    isObjectOf: z.array(ClaimSchema)
  }).optional()
})
```

---

---

## Critical External Dependencies: Detailed Analysis

### 1. **HASH Graph API** - Remote HTTP Service

**Nature:** Remote HTTP-based service (separate microservice)

**Connection Details:**

- Environment variables: `HASH_GRAPH_HTTP_HOST`, `HASH_GRAPH_HTTP_PORT`
- Default: `http://graph:4000` (in Docker) or `http://localhost:4000` (local)
- Client creation: Via `@local/hash-backend-utils/create-graph-client`
- File: `/activities/shared/graph-api-client.ts` (10 lines - just creates client)

**What it does:**

- Entity CRUD operations (create, read, update, patch)
- Type schema queries (entity types, property types, data types)
- Semantic search via cosine distance on embeddings
- Temporal-axis queries (time-aware data with transaction times)
- Subgraph queries with customizable depths

**Key Operations:**

```typescript
// Query entities with filters
await graphApi.getEntitiesByQuery({
  filter: {
    equal: [{ path: ["property", "path"], parameter: value }]
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false
})

// Create entity
await HashEntity.create(graphApi, authentication, {
  entityTypeId: "...",
  properties: {...},
  propertyMetadata: {...}
})

// Query entity type subgraph (with all dependencies)
await queryEntityTypeSubgraph(graphApi, authentication, {
  filter: { equal: [{ path: ["versionedUrl"], parameter: "..." }] },
  graphResolveDepths: {
    inheritsFrom: { outgoing: 255 },
    constrainsPropertiesOn: { outgoing: 255 }
  }
})
```

**Can we import it?**

- ✅ Yes - `@local/hash-graph-client` and `@local/hash-graph-sdk` are monorepo packages
- ✅ Yes - Can use the same Graph API client the worker uses

**Can we mock it?**

- ✅ Yes - Can create fixture data for entity types and entities
- ⚠️ Partial - Semantic search via embeddings would need to be simplified
- ⚠️ Partial - Temporal queries could be simplified to "latest version only"

---

### 2. **Entity Type Resolution** - Pure Logic (Can Import)

**Nature:** Pure TypeScript logic that operates on type subgraphs

**What it does:**

- Takes an entity type ID + subgraph (from Graph API)
- Dereferences nested property definitions recursively
- Flattens property type references into inline schemas
- Optionally simplifies BaseURL keys to simple strings (e.g., "https://...property-type/name/" → "name")
- Merges inherited properties from parent entity types

**Input:** `Subgraph` (from Graph API) + `VersionedUrl` (entity type ID)
**Output:** `DereferencedEntityType` - A flattened JSON schema with all properties inline

**Files:**

- `/activities/shared/dereference-entity-type.ts` (510 lines) - **Pure logic, no side effects**
- Uses: `@blockprotocol/graph/stdlib` for subgraph traversal utilities

**Can we import it?**

- ✅ **YES** - This is pure TypeScript logic, no external dependencies
- ✅ Can copy directly or import from `hash-ai-worker-ts` internals

**Can we mock it?**

- ✅ Not needed - This is pure logic that can be used as-is

---

### 3. **Entity Matching / Deduplication** - LLM-Based Logic (Can Port)

**Nature:** LLM-based matching logic with retry handling

**What it does:**

1. Takes a new entity proposal + array of potential matching entities
2. Sends to LLM with structured tool call: `reportExistingEntityFinding`
3. LLM decides if any potential match is the same entity
4. If match found, LLM can provide merged property values (e.g., combined descriptions)
5. Returns matched entity ID + merged properties, or `null` if no match
6. **Cautious strategy**: "Err on the side of caution" (prefers false negatives)

**Key Features:**

- Property metadata merging (combines provenance sources)
- Retry logic with error feedback (up to ~3 retries with sleep between)
- Uses `gpt-4o-2024-08-06` by default
- Detailed system prompt with examples (287 lines)

**Dependencies:**

- LLM API calls via `getLlmResponse()` (worker's LLM abstraction)
- Temporal workflow context via `getFlowContext()` (for user auth, step ID)
- Graph API client (for logging/provenance)

**Files:**

- `/activities/shared/match-existing-entity.ts` (665 lines)

**Can we import it?**

- ⚠️ **Partially** - Core logic is reusable, but has Temporal dependencies
- ✅ System prompt and matching logic can be extracted
- ❌ Uses `getFlowContext()` which is Temporal-specific

**Can we mock it?**

- ✅ Yes - Can extract system prompt and use Mastra's LLM tools directly
- ✅ Can replace `getFlowContext()` with Mastra context

---

### 4. **Temporal Context** - Workflow Orchestration (Replaced by Mastra)

**Nature:** Temporal-specific workflow context retrieval

**What it does:**

1. Accesses Temporal activity context: `Context.current()`
2. Retrieves workflow execution ID from activity info
3. Fetches workflow history from Temporal server via HTTP
4. Parses workflow started event to extract initial parameters
5. Caches parameters in-memory (10 min TTL, max 100 items)
6. Returns flow context: user auth, web ID, data sources, draft status, step ID

**Flow Context Structure:**

```typescript
{
  createEntitiesAsDraft: boolean,
  dataSources: { files: { fileEntityIds: EntityId[] } },
  flowEntityId: EntityId,
  stepId: string,
  userAuthentication: { actorId: UserId },
  webId: WebId
}
```

**Dependencies:**

- Temporal server connection
- Temporal client (`@temporalio/client`)
- Activity context (`@temporalio/activity`)
- Workflow history parsing

**Files:**

- `/activities/shared/get-flow-context.ts` (274 lines)

**Can we import it?**

- ❌ **NO** - This is Temporal-specific and won't work in Mastra

**Can we mock it?**

- ✅ **Not needed** - Mastra has built-in workflow context

**Mastra Replacement:**

```typescript
// In Mastra workflow
export const myWorkflow = createWorkflow({
  inputSchema: z.object({
    userAuth: z.object({ actorId: z.string() }),
    webId: z.string(),
    // ... other context
  })
})
  .then(async ({ context }) => {
    // context.inputData contains all workflow inputs
    const { userAuth, webId } = context.inputData
    // Pass to tools as needed
  })
```

---

## Summary Table: Import vs Mock vs Replace

| Dependency | Type | Can Import? | Can Mock? | Mastra Strategy |
|------------|------|-------------|-----------|-----------------|
| **Graph API** | Remote HTTP | ✅ Yes (client libs) | ✅ Yes (fixtures) | Phase 1: Mock with fixtures<br/>Phase 2+: Import real client |
| **Entity Type Resolution** | Pure logic | ✅ Yes (copy/import) | ✅ N/A (use as-is) | Import directly (copy file or import) |
| **Entity Matching** | LLM logic | ⚠️ Partial (Temporal deps) | ✅ Yes (extract logic) | Extract system prompt + port logic |
| **Temporal Context** | Workflow infra | ❌ No (Temporal-only) | ✅ N/A (Mastra has own) | Replace with Mastra context |

---

## Decisions Made

Based on discussion with the user, here are the confirmed policies:

### 1. **Graph API Integration**

- ✅ **Decision**: Start with fixture data (mock) for Phase 1
- ✅ **Rationale**: Allows quick iteration without Graph dependency
- ✅ **Quality**: Fixture data must be high-coverage and realistic
- ✅ **Future**: Import real Graph client in Phase 2+

### 2. **Entity Type Schemas**

- ✅ **Decision**: Port actual HASH entity type schemas
- ✅ **Source**: Copy from hash-ai-worker-ts (if TS logic or static data) or capture as fixtures
- ✅ **Approach**: Use `dereferenceEntityType` function (pure logic, can copy directly)

### 3. **Test Data**

- ✅ **Decision**: Port existing test data from hash-ai-worker-ts
- ✅ **Source**: `/activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.optimize/test-data.ts`
- ✅ **Requirements**:
  - Make data **stable** (no external URLs, capture as fixtures)
  - Make data **comprehensive** (challenging corner cases)
  - Show **measurable differences** in performance across approaches

### 4. **Evaluation Priority**

Based on examination of existing `.optimize.ai.test.ts` files, the hash-ai-worker-ts uses custom evaluation metrics with weighted scoring:

**Existing Evaluation Approach:**

- Custom `MetricDefinition[]` with `executeMetric` functions
- Metrics track:
  - **Gold entities** (must find these): Missing = penalty (weighted by importance)
  - **Irrelevant entities** (should ignore these): False positives = penalty
  - **Wrong-type entities** (correct name, wrong type): Type confusion = penalty
- Scoring formula: `score = 1.0 - (missing_penalty + irrelevant_penalty + wrong_type_penalty)`
- Reports include natural language summaries

**For Mastra (Phase 1)**:

- ✅ **Priority 1**: Entity Recall (completeness) - Did we find all the gold entities?
- ✅ **Priority 2**: Entity Precision (accuracy) - Did we avoid hallucinating irrelevant entities?
- ✅ **Priority 3**: Entity Type Accuracy - Did we assign correct entity types?
- Future: Property accuracy, claims accuracy, deduplication quality

### 5. **Model Selection**

- ✅ **Decision**: Use mid-range Google models via OpenRouter
- ✅ **Rationale**: Fast, good tool use, cost-effective
- ✅ **Default**: Google Gemini Flash 2.0 (user has this working already)
- ✅ **Embeddings**: Use unusual OpenRouter pattern (user has this working)
- ⚠️ **Note**: Existing hash-ai-worker-ts code uses `gpt-4o-2024-08-06` - we'll diverge for cost/speed

### 6. **Pure Logic Components**

- ✅ **Decision**: Copy TS logic directly (no mocking needed)
- ✅ **Examples**:
  - `dereferenceEntityType` (510 lines) - Copy into Mastra project
  - Entity matching system prompt (287 lines) - Extract and port

### 7. **LLM-Based Components**

- ✅ **Decision**: Extract to Mastra Agents/Tools
- ✅ **Approach**:
  - Extract system prompts
  - Port core logic (strip Temporal dependencies)
  - Use Mastra's LLM abstractions instead of custom `getLlmResponse()`

### 8. **Workflow Architecture**

- ✅ **Decision**: Work within Mastra's workflow system
- ✅ **Approach**: Use `.then()`, `.foreach()`, `.commit()` patterns
- ✅ **Context**: Replace Temporal context with Mastra workflow inputs

---

## Memory Mapping Analysis

### Mastra Memory Concept

Per Mastra docs, agents use **memory** to:

- Store conversation history across multi-turn interactions
- Maintain context within a conversation thread
- Recall user preferences or facts from earlier in a session
- Support working memory (recent context) or semantic recall (meaning-based retrieval)

### hash-ai-worker-ts Memory Analysis

**Finding: hash-ai-worker-ts does NOT have a direct memory equivalent.**

**What it has instead:**

1. **Message Arrays** (`LlmMessage[]`)
   - Each LLM call passes a `messages: LlmMessage[]` array
   - Messages are constructed per-call, not persisted across calls
   - Structure: `{ role: "user" | "assistant", content: [...] }`
   - Used for multi-turn tool use within a single activity execution

2. **LlamaIndex Storage Context** (Research Entities only)
   - File: `/activities/flow-activities/research-entities-action/link-follower-agent/llama-index/simple-storage-context.ts`
   - Purpose: Persist vector indexes and document stores to disk
   - Used by: Link-follower agent for RAG (Retrieval-Augmented Generation)
   - **Not for conversation history** - for document indexing

3. **Temporal Workflow Context**
   - File: `/activities/shared/get-flow-context.ts`
   - Purpose: Retrieve workflow parameters (user auth, data sources)
   - **Not for conversation history** - for workflow state

**Key Insight:**

hash-ai-worker-ts activities are **single-shot operations**:

- Each activity receives input → makes LLM call(s) → returns output
- No conversation history maintained between activity calls
- Multi-turn happens within a single activity (tool use loops)
- No long-term memory of past interactions

### Mastra Approach

**For NER/Entity Extraction (Phase 1):**

- ✅ **Skip memory initially** - Entity extraction is single-shot
- ✅ Each extraction is independent (text → entities)
- ✅ No need to recall previous extractions

**Future Considerations:**

If we later build conversational agents (e.g., research assistant):

- ✅ Use Mastra's memory for multi-turn conversations
- ✅ Store conversation history across user interactions
- ✅ Enable semantic recall for relevant past information

**Conclusion:** Memory is **NOT** a migration concern for Phase 1 NER work. It's a Mastra feature we'll leverage if/when we build conversational agents.

---

## Implementation Steps

### Phase 0: Documentation

1. **Copy this plan** to `/Users/lunelson/Code/hashintel/hash/apps/hash-ai-agent/docs/mastra-migration-plan.md`
   - Preserves migration context and architectural decisions
   - Reference for future development

### Phase 1: Foundation (First Tasks)

1. **Create entity type schemas** (`src/mastra/types/entities.ts`)
   - Port `LocalEntitySummary`, `Claim`, `ProposedEntity` types
   - Create Zod schemas for validation

2. **Port test data** from hash-ai-worker-ts
   - Source: `/activities/flow-activities/shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.optimize/test-data.ts`
   - Destination: `src/mastra/evals/test-data/ner-test-cases.ts`
   - Ensure data is stable (no external URLs)

3. **Copy entity type dereferencing** (`src/mastra/shared/dereference-entity-type.ts`)
   - Pure TS logic from hash-ai-worker-ts
   - No modifications needed

4. **Create baseline extraction agent** (`src/mastra/agents/entity-summary-agent.ts`)
   - Single-pass entity extraction as baseline
   - Port system prompt from hash-ai-worker-ts

5. **Create entity recall scorer** (`src/mastra/scorers/entity-recall.ts`)
   - Port evaluation logic from `.optimize.ai.test.ts` files
   - Measure: gold entities found vs. missed

6. **Run first evaluation** to establish baseline metrics
