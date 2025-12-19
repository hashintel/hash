# PR: Task Decomposition & Planning Framework

## 🌟 What is the purpose of this PR?

Introduces a framework for decomposing complex R&D goals into structured, executable plans using LLM-based planning agents. The core insight is treating LLM planning as a "compiler front-end" that produces an **Intermediate Representation (IR)** — the `PlanSpec` — which can be validated, scored, and eventually compiled into executable workflows.

This PR establishes the foundational infrastructure for plan generation and quality evaluation, with the goal of enabling autonomous research and development workflows.

## 🔗 Related links

- `agent/docs/PLAN-task-decomposition.md` — Full design document and implementation plan
- `agent/docs/E2E-test-results-2024-12-17.md` — Latest E2E test outputs

## 🚫 Blocked by

_None_

## 🔍 What does this change?

### Core Schema & Types

- **`schemas/plan-spec.ts`** — Full Zod schema for `PlanSpec` with 4 step types:
  - `research` — Parallelizable information gathering
  - `synthesize` — Combining findings (integrative) or evaluating results (evaluative)
  - `experiment` — Testing hypotheses (exploratory or confirmatory with preregistration)
  - `develop` — Building/implementing artifacts

- **`schemas/planning-fixture.ts`** — Types for test fixtures (`PlanningFixture`, `ExpectedPlanCharacteristics`)

- **`constants.ts`** — 12 agent capability profiles with `canHandle` mappings for executor assignment

### Validation & Analysis

- **`tools/plan-validator.ts`** — 12 structural validation checks:
  - DAG validity (no cycles, valid references)
  - Executor compatibility
  - Preregistration requirements for confirmatory experiments
  - Input/output consistency

- **`tools/topology-analyzer.ts`** — DAG analysis utilities:
  - Entry/exit point detection
  - Critical path calculation
  - Parallel group identification

### Scoring System

- **`scorers/plan-scorers.ts`** — 4 deterministic scorers (no LLM, fast):
  - `scorePlanStructure` — DAG validity, parallelism, step type diversity
  - `scorePlanCoverage` — Requirement/hypothesis coverage
  - `scoreExperimentRigor` — Preregistration, success criteria
  - `scoreUnknownsCoverage` — Epistemic completeness

- **`scorers/plan-llm-scorers.ts`** — 3 LLM-based judges:
  - `goalAlignmentScorer` — Does plan address the goal?
  - `planGranularityScorer` — Are steps appropriately sized?
  - `hypothesisTestabilityScorer` — Are hypotheses testable?

### Planning Agent

- **`agents/planner-agent.ts`** — `generatePlan(goal, context)` function that uses structured output to produce valid `PlanSpec` instances

### Test Fixtures

4 fixtures of increasing complexity in `fixtures/decomposition-prompts/`:

| Fixture | Complexity | Step Types |
|---------|------------|------------|
| `summarize-papers` | Simple linear | research → synthesize |
| `explore-and-recommend` | Parallel research | research (parallel) → synthesize (evaluative) |
| `hypothesis-validation` | With experiments | research → experiment → synthesize |
| `ct-database-goal` | Full R&D cycle | All 4 types, hypotheses, experiments |

### E2E Test Suite

- **`workflows/planning-workflow.test.ts`** — Comprehensive E2E tests:
  - Runs all 4 fixtures through the full pipeline
  - Validates generated plans
  - Runs deterministic scorers
  - Optional LLM scorers via `RUN_LLM_SCORERS=true`
  - Generates summary report with score table

## Pre-Merge Checklist 🚀

### 🚢 Has this modified a publishable library?

This PR:

- [x] does not modify any publishable blocks or libraries, or modifications do not need publishing

### 📜 Does this require a change to the docs?

The changes in this PR:

- [x] are internal and do not require a docs change

### 🕸️ Does this require a change to the Turbo Graph?

The changes in this PR:

- [x] do not affect the execution graph

## ⚠️ Known issues

1. **ct-database-goal fixture fails validation** — The LLM occasionally generates confirmatory experiments without `preregisteredCommitments`. This is a known prompt engineering issue that will be addressed in the revision workflow.

2. **explore-and-recommend generates unexpected content** — The LLM adds hypotheses and experiments not specified in the fixture expectations. This is valid behavior (more thorough than minimum), but indicates fixture expectations may need adjustment.

## 🐾 Next steps

Per `PLAN-task-decomposition.md` Section 18:

1. **Revision workflow loop** — Implement `dountil` loop: generate → validate → feedback → regenerate (max 3 attempts)
2. **Supervisor agent** — LLM approval gate before plan finalization
3. **Prompt improvements** — Strengthen preregisteredCommitments requirement
4. **Stub execution** — Low priority, deferred

## 🛡 What tests cover this?

- `plan-validator.test.ts` — 25 negative fixture tests for validation
- `plan-scorers.test.ts` — 23 unit tests for deterministic scorers
- `plan-llm-scorers.test.ts` — 6 tests for LLM judges
- `fixtures.test.ts` — 4 fixture validation tests
- `planning-workflow.test.ts` — E2E pipeline tests (3/4 passing)

## ❓ How to test this?

1. Checkout the branch
2. `cd apps/hash-ai-agent`
3. Run unit tests: `npx vitest run src/mastra/scorers/plan-scorers.test.ts`
4. Run E2E tests: `npx vitest run src/mastra/workflows/planning-workflow.test.ts`
5. (Optional) Run with LLM scorers: `RUN_LLM_SCORERS=true npx vitest run src/mastra/workflows/planning-workflow.test.ts`

## 📹 Demo

See `agent/docs/E2E-test-results-2024-12-17.md` for full test output, including:

```
Deterministic Scores:
  Fixture                     | Overall | Structure | Coverage | Rigor | Unknowns
  -------------------------------------------------------------------------------------
  summarize-papers             |     93% |       77% |     100% |  100% |      93%
  explore-and-recommend        |     92% |       86% |      93% |   93% |     100%
  hypothesis-validation        |     95% |       86% |     100% |   95% |     100%
```
