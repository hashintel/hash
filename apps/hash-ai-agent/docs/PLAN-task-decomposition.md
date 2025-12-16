# Task Decomposition & Planning Framework — Implementation Plan

## Document Info

- **Created**: 2024-12-16
- **Status**: Planning Phase
- **Location**: `apps/hash-ai-agent/docs/PLAN-task-decomposition.md`

---

## 1. Overview

### 1.1 Goal

Build a framework for decomposing complex research & development goals into structured, executable plans using LLM-based planning agents. The focus is on **plan quality evaluation** before execution, with stub execution to prove control flow works.

### 1.2 Key Insight

Treat LLM planning as a "compiler front-end" that produces an **Intermediate Representation (IR)** — the `PlanSpec` — which can be validated, scored, and eventually compiled/interpreted into executable workflows.

### 1.3 Domain Focus

Technical/mathematical research goals that flow through to development, including:

- Research phases (parallelizable)
- Hypothesis generation
- Experimentation (with uncertain outcomes)
- Assessment and synthesis
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
│  LEVEL 1: STEP EXECUTION (stub implementation)                              │
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

### 2.3 Execution Model (Interpreted)

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

**Future consideration**: Full dynamism could be achieved by having the step function modify the workflow state to effectively "inject" new steps, potentially hooking into Mastra's workflow status streaming.

---

## 3. Step Type Taxonomy

| Type          | Category  | Description                                                        | Parallelizable |
| ------------- | --------- | ------------------------------------------------------------------ | -------------- |
| `research`    | Strategic | Gather existing knowledge                                          | Yes            |
| `hypothesize` | Strategic | Generate testable hypotheses from findings                         | No             |
| `synthesize`  | Strategic | Combine results (choose-best, merge, compare, integrate, distill)  | No             |
| `assess`      | Strategic | Evaluate outcomes against criteria                                 | No             |
| `experiment`  | Tactical  | Test hypothesis empirically                                        | Yes            |
| `develop`     | Tactical  | Build/implement something                                          | Sometimes      |
| `transform`   | Tactical  | Pure data manipulation                                             | N/A            |

### 3.1 Synthesis Modes

```typescript
type SynthesisMode =
  | "choose-best" // Pick one from multiple candidates
  | "merge" // Combine acceptable candidates into one
  | "compare" // Produce comparison without choosing
  | "integrate" // Weave findings into coherent narrative
  | "distill"; // Extract core insights, discard noise
```

---

## 4. PlanSpec Schema (IR)

```typescript
// schemas/plan-spec.ts

import { z } from "zod";

// === REQUIREMENTS ===
const zRequirement = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.enum(["must", "should", "could"]),
});

// === HYPOTHESES ===
const zHypothesis = z.object({
  id: z.string(),
  statement: z.string(),
  assumptions: z.array(z.string()),
  testableVia: z.string(),
  status: z
    .enum(["untested", "testing", "supported", "refuted", "inconclusive"])
    .default("untested"),
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
  dimensions: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number().min(0).max(1),
        description: z.string(),
      }),
    )
    .optional(),
});

// === EXECUTOR BINDING ===
const zExecutor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), ref: z.string() }),
  z.object({ kind: z.literal("tool"), ref: z.string() }),
  z.object({ kind: z.literal("workflow"), ref: z.string() }),
  z.object({ kind: z.literal("human") }),
]);

// === SYNTHESIS MODES ===
const zSynthesisMode = z.enum([
  "choose-best",
  "merge",
  "compare",
  "integrate",
  "distill",
]);

// === STEP TYPES ===
const zBaseStep = z.object({
  id: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()),
  requirementIds: z.array(z.string()),
  inputs: z.array(zDataContract),
  outputs: z.array(zDataContract),
  evalCriteria: zEvalCriteria.optional(),
  executor: zExecutor,
  parallelizable: z.boolean().default(false),
});

const zResearchStep = zBaseStep.extend({
  type: z.literal("research"),
  query: z.string(),
});

const zHypothesizeStep = zBaseStep.extend({
  type: z.literal("hypothesize"),
  basedOn: z.array(z.string()),
  targetUnknowns: z.array(z.string()),
});

const zSynthesizeStep = zBaseStep.extend({
  type: z.literal("synthesize"),
  mode: zSynthesisMode,
  inputStepIds: z.array(z.string()),
});

const zExperimentStep = zBaseStep.extend({
  type: z.literal("experiment"),
  hypothesisIds: z.array(z.string()),
  design: z.object({
    setup: z.string(),
    procedure: z.string(),
    measurements: z.array(z.string()),
  }),
  possibleOutcomes: z.array(
    z.object({
      id: z.string(),
      condition: z.string(),
      interpretation: z.string(),
      hypothesisEffect: z
        .object({
          hypothesisId: z.string(),
          newStatus: z.enum(["supported", "refuted", "inconclusive"]),
        })
        .optional(),
    }),
  ),
});

const zAssessStep = zBaseStep.extend({
  type: z.literal("assess"),
  evaluating: z.array(z.string()),
  againstCriteria: z.array(z.string()),
});

const zDevelopStep = zBaseStep.extend({
  type: z.literal("develop"),
  specification: z.string(),
  deliverables: z.array(z.string()),
});

const zTransformStep = zBaseStep.extend({
  type: z.literal("transform"),
  transformation: z.string(),
});

const zPlanStep = z.discriminatedUnion("type", [
  zResearchStep,
  zHypothesizeStep,
  zSynthesizeStep,
  zExperimentStep,
  zAssessStep,
  zDevelopStep,
  zTransformStep,
]);

// === DECISION TYPES ===
const zDecisionType = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("branch"),
    conditions: z.array(
      z.object({
        condition: z.string(),
        thenStepId: z.string(),
      }),
    ),
    defaultStepId: z.string().optional(),
  }),
  z.object({
    type: z.literal("supervisor-decision"),
    question: z.string(),
    possibleActions: z.array(
      z.object({
        id: z.string(),
        description: z.string(),
        enablesStepIds: z.array(z.string()).optional(),
        disablesStepIds: z.array(z.string()).optional(),
        triggersReplanning: z.boolean().optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal("human-decision"),
    question: z.string(),
    options: z.array(z.string()),
    timeout: z.string().optional(),
  }),
]);

// === DECISION POINTS ===
const zDecisionPoint = z.object({
  id: z.string(),
  afterStepId: z.string(),
  question: z.string(),
  decisionType: zDecisionType,
});

// === UNKNOWNS ===
const zUnknown = z.object({
  id: z.string(),
  type: z.enum([
    "assumption",
    "missing-input",
    "clarification-needed",
    "risk",
    "open-question",
  ]),
  description: z.string(),
  relatedStepIds: z.array(z.string()).optional(),
  relatedHypothesisIds: z.array(z.string()).optional(),
});

// === FULL PLAN SPEC ===
export const zPlanSpec = z.object({
  id: z.string(),
  goalSummary: z.string(),
  requirements: z.array(zRequirement),
  hypotheses: z.array(zHypothesis),
  steps: z.array(zPlanStep),
  decisionPoints: z.array(zDecisionPoint),
  unknowns: z.array(zUnknown),

  // Metadata
  estimatedComplexity: z
    .enum(["low", "medium", "high", "very-high"])
    .optional(),

  // Allowlist of available primitives
  availableExecutors: z
    .object({
      agents: z.array(z.string()),
      tools: z.array(z.string()),
      workflows: z.array(z.string()),
    })
    .optional(),
});

export type PlanSpec = z.infer<typeof zPlanSpec>;
```

---

## 5. Available Agents (Placeholder List)

```typescript
// constants.ts

export const AVAILABLE_AGENTS = {
  // Research & Discovery
  "literature-searcher": "Searches academic databases for relevant papers",
  "paper-summarizer": "Reads and summarizes academic papers",
  "concept-explainer": "Explains technical concepts at varying depths",

  // Analysis & Reasoning
  "hypothesis-generator": "Generates testable hypotheses from findings",
  "progress-evaluator": "Assesses current state against goals",
  "result-synthesizer":
    "Combines findings (choose-best, merge, compare, etc.)",

  // Implementation
  "code-explorer": "Navigates and explains existing codebases",
  "code-writer": "Implements algorithms and experiments",
  "code-reviewer": "Reviews code for correctness",
  "experiment-designer": "Designs experimental procedures",
} as const;

export type AgentRef = keyof typeof AVAILABLE_AGENTS;
```

---

## 6. File Structure

```
apps/hash-ai-agent/src/mastra/
├── schemas/
│   └── plan-spec.ts                    # PlanSpec IR schema (Zod)
│
├── agents/
│   ├── planner-agent.ts                # Goal → PlanSpec (structured output)
│   └── supervisor-agent.ts             # Plan review/approval
│
├── workflows/
│   ├── planning-workflow.ts            # Plan → Validate → Approve loop
│   └── stub-execution-workflow.ts      # Interpreted execution with stubs
│
├── steps/
│   ├── extract-requirements-step.ts    # Goal → Requirements list
│   ├── generate-plan-step.ts           # Requirements → PlanSpec
│   ├── validate-plan-step.ts           # Structural validation
│   ├── supervisor-review-step.ts       # LLM approval gate
│   └── execution/
│       ├── interpreter-step.ts         # Pick next action, execute, update state
│       └── stub-executors.ts           # Template-based mock executors
│
├── scorers/
│   ├── plan-structure-scorer.ts        # DAG validity, refs exist (deterministic)
│   ├── plan-coverage-scorer.ts         # Requirements mapped to steps (deterministic)
│   ├── plan-testability-scorer.ts      # Hypotheses have testable criteria (LLM)
│   └── plan-granularity-scorer.ts      # Steps appropriately scoped (LLM)
│
├── tools/
│   ├── plan-validator.ts               # Deterministic structural checks
│   └── topology-analyzer.ts            # Find parallel groups, decision points
│
├── fixtures/
│   └── decomposition-prompts/
│       ├── index.ts                    # Exports all fixtures
│       ├── simple-linear-research.ts   # Basic: research → synthesize
│       ├── parallel-research.ts        # Parallel research tasks
│       ├── hypothesis-experiment.ts    # Full R&D cycle
│       └── ct-database-goal.ts         # Real example: CT-native database
│
└── constants.ts                        # Available agents, models, etc.
```

---

## 7. Implementation Phases

### Phase 1: Schema & Validation

1. **`schemas/plan-spec.ts`** — Full PlanSpec schema with all types
2. **`tools/plan-validator.ts`** — Deterministic structural checks:
   - All `dependsOn` refs exist
   - All `executor.ref` values in allowlist
   - DAG is acyclic
   - All `hypothesisIds` exist
   - All `requirementIds` exist
3. **`tools/topology-analyzer.ts`** — Analyze plan structure:
   - Identify parallelizable step groups
   - Identify decision points
   - Compute critical path

### Phase 2: Fixtures

4. **`fixtures/decomposition-prompts/*.ts`** — Test fixtures with:
   - Goal description
   - Context
   - Expected characteristics (not full expected output)

### Phase 3: Planner Agent

5. **`agents/planner-agent.ts`** — Core planning agent:
   - Instructions explaining step types, agents, patterns
   - Structured output with `zPlanSpec`
   - Available agents list in system prompt

### Phase 4: Scorers

6. **`scorers/plan-structure-scorer.ts`** — Deterministic
7. **`scorers/plan-coverage-scorer.ts`** — Deterministic
8. **`scorers/plan-testability-scorer.ts`** — LLM judge
9. **`scorers/plan-granularity-scorer.ts`** — LLM judge

### Phase 5: Planning Workflow

10. **`steps/extract-requirements-step.ts`**
11. **`steps/generate-plan-step.ts`**
12. **`steps/validate-plan-step.ts`**
13. **`steps/supervisor-review-step.ts`**
14. **`agents/supervisor-agent.ts`**
15. **`workflows/planning-workflow.ts`**

### Phase 6: Stub Execution

16. **`steps/execution/stub-executors.ts`** — Template-based mocks
17. **`steps/execution/interpreter-step.ts`** — Core loop body
18. **`workflows/stub-execution-workflow.ts`** — Interpreted execution

---

## 8. Key Design Decisions

| Decision          | Choice                       | Rationale                                      |
| ----------------- | ---------------------------- | ---------------------------------------------- |
| Execution mode    | Interpreted                  | Supports dynamism, single workflow handles any plan |
| Stub executors    | Template-based               | Plausible outputs without LLM cost             |
| Plan evaluation   | LLM judge + structural       | No single "correct" decomposition              |
| Supervisor scope  | Pre-kickoff validation       | Simpler for Phase 1                            |
| Hypotheses        | Explicit top-level + referenced | Makes scientific structure visible          |
| Decision points   | Typed (branch/supervisor/human) | Distinguishes static vs dynamic             |
| Revision feedback | Configurable (all/latest)    | Flexibility in revision strategy               |

---

## 9. Execution State Shape

```typescript
interface ExecutionState {
  plan: PlanSpec;
  completedStepIds: string[];
  pendingStepIds: string[];
  stepResults: Record<string, any>;
  hypothesisStatuses: Record<string, HypothesisStatus>;
  currentPhase:
    | "research"
    | "hypothesize"
    | "experiment"
    | "assess"
    | "develop";
  iterations: number;
  decisionLog: Array<{ stepId: string; decision: string; reason: string }>;
}
```

---

## 10. Evaluation Strategy

| Scorer              | Type          | Measures                               |
| ------------------- | ------------- | -------------------------------------- |
| `plan-structure`    | Deterministic | DAG valid, refs exist, no orphans      |
| `plan-coverage`     | Deterministic | All requirements addressed             |
| `plan-testability`  | LLM judge     | Hypotheses can actually be tested      |
| `plan-granularity`  | LLM judge     | Steps appropriately scoped             |
| `plan-coherence`    | LLM judge     | Steps make sense together              |
| `plan-completeness` | LLM judge     | No obvious gaps for the goal           |

---

## 11. Test Fixture: CT-Database Goal

```typescript
// fixtures/decomposition-prompts/ct-database-goal.ts

export const ctDatabaseGoal = {
  id: "ct-database",
  goal: `Create a backend language and database that is natively aligned with 
         category-theoretical expressions. This should support objects, morphisms, 
         functors, and natural transformations as first-class concepts, with 
         query performance competitive with traditional databases.`,
  context: `We're exploring whether CT primitives can serve as a more natural 
            foundation for data modeling than relational or document models. 
            Key unknowns include performance characteristics and expressiveness 
            tradeoffs. This goal spans research (what exists, what's been tried),
            hypothesis generation, experimentation (prototyping, benchmarking),
            and potentially development.`,
  expectedCharacteristics: {
    shouldHaveHypotheses: true,
    shouldHaveExperiments: true,
    shouldHaveParallelResearch: true,
    minSteps: 8,
    expectedStepTypes: [
      "research",
      "hypothesize",
      "experiment",
      "assess",
      "develop",
    ],
    shouldSurfaceUnknowns: true,
  },
};
```

---

## 12. Open Questions / Future Work

1. **Full dynamism**: The "workflow within workflow" pattern where the step function can modify state to effectively inject new steps. Would need to hook into Mastra's event streaming.

2. **Runtime supervisor decisions**: Currently supervisor only validates pre-kickoff. Future: supervisor makes decisions during interpreted execution.

3. **Human-in-the-loop**: Decision points with `type: "human-decision"` would use Mastra's suspend/resume.

4. **Real executors**: Replace stubs with actual agent implementations.

5. **Plan caching/versioning**: Store plans for comparison, track how plans evolve.

---

## 13. Revision Loop Configuration

**Q1 from planning session**: When revision is needed, should planner see all previous feedback or only latest?

**Decision**: Configurable via workflow input:

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

This is a configuration option set before kickoff, not a human-in-the-loop decision.

---

## 14. Next Steps

When resuming implementation:

1. Create `schemas/plan-spec.ts` with full Zod schema
2. Create `constants.ts` with available agents list
3. Create `tools/plan-validator.ts` with structural checks
4. Create test fixtures in `fixtures/decomposition-prompts/`
5. Create `agents/planner-agent.ts` with structured output
6. Create scorers (start with deterministic, then LLM)
7. Create planning workflow steps
8. Create `workflows/planning-workflow.ts`
9. Test manually (Phase 1 evaluation approach)
10. Create stub execution workflow

---

_End of Plan Document_
