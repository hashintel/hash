# Task Decomposition & Planning Framework — Implementation Plan

## Document Info

- **Created**: 2024-12-16
- **Updated**: 2024-12-17
- **Status**: Implementation Phase — Core infrastructure complete, E2E validation next
- **Location**: `apps/hash-ai-agent/docs/PLAN-task-decomposition.md`

---

## 1. Overview

### 1.1 Goal

Build a framework for decomposing complex research & development goals into structured, executable plans using LLM-based planning agents. The primary focus is on **plan quality evaluation** — validating and scoring generated plans before any execution occurs.

### 1.2 Key Insight

Treat LLM planning as a "compiler front-end" that produces an **Intermediate Representation (IR)** — the `PlanSpec` — which can be validated, scored, and eventually compiled/interpreted into executable workflows.

### 1.3 Approach: MVP First

Based on reviewer feedback, we adopt an MVP-first approach:

- **Start with 4 step types** (not 7) to reduce schema complexity for LLM structured output
- **Defer decision points** until basic flow works
- **Focus on plan quality scoring** — stub execution has limited ROI
- **Get end-to-end flow working** before adding complexity

### 1.4 Domain Focus

Technical/mathematical research goals that flow through to development, including:

- Research phases (parallelizable)
- Hypothesis generation and testing
- Experimentation (with uncertain outcomes)
- Synthesis and evaluation
- Development and implementation

---

## 2. Architecture

### 2.1 Three-Level Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 3: SUPERVISOR (future scope)                                         │
│  • Monitors overall progress against original goal                          │
│  • Can trigger re-planning if things go off-track                          │
│  • Same role as "Reviewer" — gates plan approval                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 2: PLAN DESIGNER + REVIEWER  ◀── CURRENT FOCUS                       │
│  • Designer: Decomposes goal → PlanSpec (IR)                               │
│  • Validator: Structural checks (deterministic)                            │
│  • Supervisor: Approves/rejects plan (LLM judge)                           │
│  • Loop: Design → Validate → Review → Revise (until approved)              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 1: STEP EXECUTION (deferred — low priority)                          │
│  • Interpreted execution: dountil loop with step function                  │
│  • Stub executors: template-based mock outputs                             │
│  • Proves control flow (parallel, branching, etc.) works                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Planning Workflow

```
Goal + Context
      │
      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Planner    │ ──▶ │  Validator   │ ──▶ │  Supervisor  │
│   Agent      │     │ (structural) │     │  (approval)  │
└──────────────┘     └──────────────┘     └──────────────┘
      │                    │                    │
      │                    │                    ▼
      │                    │              Approved? ──▶ Output PlanSpec
      │                    │                    │
      │                    ◀────────────────────┘
      │                         (feedback)
      ◀─────────────────────────────┘
            (revision loop, max 3 attempts)
```

### 2.3 Execution Model (Interpreted) — Future

Rather than compiling PlanSpec to static Mastra workflows, we use an **interpreter pattern**:

```typescript
createWorkflow(...)
  .then(initializeExecutionStateStep)
  .dountil(
    interpreterStep,  // Reads state, picks next action, executes, updates state
    async ({ inputData }) => inputData.allStepsComplete || inputData.iterations > 50
  )
  .then(finalizeExecutionStep)
  .commit();
```

This enables bounded dynamism — the loop structure is static, but the step function can make runtime decisions based on plan topology and execution state.

**Note**: Stub execution is deferred and low priority. The real value is in plan quality scoring, not proving control flow with mocks.

---

## 3. Step Type Taxonomy

### 3.1 MVP Step Types (v1)

| Type         | Category  | Description                                  | Parallelizable |
| ------------ | --------- | -------------------------------------------- | -------------- |
| `research`   | Strategic | Gather existing knowledge                    | Yes            |
| `synthesize` | Strategic | Combine results OR evaluate against criteria | No             |
| `experiment` | Tactical  | Test hypothesis empirically                  | Yes            |
| `develop`    | Tactical  | Build/implement something                    | Sometimes      |

### 3.2 Future Step Types

| Type          | Category  | Description                                | Notes                          |
| ------------- | --------- | ------------------------------------------ | ------------------------------ |
| `hypothesize` | Strategic | Generate testable hypotheses from findings | Currently implicit in workflow |
| `transform`   | Tactical  | Pure data manipulation                     | Can be done via `develop`      |

### 3.3 Subsumed Types

- **`assess`**: Subsumed by `synthesize` with `mode: 'evaluative'`

### 3.4 Synthesis Modes

```typescript
type SynthesisMode = 'integrative' | 'evaluative';
// integrative: Combine findings from multiple sources
// evaluative: Judge results against criteria (subsumes old "assess")
```

### 3.5 Experiment Modes

```typescript
type ExperimentMode = 'exploratory' | 'confirmatory';
// exploratory: Hypothesis generation, flexible analysis, discovering patterns
// confirmatory: Preregistered design, locked analysis plan, testing specific predictions
```

**Key distinction**: Confirmatory experiments require `preregisteredCommitments` — decisions locked before seeing outcomes. This reduces "researcher degrees of freedom" and makes results more credible.

---

## 4. PlanSpec Schema (IR)

### 4.1 MVP Schema (v1)

```typescript
// schemas/plan-spec.ts

import { z } from "zod";

// === AIM TYPE (optional enrichment) ===
// Not mutually exclusive, so weak signal for inference
// Include for now, evaluate usefulness later
const zAimType = z.enum(["describe", "explain", "predict", "intervene"]);

// === REQUIREMENTS ===
const zRequirement = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.enum(["must", "should", "could"]),
});

// === HYPOTHESES ===
// Hypotheses are first-class citizens, not buried in experiment descriptions
const zHypothesis = z.object({
  id: z.string(),
  statement: z.string(),
  assumptions: z.array(z.string()),
  testableVia: z.string(),
  status: z
    .enum(["untested", "testing", "supported", "refuted", "inconclusive"])
    .default("untested"),
});

// === UNKNOWNS MAP (epistemically rigorous) ===
// Partition based on scientific uncertainty principles
const zUnknownsMap = z.object({
  // High-confidence facts we're building on
  knownKnowns: z.array(z.string()),
  
  // Explicit questions we know we need to answer
  knownUnknowns: z.array(z.string()),
  
  // What would surprise us + how we'd detect it
  unknownUnknowns: z.array(
    z.object({
      potentialSurprise: z.string(),
      detectionSignal: z.string(), // "How would we notice?"
    })
  ),
  
  // What others would need to see to scrutinize our claims
  // (Science depends on communal scrutiny, not private conviction)
  communityCheck: z.string(),
});

// === DATA CONTRACTS ===
const zDataContract = z.object({
  name: z.string(),
  description: z.string(),
  fromStepId: z.string().optional(),
});

// === EVALUATION CRITERIA ===
const zEvalCriteria = z.object({
  successCondition: z.string(),
  failureCondition: z.string().optional(),
});

// === EXECUTOR BINDING ===
const zExecutor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), ref: z.string() }),
  z.object({ kind: z.literal("tool"), ref: z.string() }),
  z.object({ kind: z.literal("workflow"), ref: z.string() }),
  z.object({ kind: z.literal("human") }),
]);

// === BASE STEP ===
const zBaseStep = z.object({
  id: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()),
  requirementIds: z.array(z.string()),
  inputs: z.array(zDataContract),
  outputs: z.array(zDataContract),
  evalCriteria: zEvalCriteria.optional(),
  executor: zExecutor,
});

// === RESEARCH STEP ===
const zResearchStep = zBaseStep.extend({
  type: z.literal("research"),
  query: z.string(),
  stoppingRule: z.string(), // What "done" means for this research
  parallelizable: z.literal(true).default(true),
});

// === SYNTHESIZE STEP ===
// Subsumes old "assess" type via evaluative mode
const zSynthesizeStep = zBaseStep.extend({
  type: z.literal("synthesize"),
  mode: z.enum(["integrative", "evaluative"]),
  inputStepIds: z.array(z.string()),
  // Required if mode === 'evaluative'
  evaluateAgainst: z.array(z.string()).optional(),
  parallelizable: z.literal(false).default(false),
});

// === EXPERIMENT STEP ===
const zExperimentStep = zBaseStep.extend({
  type: z.literal("experiment"),
  mode: z.enum(["exploratory", "confirmatory"]),
  hypothesisIds: z.array(z.string()),
  procedure: z.string(),
  expectedOutcomes: z.array(z.string()),
  successCriteria: z.array(z.string()),
  // Required if mode === 'confirmatory'
  // Decisions locked before seeing outcomes
  preregisteredCommitments: z.array(z.string()).optional(),
  parallelizable: z.literal(true).default(true),
});

// === DEVELOP STEP ===
const zDevelopStep = zBaseStep.extend({
  type: z.literal("develop"),
  specification: z.string(),
  deliverables: z.array(z.string()),
  parallelizable: z.boolean().default(false),
});

// === PLAN STEP (discriminated union) ===
const zPlanStep = z.discriminatedUnion("type", [
  zResearchStep,
  zSynthesizeStep,
  zExperimentStep,
  zDevelopStep,
]);

// === MVP PLAN SPEC ===
export const zPlanSpec = z.object({
  id: z.string(),
  goalSummary: z.string(),
  
  // Optional enrichment — not mutually exclusive categories
  aimType: zAimType.optional(),
  
  requirements: z.array(zRequirement),
  hypotheses: z.array(zHypothesis),
  steps: z.array(zPlanStep),
  unknownsMap: zUnknownsMap,
  
  // No decision points in MVP
  
  estimatedComplexity: z
    .enum(["low", "medium", "high", "very-high"])
    .optional(),
});

export type PlanSpec = z.infer<typeof zPlanSpec>;
export type PlanStep = z.infer<typeof zPlanStep>;
export type Requirement = z.infer<typeof zRequirement>;
export type Hypothesis = z.infer<typeof zHypothesis>;
export type UnknownsMap = z.infer<typeof zUnknownsMap>;
```

### 4.2 Full Schema Additions (Future)

The following would extend the MVP schema in future iterations:

#### Additional Step Types

```typescript
// Hypothesize step — currently implicit in workflow
const zHypothesizeStep = zBaseStep.extend({
  type: z.literal("hypothesize"),
  basedOn: z.array(z.string()),      // Step IDs that inform hypothesis
  targetUnknowns: z.array(z.string()), // Which unknowns this addresses
});

// Transform step — pure data manipulation
const zTransformStep = zBaseStep.extend({
  type: z.literal("transform"),
  transformation: z.string(),
});
```

#### Decision Points

```typescript
const zDecisionType = z.discriminatedUnion("type", [
  // Static branching based on conditions
  z.object({
    type: z.literal("branch"),
    conditions: z.array(z.object({
      condition: z.string(),
      thenStepId: z.string(),
    })),
    defaultStepId: z.string().optional(),
  }),
  
  // LLM supervisor makes decision at runtime
  z.object({
    type: z.literal("supervisor-decision"),
    question: z.string(),
    possibleActions: z.array(z.object({
      id: z.string(),
      description: z.string(),
      enablesStepIds: z.array(z.string()).optional(),
      disablesStepIds: z.array(z.string()).optional(),
      triggersReplanning: z.boolean().optional(),
    })),
  }),
  
  // Human-in-the-loop decision
  z.object({
    type: z.literal("human-decision"),
    question: z.string(),
    options: z.array(z.string()),
    timeout: z.string().optional(),
  }),
]);

const zDecisionPoint = z.object({
  id: z.string(),
  afterStepId: z.string(),
  question: z.string(),
  decisionType: zDecisionType,
});
```

#### Enriched Experiment Design

For rigorous scientific experiments (especially confirmatory):

```typescript
const zEnrichedExperimentStep = zExperimentStep.extend({
  // Nuisance factors — variables that affect outcomes but aren't targets
  nuisanceFactors: z.array(z.string()),
  
  // "Block what you can, randomize what you cannot"
  blockingPlan: z.string().optional(),      // For controllable nuisance factors
  randomizationPlan: z.string().optional(), // For what remains
  
  // Replication intent
  replicationPlan: z.object({
    unitOfReplication: z.string(),
    sampleSizeRationale: z.string().optional(),
  }).optional(),
  
  // Known threats to validity
  threats: z.array(z.string()), // Confounds, leakage, missing data, drift
  
  // Statistical approach
  analysisPlan: z.string(),
  primaryMetric: z.string(),
});
```

#### Phase Concept

Explicit phase labels to validate step ordering:

```typescript
const zPhase = z.enum([
  "exploration",        // Research steps dominate
  "hypothesis-formation", // Hypothesize + early synthesize
  "experimentation",    // Experiment + assess cycles
  "development",        // Develop + transform steps
  "synthesis",          // Final synthesize steps
]);

// Add to base step:
// phase: zPhase.optional(),
```

#### Compound Steps (Patterns)

Encapsulated recurring patterns:

```typescript
const zCompoundStep = z.discriminatedUnion("pattern", [
  z.object({
    pattern: z.literal("parallel-research-synthesize"),
    researchQueries: z.array(z.string()),
    synthesisMode: z.enum(["integrative", "evaluative"]),
  }),
  z.object({
    pattern: z.literal("experiment-assess-decide"),
    hypothesisId: z.string(),
    maxIterations: z.number(),
  }),
]);
```

---

## 5. Available Agents

### 5.1 Capability Profiles

Structured profiles help the planner reason about executor assignment:

```typescript
// constants.ts

export const AVAILABLE_AGENTS = {
  // Research & Discovery
  "literature-searcher": {
    description: "Searches academic papers and technical documentation",
    canHandle: ["research"],
    inputs: ["query", "sources?"],
    outputs: ["papers", "summaries"],
  },
  "paper-summarizer": {
    description: "Reads and summarizes academic papers",
    canHandle: ["research"],
    inputs: ["paper"],
    outputs: ["summary", "keyFindings"],
  },
  "concept-explainer": {
    description: "Explains technical concepts at varying depths",
    canHandle: ["research", "synthesize"],
    inputs: ["concept", "targetAudience?"],
    outputs: ["explanation"],
  },

  // Analysis & Synthesis
  "result-synthesizer": {
    description: "Combines findings from multiple sources",
    canHandle: ["synthesize"],
    inputs: ["findings[]"],
    outputs: ["synthesis", "comparison?"],
  },
  "hypothesis-generator": {
    description: "Generates testable hypotheses from findings",
    canHandle: ["synthesize"], // integrative mode leading to hypotheses
    inputs: ["findings", "constraints"],
    outputs: ["hypotheses"],
  },
  "progress-evaluator": {
    description: "Assesses current state against goals and criteria",
    canHandle: ["synthesize"], // evaluative mode
    inputs: ["results", "criteria"],
    outputs: ["assessment", "gaps", "recommendations"],
  },

  // Experimentation
  "experiment-designer": {
    description: "Designs experimental procedures with controls",
    canHandle: ["experiment"],
    inputs: ["hypothesis", "constraints"],
    outputs: ["experimentDesign", "protocol"],
  },

  // Implementation
  "code-explorer": {
    description: "Navigates and explains existing codebases",
    canHandle: ["research"],
    inputs: ["codebase", "query"],
    outputs: ["explanation", "relevantFiles"],
  },
  "code-writer": {
    description: "Implements algorithms and prototypes",
    canHandle: ["develop", "experiment"],
    inputs: ["spec", "context"],
    outputs: ["code", "tests?"],
  },
  "code-reviewer": {
    description: "Reviews code for correctness and quality",
    canHandle: ["synthesize"], // evaluative mode
    inputs: ["code", "criteria"],
    outputs: ["review", "issues"],
  },
} as const;

export type AgentRef = keyof typeof AVAILABLE_AGENTS;
```

---

## 6. File Structure

```
apps/hash-ai-agent/src/mastra/
├── schemas/
│   └── plan-spec.ts                    # PlanSpec IR schema (Zod) — MVP
│
├── agents/
│   ├── planner-agent.ts                # Goal → PlanSpec (structured output)
│   └── supervisor-agent.ts             # Plan review/approval
│
├── workflows/
│   ├── planning-workflow.ts            # Plan → Validate → Approve loop
│   └── stub-execution-workflow.ts      # Interpreted execution (deferred)
│
├── steps/
│   ├── extract-requirements-step.ts    # Goal → Requirements list
│   ├── generate-plan-step.ts           # Requirements → PlanSpec
│   ├── validate-plan-step.ts           # Structural validation
│   ├── supervisor-review-step.ts       # LLM approval gate
│   └── execution/                      # (deferred)
│       ├── interpreter-step.ts
│       └── stub-executors.ts
│
├── scorers/
│   ├── plan-structure-scorer.ts        # DAG validity, refs exist (deterministic)
│   ├── plan-coverage-scorer.ts         # Requirements mapped to steps (deterministic)
│   ├── plan-testability-scorer.ts      # Hypotheses can be tested (LLM)
│   ├── plan-granularity-scorer.ts      # Steps appropriately scoped (LLM)
│   ├── experiment-rigor-scorer.ts      # Confirmatory has preregistration (deterministic)
│   └── unknowns-coverage-scorer.ts     # All unknown categories populated (deterministic)
│
├── tools/
│   ├── plan-validator.ts               # Deterministic structural checks
│   └── topology-analyzer.ts            # Find parallel groups, critical path
│
├── fixtures/
│   └── decomposition-prompts/
│       ├── index.ts                    # Exports all fixtures
│       │
│       │ # Positive fixtures (ordered by complexity)
│       ├── summarize-papers.ts         # Linear, no experiments
│       ├── explore-and-recommend.ts    # Parallel research → synthesize
│       ├── hypothesis-validation.ts    # Research → experiment → synthesize
│       ├── ct-database-goal.ts         # Full complexity (aspirational)
│       │
│       │ # Negative fixtures (validation tests)
│       ├── invalid-cycle.ts            # Steps form a cycle
│       ├── invalid-missing-ref.ts      # dependsOn references non-existent step
│       ├── invalid-orphan-experiment.ts # Experiment without hypothesis
│       └── invalid-empty-plan.ts       # Goal with no steps
│
└── constants.ts                        # Available agents, models, etc.
```

---

## 7. Implementation Phases

### Phase 1: Schema & Validation

1. **`schemas/plan-spec.ts`** — MVP PlanSpec schema with 4 step types
2. **`constants.ts`** — Available agents with capability profiles
3. **`tools/plan-validator.ts`** — Deterministic structural checks:
   - All `dependsOn` refs exist
   - All `executor.ref` values in allowlist
   - DAG is acyclic
   - All `hypothesisIds` exist
   - All `requirementIds` exist
   - Confirmatory experiments have `preregisteredCommitments`
   - Evaluative synthesize steps have `evaluateAgainst`
4. **`tools/topology-analyzer.ts`** — Analyze plan structure:
   - Identify parallelizable step groups
   - Compute critical path
   - Detect bottlenecks

### Phase 2: Fixtures

1. **Positive fixtures** (ordered by complexity):
   - `summarize-papers.ts` — Linear flow, no experiments
   - `explore-and-recommend.ts` — Parallel research → synthesize
   - `hypothesis-validation.ts` — Research → experiment → evaluative synthesize
   - `ct-database-goal.ts` — Full R&D cycle (aspirational target)

2. **Negative fixtures** (validation tests):
   - `invalid-cycle.ts` — Steps that form a cycle
   - `invalid-missing-ref.ts` — dependsOn references non-existent step
   - `invalid-orphan-experiment.ts` — Experiment without hypothesis reference
   - `invalid-empty-plan.ts` — Goal with no steps

### Phase 3: Planner Agent

1. **`agents/planner-agent.ts`** — Core planning agent:
   - Instructions explaining step types, agents, patterns
   - Structured output with `zPlanSpec`
   - Available agents with capability profiles in system prompt
   - See Section 15 for prompt strategy details

### Phase 4: Scorers

1. **Deterministic scorers**:
   - `plan-structure-scorer.ts` — DAG valid, refs exist, no orphans
   - `plan-coverage-scorer.ts` — All requirements addressed
   - `experiment-rigor-scorer.ts` — Confirmatory experiments have preregistration
   - `unknowns-coverage-scorer.ts` — All unknown categories populated

2. **LLM judge scorers**:
   - `plan-testability-scorer.ts` — Hypotheses can actually be tested
   - `plan-granularity-scorer.ts` — Steps appropriately scoped

### Phase 5: Planning Workflow

1. **`steps/extract-requirements-step.ts`**
2. **`steps/generate-plan-step.ts`**
3. **`steps/validate-plan-step.ts`**
4. **`steps/supervisor-review-step.ts`**
5. **`agents/supervisor-agent.ts`**
6. **`workflows/planning-workflow.ts`**

### Phase 6: Stub Execution (Deferred — Low Priority)

**Note**: Per reviewer feedback, stub execution has limited ROI. The real value is in plan quality scoring, not proving control flow with mocks. Implement only if needed.

1. **`steps/execution/stub-executors.ts`** — Template-based mocks
2. **`steps/execution/interpreter-step.ts`** — Core loop body
3. **`workflows/stub-execution-workflow.ts`** — Interpreted execution

---

## 8. Key Design Decisions

| Decision          | Choice                           | Rationale                                             |
| ----------------- | -------------------------------- | ----------------------------------------------------- |
| Schema complexity | MVP-first (4 step types)         | LLMs struggle with deeply nested discriminated unions |
| Execution mode    | Interpreted (deferred)           | Supports dynamism, but plan quality is primary focus  |
| Stub executors    | Low priority                     | Plan quality scoring is the real signal               |
| Plan evaluation   | LLM judge + structural           | No single "correct" decomposition                     |
| Hypotheses        | Explicit top-level + referenced  | Makes scientific structure visible                    |
| Unknowns          | Epistemically rigorous partition | Surfaces uncertainty rather than hiding it            |
| Experiment modes  | Exploratory vs confirmatory      | Reduces researcher degrees of freedom                 |
| Synthesis modes   | Integrative vs evaluative        | Subsumes "assess" step type                           |
| Decision points   | Deferred to v2                   | Simplifies MVP                                        |

---

## 9. Execution State Shape (Future)

```typescript
interface ExecutionState {
  plan: PlanSpec;
  completedStepIds: string[];
  pendingStepIds: string[];
  stepResults: Record<string, unknown>;
  hypothesisStatuses: Record<string, HypothesisStatus>;
  currentPhase: "research" | "experiment" | "synthesize" | "develop";
  iterations: number;
  decisionLog: Array<{ stepId: string; decision: string; reason: string }>;
}
```

---

## 10. Evaluation Strategy

### 10.1 Deterministic Scorers

| Scorer              | Measures                                                        |
| ------------------- | --------------------------------------------------------------- |
| `plan-structure`    | DAG valid, refs exist, no orphans                               |
| `plan-coverage`     | All requirements addressed by steps                             |
| `experiment-rigor`  | Confirmatory experiments have preregistration                   |
| `unknowns-coverage` | All three unknown categories populated, community check present |

### 10.2 LLM Judge Scorers

| Scorer              | Measures                                                   |
| ------------------- | ---------------------------------------------------------- |
| `plan-testability`  | Hypotheses can actually be tested                          |
| `plan-granularity`  | Steps appropriately scoped (not too broad, not too narrow) |
| `plan-coherence`    | Steps make sense together                                  |
| `plan-completeness` | No obvious gaps for the goal                               |

### 10.3 Phase 1 Approach

Manual inspection initially — no automated threshold assertions. As we gather data on plan quality, we can establish baselines and add automated checks.

---

## 11. Test Fixtures

### 11.1 Positive Fixtures

#### Simple Linear: Summarize Papers

```typescript
export const summarizePapersGoal = {
  id: "summarize-papers",
  goal: `Summarize 3 recent papers on retrieval-augmented generation (RAG) 
         and produce a comparison table of their approaches.`,
  context: `We need to understand the current landscape of RAG techniques 
            for an internal tech review.`,
  expectedCharacteristics: {
    shouldHaveHypotheses: false,
    shouldHaveExperiments: false,
    shouldHaveParallelResearch: true,
    minSteps: 3,
    maxSteps: 6,
    expectedStepTypes: ["research", "synthesize"],
  },
};
```

#### Parallel Research: Explore and Recommend

```typescript
export const exploreAndRecommendGoal = {
  id: "explore-and-recommend",
  goal: `Research approaches to vector database indexing and recommend 
         the best approach for our use case (10M documents, low latency).`,
  context: `We're evaluating vector databases for a semantic search feature.
            Need to understand tradeoffs between HNSW, IVF, and other approaches.`,
  expectedCharacteristics: {
    shouldHaveHypotheses: false,
    shouldHaveExperiments: false,
    shouldHaveParallelResearch: true,
    minSteps: 4,
    expectedStepTypes: ["research", "synthesize"],
    shouldHaveEvaluativeSynthesize: true,
  },
};
```

#### Hypothesis Validation

```typescript
export const hypothesisValidationGoal = {
  id: "hypothesis-validation",
  goal: `Test whether fine-tuning a small LLM on domain-specific data 
         outperforms few-shot prompting with a larger model for our 
         entity extraction task.`,
  context: `We have 5000 labeled examples. Need to determine the most 
            cost-effective approach for production deployment.`,
  expectedCharacteristics: {
    shouldHaveHypotheses: true,
    shouldHaveExperiments: true,
    shouldHaveParallelResearch: false,
    minSteps: 5,
    expectedStepTypes: ["research", "experiment", "synthesize"],
    shouldHaveConfirmatoryExperiment: true,
  },
};
```

#### Full Complexity: CT Database

```typescript
export const ctDatabaseGoal = {
  id: "ct-database",
  goal: `Create a backend language and database that is natively aligned with 
         category-theoretical expressions. This should support objects, morphisms, 
         functors, and natural transformations as first-class concepts, with 
         query performance competitive with traditional databases.`,
  context: `We're exploring whether CT primitives can serve as a more natural 
            foundation for data modeling than relational or document models. 
            Key unknowns include performance characteristics and expressiveness 
            tradeoffs.`,
  expectedCharacteristics: {
    shouldHaveHypotheses: true,
    shouldHaveExperiments: true,
    shouldHaveParallelResearch: true,
    minSteps: 8,
    expectedStepTypes: ["research", "experiment", "synthesize", "develop"],
    shouldSurfaceUnknowns: true,
  },
};
```

### 11.2 Negative Fixtures

```typescript
// invalid-cycle.ts — Steps form a dependency cycle
export const invalidCycleFixture = {
  steps: [
    { id: "step-1", dependsOn: ["step-3"] },
    { id: "step-2", dependsOn: ["step-1"] },
    { id: "step-3", dependsOn: ["step-2"] }, // Cycle!
  ],
  expectedError: "CYCLE_DETECTED",
};

// invalid-missing-ref.ts — Reference to non-existent step
export const invalidMissingRefFixture = {
  steps: [
    { id: "step-1", dependsOn: ["step-999"] }, // Doesn't exist!
  ],
  expectedError: "INVALID_STEP_REFERENCE",
};

// invalid-orphan-experiment.ts — Experiment without hypothesis
export const invalidOrphanExperimentFixture = {
  hypotheses: [],
  steps: [
    { type: "experiment", hypothesisIds: ["h1"] }, // h1 doesn't exist!
  ],
  expectedError: "INVALID_HYPOTHESIS_REFERENCE",
};

// invalid-empty-plan.ts — Goal with no steps
export const invalidEmptyPlanFixture = {
  goalSummary: "Do something important",
  steps: [],
  expectedError: "EMPTY_PLAN",
};
```

---

## 12. Open Questions / Future Work

1. **Full dynamism**: The "workflow within workflow" pattern where the step function can modify state to effectively inject new steps. Would need to hook into Mastra's event streaming.

2. **Runtime supervisor decisions**: Currently supervisor only validates pre-kickoff. Future: supervisor makes decisions during interpreted execution.

3. **Human-in-the-loop**: Decision points with `type: "human-decision"` would use Mastra's suspend/resume.

4. **Real executors**: Replace stubs with actual agent implementations.

5. **Plan caching/versioning**: Store plans for comparison, track how plans evolve.

6. **Phased generation**: If single-shot plan generation struggles with complex goals, try multi-phase approach:
   - Phase A: Extract requirements → `Requirement[]`
   - Phase B: Generate steps given requirements → `Step[]`
   - Phase C: Assemble into full `PlanSpec`
   - Tradeoff: More LLM calls, but simpler output schemas per call.

7. **Hybrid compiled/interpreted execution**: Compile "stable" portions of the plan to static Mastra workflow shapes, use interpreter only for portions with decision points or uncertain outcomes.

---

## 13. Revision Loop Configuration

When revision is needed, configurable via workflow input:

```typescript
inputSchema: z.object({
  goal: z.string(),
  context: z.string().optional(),
  revisionStrategy: z
    .enum(["all-feedback", "latest-only"])
    .default("all-feedback"),
  maxRevisionAttempts: z.number().default(3),
});
```

---

## 14. Design Rationale (from Reviews)

Key insights from review feedback that shaped this design:

### Why MVP-First

LLMs struggle with deeply nested discriminated unions in structured output. Starting with 4 step types (not 7) and deferring decision points reduces schema complexity and improves generation reliability.

### Why Interpreted Execution is Deferred

The real value is in plan quality scoring, not proving control flow. Stub execution has limited ROI — it proves the interpreter works but doesn't validate whether the plan makes sense.

### Why Epistemically Rigorous Unknowns

The `knownKnowns / knownUnknowns / unknownUnknowns` partition forces the planner to surface uncertainty rather than hallucinate confidence. The `communityCheck` field ensures plans include what others would need to scrutinize claims.

### Why Confirmatory/Exploratory Split

This distinction from scientific methodology reduces "researcher degrees of freedom." Confirmatory experiments with preregistered commitments are more credible because decisions are locked before seeing outcomes.

### Why Separate Validation from Scoring

Validation is deterministic (DAG acyclic, refs exist). Scoring is evaluative (plan coherence, granularity). Separating them enables fast-fail on structural issues before expensive LLM evaluation.

---

## 15. Planner Prompt Strategy

### 15.1 Input Injection

| Element            | Location                     | Rationale                                |
| ------------------ | ---------------------------- | ---------------------------------------- |
| Goal               | User message                 | Primary input, should be prominent       |
| Context            | User message (after goal)    | Supplements goal                         |
| Available agents   | System prompt                | Static context the planner reasons about |
| Constraints        | User message (after context) | Goal-specific constraints                |
| Schema description | System prompt                | Defines output structure                 |

### 15.2 Agent Presentation

Available agents should be presented with capability profiles:

```
Available executors for your plan:

RESEARCH:
- literature-searcher: Searches academic papers. Inputs: query, sources?. Outputs: papers, summaries.
- paper-summarizer: Summarizes papers. Inputs: paper. Outputs: summary, keyFindings.

SYNTHESIZE:
- result-synthesizer: Combines findings. Inputs: findings[]. Outputs: synthesis.
- progress-evaluator: Assesses against criteria. Inputs: results, criteria. Outputs: assessment, gaps.

EXPERIMENT:
- experiment-designer: Designs procedures with controls. Inputs: hypothesis, constraints. Outputs: design, protocol.

DEVELOP:
- code-writer: Implements algorithms. Inputs: spec, context. Outputs: code, tests?.
```

### 15.3 Few-Shot Examples

None initially. Add if quality issues emerge. When added, use simple examples that demonstrate:

- Correct step type usage
- Proper dependency structure
- Hypothesis → experiment linking
- Unknowns map population

### 15.4 Phased Generation (Alternative)

If single-shot struggles, try:

1. **Extract requirements**: Goal → `Requirement[]` (simple array output)
2. **Generate steps**: Requirements → `Step[]` (array of steps, no full plan)
3. **Populate unknowns**: Goal + Steps → `UnknownsMap`
4. **Assemble**: Combine into full `PlanSpec`

Each phase has a simpler output schema, improving reliability at the cost of more LLM calls.

---

## 16. Meta-Cognitive Templates

See `docs/PROMPTS-meta-cognitive.md` for research-planning and experiment-design prompt templates that encode rigorous scientific reasoning patterns. These may be incorporated as "sub-modes" invoked during planning.

---

## 17. Implementation Status

### Completed (Phase 1-4)

| Component                 | File                              | Status     | Tests    |
| ------------------------- | --------------------------------- | ---------- | -------- |
| PlanSpec schema           | `schemas/plan-spec.ts`            | ✅ Complete | —        |
| Agent profiles            | `constants.ts`                    | ✅ Complete | —        |
| Plan validator            | `tools/plan-validator.ts`         | ✅ Complete | 25 tests |
| Topology analyzer         | `tools/topology-analyzer.ts`      | ✅ Complete | —        |
| Planner agent             | `agents/planner-agent.ts`         | ✅ Complete | —        |
| Positive fixtures (4)     | `fixtures/decomposition-prompts/` | ✅ Complete | —        |
| Negative fixtures         | `tools/plan-validator.test.ts`    | ✅ Complete | 25 tests |
| Deterministic scorers (4) | `scorers/plan-scorers.ts`         | ✅ Complete | 23 tests |
| LLM judge scorers (3)     | `scorers/plan-llm-scorers.ts`     | ✅ Complete | 6 tests  |

### Not Yet Implemented

| Component                | File                                  | Status        | Notes                                  |
| ------------------------ | ------------------------------------- | ------------- | -------------------------------------- |
| Planning workflow loop   | `workflows/planning-workflow.ts`      | ⚠️ Stub only   | No `.dountil()` revision logic         |
| Supervisor agent         | `agents/supervisor-agent.ts`          | ❌ Not started | LLM approval gate                      |
| End-to-end tests         | `workflows/planning-workflow.test.ts` | ⚠️ Partial     | Uses hand-crafted plans, not generated |
| Stub execution (Level 1) | —                                     | ❌ Not started | Low priority                           |

---

## 18. Next Steps

### Phase 5A: End-to-End Validation Test

Before implementing the full workflow loop, validate that `generatePlan()` works reliably with the full schema:

1. **Create E2E test** (`workflows/planning-workflow.test.ts`):
   - Call `generatePlan()` with each of the 4 fixtures
   - Run `validatePlan()` on the output
   - Run deterministic scorers on valid plans
   - Optionally run LLM scorers (controlled by config flag)
   - Log results for manual inspection

2. **Config flag for LLM scorers**:

   ```typescript
   const RUN_LLM_SCORERS = process.env.RUN_LLM_SCORERS === "true";
   ```

   This allows quick iteration with deterministic scorers only, then full scoring when needed.

3. **Expected outcomes**:
   - Identify schema-vs-LLM-output mismatches
   - Surface any structured output reliability issues
   - May incidentally fix the ct-database-goal preregistration issue

### Phase 5B: Planning Workflow with Revision Loop

Once E2E validation passes reliably:

1. **Implement `agents/supervisor-agent.ts`**:
   - Reviews generated plans against goal
   - Returns approval/rejection with feedback
   - Structured output: `{ approved: boolean, feedback?: string, issues?: string[] }`

2. **Implement full `workflows/planning-workflow.ts`**:
   - `extractRequirementsStep` → `generatePlanStep` → `validatePlanStep` → `supervisorReviewStep`
   - `.dountil()` loop with max 3 revision attempts
   - Pass feedback to planner on rejection

3. **End-to-end workflow tests**:
   - Test full loop with fixtures
   - Verify revision improves plan quality
   - Test max-attempts bailout

### Phase 6: Stub Execution (Deferred)

Low priority. Only implement if needed to prove control flow patterns.

---

## 19. Test Conventions

- **Colocated tests**: Tests live alongside source files (e.g., `plan-validator.test.ts`)
- **Standard vitest naming**: Use `.test.ts` suffix (not `.ai.test.ts`)
- **LLM scorer toggle**: Use `RUN_LLM_SCORERS` env var to control expensive LLM evaluation
- **Timeouts**: LLM-calling tests should set appropriate timeouts (60-180s)

---

_End of Plan Document_
