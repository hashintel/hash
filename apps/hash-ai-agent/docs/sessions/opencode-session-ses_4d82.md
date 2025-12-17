# Planning LLM decomposition with Mastra

**Session ID:** ses_4d8201455ffeXl20yTQ7ft3M4Q
**Created:** 12/16/2025, 4:55:44 PM
**Updated:** 12/16/2025, 5:57:06 PM

---

## User

I had some exchanges with GPT 5.2 Pro on how I could break down some complex things I want to do with "mastra". Please use btca to look up implementation details when we get that far.

USER

> I want to develop prompting and orchestration approaches for LLMs, around decomposition of complex goals or requirements into a series of tasks or steps, which could be broken down along various patterns, which then would need to be fed into some kind of an orchestrator. 

> I'm working in TypeScript. I'm working with a framework called [Mastra](https://mastra.ai/docs/v1), which offers the ability to structure deterministic workflows and a degree of dynamism in its workflow architecture where it allows a delegator agent to call other agents via tools, or even something called agent networks which sounds like maybe a more structured version of delegation. 

> Within the limits of what's possible with this framework, I want to build out a series of toy but also rigorous little patterns, fixtures, and tests that will allow me to explore and prove out this "breakdown"/"decomposition" phase. I don't want to try to actually run the tasks yet, I want to evaluate and optimize the quality of the reasoning and analysis within this decomposition step, and then to think about how to get an output from this step in to some form that could be used to dynamically generate a "workflow", or somehow be used as a deterministic schema for the actual task-delegation phase

> tell me what you think of this so far, where you think the risks and complexities are, and what I might have missed

ASSISTANT

```md
What you’re describing is a solid direction, and it’s a very “TypeScript-native” way to approach agentic systems: treat **LLM reasoning as a compiler front-end** (goal/requirements → structured plan/IR), then later treat execution as a **separate back-end** (IR → Mastra workflow / network / tool calls). That separation is exactly what you want if you’re trying to optimize decomposition quality without conflating it with tool success or integration details.

A few thoughts, risks, and “missing pieces” that tend to bite people building this kind of planning layer—anchored in what Mastra actually supports today.

---

## What looks strong so far

### You’re isolating the hard part

Most teams jump straight to “execute tasks” and only later realize their core problem is: *the plan itself is inconsistent, underspecified, or not mappable to an orchestrator*. Focusing on decomposition first is the right “failure mode reduction” move.

### Mastra is a good fit for a plan → workflow compiler

Mastra workflows are explicitly schema-connected graphs: step input/output schemas must align and you use mapping steps to reconcile shapes, plus you get branching, parallelism, and loops. That’s basically a target language for your “plan IR.” ([Mastra][1])

### You can make plan-generation structured and testable

Mastra agents support **structured output** using Zod / JSON Schema and give you the parsed result on `response.object`. That’s huge for turning “plans” into something you can validate and score. ([Mastra][2])

### Mastra already has an evaluation surface you can reuse

Mastra’s “Scorers” let you attach evaluation (rule-based and/or LLM-graded) to outputs and even to workflow steps, and there’s a “custom scorer” pipeline designed exactly for mixing deterministic checks with judge-model nuance. ([Mastra][3])

---

## The biggest risks / complexities

### 1) “Quality of reasoning” is not directly measurable—only plan artifacts are

If you don’t execute anything, you can’t truly know feasibility. So “reasoning quality” has to be proxied by **properties of the plan**:

* completeness vs. the stated requirements
* internal consistency (no contradictory steps)
* dependency soundness (inputs exist before they’re used)
* granularity (steps are neither “hand-wavy” nor absurdly atomic)
* mappability to known primitives (agents/tools/workflows you actually have)

If you don’t formalize those properties early, you’ll end up optimizing for “plans that read well,” which is an easy trap.

### 2) Multiple valid decompositions means “golden plan” tests are brittle

For non-trivial problems there isn’t one correct plan—there are families of acceptable plans. Snapshot testing raw JSON output tends to rot quickly.

You’ll likely want:

* **structural invariants** (must always hold),
* **rubric-based scoring** (graded),
* and sometimes **constraint-based comparisons** (“must include step that addresses X”, “must not introduce tools not in allowlist”).

Mastra’s scorer system is basically built to support that style: deterministic preprocessing + analysis + a score + optionally a reason. ([Mastra][3])

### 3) IR-to-workflow compilation is where “nice plans” go to die

Even if you don’t run tasks, you should compile plans into *something* early, because compilation forces you to confront:

* step boundaries (what is a node?)
* dataflow contracts (what does each node output?)
* branching schemas (all branches need compatible schemas)
* parallel output shapes (keys are step IDs in `.parallel()` output)
* loop termination + iteration limits (otherwise you’ll synthesize infinite loops)

Mastra makes these constraints explicit. Example: `.parallel()` produces an object keyed by step `id`, and the downstream schema must match that shape. ([Mastra][1])

### 4) Planning must acknowledge unknowns (or it will hallucinate requirements)

A decomposition phase that never emits:

* assumptions,
* missing inputs,
* clarifying questions,
* risks / decision points,

…will silently “fill in” gaps. That feels productive but produces plans that won’t survive contact with real execution.

Even if you’re not going to ask the user questions *yet*, you want the planner to surface them so you can score whether it correctly identified ambiguity.

### 5) Networks vs workflows: different failure modes

Mastra agent networks are designed for tasks that “aren’t clearly defined upfront” and rely on an LLM routing agent to pick primitives dynamically; memory is required and `.network()` is described as experimental in parts of the docs. ([Mastra][4])

That matters because:

* a network can be a *planner* (dynamic), but
* you’re trying to produce a *deterministic schema / workflow* (static-ish)

So you need to decide where you want nondeterminism:

* **in plan synthesis** (LLM generates a plan),
* but **not in plan execution** (workflow runs deterministically),
* or allow nondeterminism later via networks.

A hybrid is often best: deterministic meta-workflow that *produces/validates* a plan, and later either compiles to a workflow or hands it to a network.

---

## The main thing you might be missing: a plan intermediate representation with compilation constraints

If your decomposition output is “a list of steps” in prose, you’ll struggle to:

* validate it,
* diff it,
* score it,
* compile it,
* or enforce safety/allowlists.

Instead, treat decomposition as producing an **IR** that is intentionally “workflow-shaped.”

A useful IR usually includes:

1. **Requirements + traceability**

* list of extracted requirements with IDs
* each plan step references requirement IDs it satisfies

2. **Step graph (DAG)**

* `steps[]` with `dependsOn[]`
* explicit `dataInputs[]` and `dataOutputs[]` (even if high-level)

3. **Control flow primitives**
   Map cleanly onto Mastra constructs:

* sequential: `.then()`
* parallel group: `.parallel([...])`
* conditional: `.branch([...])`
* loops: `.dountil()`, `.dowhile()`, `.foreach()` ([Mastra][1])

4. **Executor binding**
   Even if you won’t run tasks, you should bind each step to an *intended executor kind*:

* `agent:<name>`
* `tool:<name>`
* `workflow:<name>`
* `transform` / `map`
* `human` (approval / input) — Mastra supports human-in-the-loop patterns in workflows ([Mastra][5])

5. **Acceptance criteria per step**
   This is key for later: you can’t verify steps without criteria.

6. **Guardrails**

* allowed tools/agents
* max depth / max steps
* forbidden action classes

Mastra’s structured output support makes this much easier because you can require this IR via Zod and get validated objects back. ([Mastra][2])

---

## Concrete “toy but rigorous” patterns worth implementing first

These are small enough to test, but rich enough to reveal real planning failure modes.

### Pattern A: Requirements extraction → plan → traceability matrix

Workflow:

1. extract requirements & constraints from prompt
2. draft plan steps
3. attach requirement IDs to steps
4. emit a “coverage report” (what requirements are unaddressed?)

This pattern catches “pretty plans that miss key constraints.”

### Pattern B: Parallelizable vs sequential decomposition

Give prompts where some tasks are independent (research X, research Y, then compare).
Score whether the plan:

* identifies concurrency,
* groups steps into parallel sets,
* includes a merge/aggregation step (because Mastra parallel output is keyed by step IDs). ([Mastra][1])

### Pattern C: Branching on decision criteria

Prompts with a clear conditional (“if budget < $X do A else do B”).
Score whether:

* branch conditions exist,
* both branches produce compatible outputs (Mastra branch needs consistent schemas). ([Mastra][1])

### Pattern D: Iterative refinement loop with termination + cap

Prompts like “draft → critique → revise until meets rubric, max 3 iterations.”
Mastra supports `.dountil()` / `.dowhile()` and even discusses aborting loops using `iterationCount`. ([Mastra][1])
Your plan IR should require:

* termination condition
* max iterations / safety cap
* what changes each loop iteration is expected to make

### Pattern E: Foreach/map pattern

Prompts involving lists (“for each document, extract entities; then summarize across docs”).
Mastra has `.foreach()` with optional concurrency controls. ([Mastra][1])
Score whether the plan:

* identifies per-item processing vs aggregation
* includes the reduce step

---

## How I’d set up your evaluation harness (without executing tasks)

### 1) Always validate structure deterministically first

* Zod parse must succeed
* graph must be acyclic
* all referenced step IDs exist
* every step has at least one requirement mapping (or explicitly marked “supporting”)

### 2) Then score with a mix of deterministic + LLM-judge

Mastra supports attaching scorers (and building custom ones with a multi-stage pipeline). ([Mastra][3])

Good custom scorers for plan IR:

* **Coverage scorer (deterministic)**
  % of extracted requirements referenced by ≥1 step

* **Mappability scorer (deterministic)**
  all `executor.ref` names are in allowlisted primitives

* **Granularity scorer (LLM-judge)**
  steps are “atomic enough,” not vague blobs

* **Dependency/dataflow plausibility (LLM-judge + heuristics)**
  do inputs logically come from earlier outputs?

* **Hallucinated requirement injection (LLM-judge)**
  steps introduce constraints not present in input unless tagged as assumption

Also: Mastra has built-in scorers around relevancy/completeness/hallucination and similarity-to-ground-truth, which you can sometimes repurpose for “plan quality” if you craft the inputs/expected outputs carefully. ([Mastra][6])

### 3) Prefer metamorphic tests over goldens

Examples:

* Add a new constraint (“must be GDPR compliant”) → plan should add at least one step tagged to that requirement.
* Remove a constraint → corresponding steps should disappear or be downgraded to optional.
* Rephrase prompt → plan structure should stay mostly stable.

This reduces brittleness and encourages real robustness.

---

## Mastra-specific gotchas to account for early

### Structured output + model/tool compatibility

Mastra structured output usually uses provider `response_format`, but if a provider/model doesn’t support that you may need `jsonPromptInjection`. Also, docs note Gemini 2.5 has a known constraint combining tools + structured output unless you use prompt injection mode. ([Mastra][2])

Even if you’re “not running tools,” your planner agent might *have tools configured* in Mastra, so this can still affect plan generation reliability.

### Networks require memory and are routing-by-description

Mastra networks select primitives based on descriptions and schemas; memory is required; and `.network()` is described as experimental in streaming docs. ([Mastra][4])
If you use networks as part of your decomposition experiments, you’ll want tests around:

* description quality
* overlap/ambiguity between primitives
* stability of routing

---

## Practical next step that tends to unlock everything

Build a **“PlanSpec” IR + compiler stub**:

* Planner agent: `prompt → PlanSpec (Zod structured output)`
* Validator: deterministic checks + produce diagnostics
* Repair loop: if invalid, feed diagnostics back to planner to revise
* Compiler stub: `PlanSpec → Mastra workflow definition` but each step is a no-op placeholder that just returns mock-shaped outputs

Even without real execution, that last step forces the decomposition to respect Mastra’s real constraints around schemas, branching, parallel outputs, and loops. ([Mastra][1])

---

If you want, I can propose a concrete PlanSpec schema (Zod) that maps 1:1 onto Mastra’s `.then() / .parallel() / .branch() / .dountil() / .dowhile() / .foreach()` surface, plus a shortlist of 15–20 test prompts that each isolates one decomposition failure mode.

[1]: [https://mastra.ai/docs/workflows/control-flow](https://mastra.ai/docs/workflows/control-flow) "Control Flow | Workflows | Mastra Docs"
[2]: [https://mastra.ai/docs/agents/overview](https://mastra.ai/docs/agents/overview) "Using Agents | Agents | Mastra Docs"
[3]: [https://mastra.ai/docs/scorers/custom-scorers](https://mastra.ai/docs/scorers/custom-scorers) "Custom Scorers | Scorers | Mastra Docs"
[4]: [https://mastra.ai/docs/agents/networks](https://mastra.ai/docs/agents/networks) "Agent Networks | Agents | Mastra Docs"
[5]: [https://mastra.ai/docs/workflows/agents-and-tools](https://mastra.ai/docs/workflows/agents-and-tools) "Agents and Tools | Workflows | Mastra Docs"
[6]: [https://mastra.ai/docs/scorers/built-in-scorers](https://mastra.ai/docs/scorers/built-in-scorers) "Built-in Scorers | Scorers | Mastra Docs"

``` 

---

## Assistant

I've read through the GPT 5.2 Pro exchange. This is a well-thought-out approach - treating LLM planning as a "compiler front-end" that produces an IR (intermediate representation) which can later be compiled to Mastra workflows. The key insight is isolating decomposition quality from execution, so you can iterate on planning without the noise of tool failures.

Let me look at what's already in this codebase related to Mastra to understand the starting point:

```
Tool: task
```

---

## Assistant

Excellent. Now let me read the existing Mastra skill documentation and a few key files to understand the patterns better:

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

---

## Assistant

Now let me check the scorer pattern and the test file:

```
Tool: read
```

```
Tool: read
```

---

## Assistant

Now I have a good understanding of the existing patterns. Let me also fetch the Mastra docs on workflow control flow and agent networks since those are central to what GPT was discussing:

```
Tool: webfetch
```

```
Tool: webfetch
```

---

## Assistant

Now I have a comprehensive understanding of both the existing codebase patterns and the Mastra framework capabilities. Let me synthesize what GPT proposed and create a concrete implementation plan.

Based on GPT 5.2 Pro's analysis and the existing codebase, here's my assessment and a concrete proposal:

## Summary of the GPT Exchange

The key insight is treating **plan decomposition as a compiler front-end**: 
- **Input**: complex goal/requirements  
- **Output**: structured IR (intermediate representation) that maps to Mastra primitives
- **Later**: compile IR → executable Mastra workflow

This separation lets you iterate on planning quality without execution noise.

## What Already Exists in This Repo

The `apps/hash-ai-agent/` project has established patterns:
- **Agents** with structured output (Zod/TypeBox)
- **Workflows** with `createStep`/`createWorkflow` + schema validation
- **Scorers** using the `createScorer` pipeline (preprocess → analyze → score → reason)
- **Evals** via `runEvals` with ground truth fixtures

## Key Risks GPT Identified (that I agree with)

1. **"Quality of reasoning" isn't directly measurable** — you can only measure properties of the plan artifact (completeness, consistency, granularity, mappability)

2. **Multiple valid decompositions** — golden/snapshot tests rot fast; need structural invariants + rubric scoring instead

3. **IR-to-workflow compilation forces real constraints** — even without execution, compiling to Mastra's schema requirements (parallel output keying, branch schema consistency, loop termination) catches plan defects early

4. **Plans that don't surface unknowns will hallucinate** — the planner should emit assumptions, missing inputs, and decision points

## Concrete Next Step

GPT suggested building a **PlanSpec IR + compiler stub**. I agree this is the right starting point. Here's what that would look like in this codebase:

```
apps/hash-ai-agent/src/mastra/
├── schemas/
│   └── plan-spec.ts          # Zod schema for the IR
├── agents/
│   └── planner-agent.ts      # Agent that produces PlanSpec
├── workflows/
│   └── plan-workflow.ts      # Workflow: decompose → validate → repair loop
├── scorers/
│   ├── plan-coverage-scorer.ts    # % of requirements mapped to steps
│   ├── plan-mappability-scorer.ts # All executors in allowlist
│   └── plan-granularity-scorer.ts # LLM-judge for step atomicity
├── tools/
│   └── plan-compiler.ts      # Validates PlanSpec compiles to Mastra shape
└── fixtures/
    └── decomposition-prompts/ # Test prompts isolating failure modes
```

The **PlanSpec schema** would include:
- Requirements list with IDs
- Step DAG with `dependsOn[]`, `dataInputs[]`, `dataOutputs[]`
- Control flow primitives mapping to `.then()`, `.parallel()`, `.branch()`, `.foreach()`, `.dountil()`
- Executor bindings (`agent:X`, `tool:Y`, `workflow:Z`, `transform`, `human`)
- Acceptance criteria per step
- Surfaced assumptions/unknowns

---

**Where would you like to start?** Options:

1. **Design the PlanSpec Zod schema** — define the IR structure
2. **Create test prompts** — decomposition scenarios isolating specific failure modes (parallelization, branching, iteration, etc.)
3. **Build the planner agent** — agent that produces structured PlanSpec output
4. **Build scorers** — deterministic + LLM-judge evaluation pipeline

---

## User

be careful to look at v1 docs, not the pre v1 docs

---

## Assistant

Good catch. Let me fetch the v1 docs to ensure I'm working with the correct API:

```
Tool: webfetch
```

```
Tool: webfetch
```

```
Tool: webfetch
```

---

## Assistant

Let me also check the v1 docs for evals/scorers and structured output:

```
Tool: webfetch
```

```
Tool: webfetch
```

---

## Assistant

Now I have a complete picture of the v1 API. Let me also check the v1 agent networks page and custom scorers:

```
Tool: webfetch
```

```
Tool: webfetch
```

---

## Assistant

Excellent. Now I have a comprehensive understanding of the v1 API. The docs look quite similar to what I fetched earlier (the stable docs), with some notable differences:

**Key v1 differences I noticed:**
1. **Evals/Scorers**: In v1, the `createScorer` API is more streamlined with a 4-step pipeline: `preprocess` → `analyze` → `generateScore` → `generateReason`. The existing code uses the older API.
2. **Structured Output**: Now passed via `structuredOutput: { schema: z.object(...) }` option to `generate()` or `stream()`
3. **Agent Networks**: Same concept, requires memory, uses `.network()` method
4. **Workflows**: Same `createStep`/`createWorkflow` API with `.then()`, `.parallel()`, `.branch()`, `.foreach()`, `.dountil()`, `.dowhile()`

Let me now synthesize all of this into a concrete plan for your decomposition/planning exploration.

---

## Plan: Task Decomposition IR + Evaluation Framework

Based on the GPT 5.2 Pro analysis and the v1 Mastra API, here's a concrete implementation plan:

### 1. Core Concept

Create a **PlanSpec intermediate representation** (IR) that:
- Is produced by a planner agent using structured output
- Maps directly to Mastra workflow primitives (`.then()`, `.parallel()`, `.branch()`, `.foreach()`, `.dountil()`)
- Can be validated deterministically before any execution
- Can be scored for quality using a mix of deterministic and LLM-judge scorers

### 2. Proposed File Structure

```
apps/hash-ai-agent/src/mastra/
├── schemas/
│   └── plan-spec.ts              # Zod schema for the PlanSpec IR
├── agents/
│   └── planner-agent.ts          # Agent that produces PlanSpec via structured output
├── workflows/
│   └── planning-workflow.ts      # decompose → validate → repair loop
├── scorers/
│   ├── plan-coverage-scorer.ts   # % requirements mapped to steps
│   ├── plan-acyclicity-scorer.ts # DAG validation (deterministic)
│   ├── plan-mappability-scorer.ts# All executors in allowlist
│   └── plan-granularity-scorer.ts# LLM-judge for step atomicity
├── tools/
│   └── plan-validator.ts         # Deterministic IR validation
└── fixtures/
    └── decomposition-prompts/    # Test prompts per failure mode
        ├── parallel-detection.ts
        ├── conditional-branching.ts
        ├── iterative-refinement.ts
        ├── foreach-aggregation.ts
        └── requirement-coverage.ts
```

### 3. PlanSpec IR Schema (draft)

```typescript
// schemas/plan-spec.ts
import { z } from "zod";

// Requirement extracted from the goal
const zRequirement = z.object({
  id: z.string(),
  description: z.string(),
  priority: z.enum(["must", "should", "could"]),
});

// Data contract for step inputs/outputs
const zDataContract = z.object({
  name: z.string(),
  description: z.string(),
  // We keep this loose; could tighten later
});

// Control flow type mapping to Mastra primitives
const zControlFlow = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sequential") }),
  z.object({ type: z.literal("parallel"), stepIds: z.array(z.string()) }),
  z.object({ 
    type: z.literal("branch"), 
    conditions: z.array(z.object({ 
      condition: z.string(), 
      stepId: z.string() 
    })) 
  }),
  z.object({ 
    type: z.literal("foreach"), 
    itemsFrom: z.string(), // step ID or "input"
    concurrency: z.number().optional() 
  }),
  z.object({ 
    type: z.literal("dountil"), 
    condition: z.string(),
    maxIterations: z.number() 
  }),
  z.object({ 
    type: z.literal("dowhile"), 
    condition: z.string(),
    maxIterations: z.number() 
  }),
]);

// Executor binding
const zExecutor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("agent"), ref: z.string() }),
  z.object({ kind: z.literal("tool"), ref: z.string() }),
  z.object({ kind: z.literal("workflow"), ref: z.string() }),
  z.object({ kind: z.literal("transform") }), // pure data mapping
  z.object({ kind: z.literal("human") }), // human-in-the-loop
]);

// A single step in the plan
const zPlanStep = z.object({
  id: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()), // step IDs this step depends on
  requirementIds: z.array(z.string()), // which requirements this addresses
  inputs: z.array(zDataContract),
  outputs: z.array(zDataContract),
  executor: zExecutor,
  acceptanceCriteria: z.string().optional(),
  controlFlow: zControlFlow.optional(), // if this step is a control structure
});

// Surfaced unknowns
const zUnknown = z.object({
  id: z.string(),
  type: z.enum(["assumption", "missing_input", "clarification_needed", "risk"]),
  description: z.string(),
  relatedStepIds: z.array(z.string()).optional(),
});

// The full plan spec
export const zPlanSpec = z.object({
  goalSummary: z.string(),
  requirements: z.array(zRequirement),
  steps: z.array(zPlanStep),
  unknowns: z.array(zUnknown),
  allowedExecutors: z.object({
    agents: z.array(z.string()),
    tools: z.array(z.string()),
    workflows: z.array(z.string()),
  }).optional(),
});

export type PlanSpec = z.infer<typeof zPlanSpec>;
```

### 4. Scorers (v1 API)

**a) Plan Coverage Scorer (deterministic)**
```typescript
// scorers/plan-coverage-scorer.ts
createScorer({
  name: "Plan Coverage",
  description: "% of requirements mapped to at least one step",
})
.preprocess(({ run }) => {
  const plan = run.output as PlanSpec;
  const reqIds = new Set(plan.requirements.map(r => r.id));
  const mappedReqIds = new Set(plan.steps.flatMap(s => s.requirementIds));
  return { reqIds, mappedReqIds, total: reqIds.size };
})
.generateScore(({ results }) => {
  const { reqIds, mappedReqIds, total } = results.preprocessStepResult;
  if (total === 0) return 1;
  const covered = [...reqIds].filter(id => mappedReqIds.has(id)).length;
  return covered / total;
})
.generateReason(({ results, score }) => {
  const { reqIds, mappedReqIds } = results.preprocessStepResult;
  const uncovered = [...reqIds].filter(id => !mappedReqIds.has(id));
  if (uncovered.length === 0) return `All requirements covered (${score})`;
  return `Score: ${score}. Uncovered: ${uncovered.join(", ")}`;
});
```

**b) Plan Acyclicity Scorer (deterministic)**
- Validates the step DAG has no cycles
- Checks all `dependsOn` references exist

**c) Plan Mappability Scorer (deterministic)**
- Checks all executor refs are in the allowlist

**d) Plan Granularity Scorer (LLM-judge)**
- Uses `.analyze()` with LLM to assess if steps are too vague or too atomic

### 5. Test Prompts (fixtures)

Each fixture isolates a specific decomposition pattern/failure mode:

| Pattern | Prompt Example | What We Score |
|---------|---------------|---------------|
| **Parallel Detection** | "Research topic X and topic Y, then compare them" | Does plan identify parallelizable steps? |
| **Conditional Branching** | "If budget < $1000, do A; else do B" | Does plan have branch with conditions? |
| **Iterative Refinement** | "Draft, critique, revise until quality > 0.8, max 3 tries" | Does plan have dountil with termination? |
| **Foreach/Map** | "For each document, extract entities; summarize across all" | Does plan identify per-item vs aggregation? |
| **Requirement Coverage** | Complex multi-constraint goal | Does plan address all constraints? |
| **Unknown Surfacing** | Ambiguous goal with missing info | Does plan surface assumptions/questions? |

### 6. Planning Workflow

```typescript
// workflows/planning-workflow.ts
createWorkflow({
  id: "planning-workflow",
  inputSchema: z.object({ goal: z.string(), context: z.string().optional() }),
  outputSchema: zPlanSpec,
})
.then(extractRequirementsStep)
.then(generatePlanStep) // calls planner agent with structured output
.then(validatePlanStep) // deterministic validation
.branch([
  [async ({ inputData }) => inputData.isValid, finalizeStep],
  [async ({ inputData }) => !inputData.isValid, repairPlanStep],
])
.dountil(
  repairLoopStep, 
  async ({ inputData }) => inputData.isValid || inputData.attempts >= 3
)
.commit();
```

---

## Questions Before Implementation

1. **Scope of "executors"**: Should the allowlist of agents/tools/workflows be:
   - Static (hardcoded based on what exists in this codebase)?
   - Dynamic (passed as input to the planner)?
   - For now, should we just use placeholders like `agent:research`, `tool:search`?

2. **PlanSpec complexity**: The schema above is fairly rich. Should we start with a simpler subset (e.g., just sequential + parallel, no loops) and iterate?

3. **Where to put test fixtures**: The existing pattern uses `fixtures/source-texts/` for eval data. Should decomposition prompts follow the same pattern, or be co-located with tests?

4. **v1 migration**: The existing `hash-ai-agent` code uses the older scorer API (`createScorer` with different method signatures). Should we:
   - Migrate existing scorers to v1 API first?
   - Build new decomposition scorers with v1 API alongside existing ones?
   - Hold off on v1 migration?

5. **Execution scope**: GPT mentioned building a "compiler stub" that compiles PlanSpec → Mastra workflow with no-op steps. Do you want that as part of this first phase, or focus purely on the planning/scoring first?

---

## User

1. can you explain more about what you mean by scope of executors? Provide analogies if appropriate. btw I'm glad you clarified what "IR" stood for, chat GPT never did
2. if you think we can isolate that and still easily add looping later, yes; but I'm interested in perhaps exploring more about how this would work in principle... perhaps you can walk me through this with examples? i've been having a hard time imagining so far, how we might dynamically compile the output from one agent in to something we can directly launch as a further step in a workflow
3. I like putting fixtures in `src/mastra/fixtures/` so far
4. there shouldn't be any migration needed, if you check the package.json you'll see that all the `@mastra/*` deps are on some patch revision of 1.0.x beta
5. I don't have a very clear picture of this, but my thought was to try to go as far in to proving 'how this would work' as possible without actually running any steps, except if perhaps we design the steps to return static or highly simplistic results, just so we could see how the workflow would handle some dynamism such as branching 

---

## Assistant

Great questions! Let me address each one, especially diving deep into #2 since that's where the conceptual rubber meets the road.

## 1. Scope of Executors — What I Mean

By "scope of executors," I mean: **what primitives does the planner agent know it can delegate work to?**

**Analogy: Hiring a Project Manager**

Imagine you hire a project manager (the planner agent) to break down a complex project. Before they can create a meaningful plan, they need to know:
- **Who's on the team?** (agents: `research-agent`, `writing-agent`)
- **What tools are available?** (tools: `web-search`, `database-query`, `calculator`)
- **Are there existing playbooks?** (workflows: `data-pipeline-workflow`, `review-cycle-workflow`)

If you don't tell them, they might plan around resources that don't exist ("we'll have the legal team review this" when there's no legal agent), or miss opportunities to use specialized resources you do have.

**Three options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **Static allowlist** | Hardcode what exists in this codebase (`nerAgent`, `genericAgent`, etc.) | Grounded in reality | Requires updating as you add primitives |
| **Dynamic input** | Pass allowlist as input to planner: `{ agents: [...], tools: [...] }` | Flexible, composable | Planner might not understand capabilities well |
| **Placeholder refs** | Use abstract names like `agent:researcher`, `tool:search` | Good for exploring decomposition patterns | Decoupled from reality, harder to validate mappability |

**My recommendation for now:** Start with **placeholder refs** while exploring decomposition patterns, then later add a "registry" that maps placeholders to actual implementations.

---

## 2. Dynamic Compilation — A Walkthrough

This is the crux of your exploration, so let me walk through concrete examples of how a PlanSpec could be "compiled" into something executable.

### The Core Challenge

Mastra workflows are **defined statically at build time** — you chain `.then()`, `.parallel()`, `.branch()` etc. in code. But your planner agent produces a **runtime data structure** (the PlanSpec). How do you bridge that gap?

### Approach A: Interpreter Pattern (No Code Generation)

Instead of generating a Mastra workflow, you build a **generic executor workflow** that interprets the PlanSpec at runtime.

```typescript
// Conceptual structure — the "interpreter"
const planExecutorWorkflow = createWorkflow({
  id: "plan-executor",
  inputSchema: z.object({ plan: zPlanSpec }),
  outputSchema: z.any(),
})
  .then(executeNextStepStep) // Looks at plan, finds ready steps, executes them
  .dountil(
    executeNextStepStep,
    async ({ inputData }) => inputData.allStepsComplete
  )
  .commit();
```

The `executeNextStepStep` would:
1. Look at the PlanSpec's DAG
2. Find steps whose dependencies are satisfied
3. Based on the step's `executor.kind`, dispatch to the right primitive
4. Mark step complete, loop

**Pros:** No code generation, single workflow handles any plan  
**Cons:** You lose Mastra's static schema validation, parallel execution requires manual orchestration

### Approach B: Template Workflows (Pre-defined Shapes)

Create a library of **workflow templates** that match common plan shapes, then match the PlanSpec to the right template.

```typescript
// Template: Sequential 3-step
const sequential3Template = createWorkflow({...})
  .then(step1Placeholder)
  .then(step2Placeholder)
  .then(step3Placeholder)
  .commit();

// Template: Fan-out/fan-in (parallel then merge)
const fanOutFanInTemplate = createWorkflow({...})
  .parallel([parallelStep1, parallelStep2])
  .then(mergeStep)
  .commit();

// Template: Foreach with aggregation
const foreachAggregateTemplate = createWorkflow({...})
  .foreach(processItemStep)
  .then(aggregateStep)
  .commit();
```

Then your "compiler" analyzes the PlanSpec topology and selects the matching template.

**Pros:** Uses real Mastra primitives, schema validation works  
**Cons:** Limited to pre-defined shapes, combinatorial explosion for complex plans

### Approach C: Hybrid — Generic Steps with Dynamic Dispatch

This is probably the most practical for your exploration. Create a workflow where **each step is a thin wrapper** that:
1. Reads its configuration from a shared state or context
2. Dispatches to the appropriate executor based on that config
3. Returns results in a normalized shape

```typescript
// A generic "dispatch" step that can become any executor
const createDispatchStep = (stepId: string) => createStep({
  id: stepId,
  inputSchema: z.object({
    planSpec: zPlanSpec,
    stepResults: z.record(z.any()), // results from prior steps
  }),
  outputSchema: z.object({
    stepResults: z.record(z.any()), // updated with this step's result
  }),
  execute: async ({ inputData, mastra }) => {
    const { planSpec, stepResults } = inputData;
    const stepConfig = planSpec.steps.find(s => s.id === stepId);
    
    // Dispatch based on executor kind
    let result;
    switch (stepConfig.executor.kind) {
      case "agent":
        const agent = mastra.getAgent(stepConfig.executor.ref);
        result = await agent.generate(/* ... */);
        break;
      case "tool":
        const tool = mastra.getTool(stepConfig.executor.ref);
        result = await tool.execute(/* ... */);
        break;
      case "transform":
        // Pure data transformation
        result = transformData(stepResults, stepConfig);
        break;
      // etc.
    }
    
    return {
      stepResults: { ...stepResults, [stepId]: result }
    };
  }
});
```

### Example: Walking Through a Simple Plan

Let's say the planner produces this PlanSpec:

```json
{
  "goalSummary": "Research TypeScript and Rust, then compare them",
  "requirements": [
    { "id": "req-1", "description": "Gather TypeScript info", "priority": "must" },
    { "id": "req-2", "description": "Gather Rust info", "priority": "must" },
    { "id": "req-3", "description": "Compare the two", "priority": "must" }
  ],
  "steps": [
    {
      "id": "research-ts",
      "description": "Research TypeScript",
      "dependsOn": [],
      "requirementIds": ["req-1"],
      "executor": { "kind": "agent", "ref": "research-agent" },
      "inputs": [{ "name": "topic", "description": "TypeScript" }],
      "outputs": [{ "name": "findings", "description": "Research results" }]
    },
    {
      "id": "research-rust",
      "description": "Research Rust",
      "dependsOn": [],
      "requirementIds": ["req-2"],
      "executor": { "kind": "agent", "ref": "research-agent" },
      "inputs": [{ "name": "topic", "description": "Rust" }],
      "outputs": [{ "name": "findings", "description": "Research results" }]
    },
    {
      "id": "compare",
      "description": "Compare TypeScript and Rust",
      "dependsOn": ["research-ts", "research-rust"],
      "requirementIds": ["req-3"],
      "executor": { "kind": "agent", "ref": "writing-agent" },
      "inputs": [
        { "name": "ts-findings", "description": "From research-ts" },
        { "name": "rust-findings", "description": "From research-rust" }
      ],
      "outputs": [{ "name": "comparison", "description": "Final comparison" }]
    }
  ],
  "unknowns": []
}
```

**Topology analysis:**
- `research-ts` and `research-rust` have no dependencies → can run in **parallel**
- `compare` depends on both → runs **after** the parallel block

**This maps to Mastra as:**
```typescript
workflow
  .parallel([researchTsStep, researchRustStep])
  .then(compareStep)
```

### For Your "Prove It Without Execution" Goal

You could create **stub executors** that return canned results:

```typescript
const stubAgent = new Agent({
  id: "stub-research-agent",
  name: "Stub Research Agent",
  instructions: "Return mock data",
  model: "openai/gpt-4.1-nano",
});

// Or even simpler — a tool that just returns static data
const stubResearchTool = createTool({
  id: "stub-research",
  description: "Returns mock research results",
  inputSchema: z.object({ topic: z.string() }),
  outputSchema: z.object({ findings: z.string() }),
  execute: async ({ inputData }) => ({
    findings: `Mock findings about ${inputData.topic}`
  }),
});
```

Then your workflow runs for real, the control flow executes (parallel, branching, etc.), but the "work" is trivial. This lets you prove:
- The plan topology is valid
- Data flows correctly between steps
- Branching conditions work
- The overall structure is sound

### Visual Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER GOAL                                 │
│  "Research TypeScript and Rust, compare them"                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PLANNER AGENT                                │
│  (structured output → PlanSpec)                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       PLAN SPEC (IR)                            │
│  {                                                               │
│    steps: [                                                      │
│      { id: "research-ts", dependsOn: [], executor: agent:... }  │
│      { id: "research-rust", dependsOn: [], executor: agent:... }│
│      { id: "compare", dependsOn: ["research-ts","research-rust"]}│
│    ]                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    VALIDATION           │     │    TOPOLOGY ANALYSIS    │
│  - DAG is acyclic       │     │  - Find parallel groups │
│  - All refs exist       │     │  - Find branch points   │
│  - Requirements covered │     │  - Find loops           │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW EXECUTION                            │
│  (with stub executors)                                          │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐                           │
│  │ research-ts  │    │ research-rust│   ← parallel              │
│  │ (stub: mock) │    │ (stub: mock) │                           │
│  └──────┬───────┘    └──────┬───────┘                           │
│         │                   │                                    │
│         └─────────┬─────────┘                                    │
│                   ▼                                              │
│           ┌──────────────┐                                       │
│           │   compare    │   ← sequential after parallel        │
│           │ (stub: mock) │                                       │
│           └──────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SCORING & EVALUATION                          │
│  - Did the workflow complete?                                   │
│  - Did data flow correctly?                                     │
│  - Did branching work as expected?                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Fixtures Location

Agreed — `src/mastra/fixtures/decomposition-prompts/` follows the existing pattern nicely.

---

## 4. v1 API

You're right, I double-checked the `package.json`:

```json
"@mastra/core": "1.0.0-beta.10",
"@mastra/evals": "1.0.0-beta.2",
```

So we're already on v1 beta. The existing `nerPeopleScorer` uses what looks like the v1 `createScorer` API. We should be good to build new scorers with the same patterns.

---

## 5. Proving the Concept with Stub Execution

Based on your clarification, here's what I'm now picturing:

### Phase 1: PlanSpec + Validation (No Execution)
- Define the `zPlanSpec` schema
- Build the planner agent (structured output → PlanSpec)
- Build deterministic validators (acyclicity, ref existence, coverage)
- Build scorers for plan quality
- Test with fixtures

### Phase 2: Stub Execution (Prove Control Flow)
- Create stub agents/tools that return static/simple results
- Build an "interpreter" step or workflow templates
- Run actual workflows with the stubs
- Verify: parallel runs in parallel, branches take correct path, loops terminate

### Phase 3: Real Execution (Future)
- Replace stubs with real executors
- Handle real data flow and error cases

---

## Follow-up Questions

Before I draft a more detailed implementation plan:

1. **Starting scope for control flow:** Should we start with just:
   - Sequential (`.then()`)
   - Parallel (`.parallel()`)
   - Branching (`.branch()`)
   
   And add loops (`.foreach()`, `.dountil()`) in a second iteration?

2. **Interpreter vs Templates:** For Phase 2 stub execution, do you have a preference between:
   - **Interpreter approach** (one generic workflow that reads the PlanSpec and dispatches dynamically)
   - **Template approach** (match plan topology to pre-built workflow shapes)
   - **Hybrid** (start with templates for simple cases, interpreter for complex)

3. **Planner agent model:** Should we use the same model as the existing agents (`openrouter/google/gemini-2.5-flash-lite`) or something else for the planner?

---

## User

OK very interesting. This checks out with some out-loud thinking I was doing with my colleague today. We imagined a few possible architectures

1. designer, (reviewer?) -> PLAN -> executor
    in this version, the plan designer lays out a pattern and strategy for tackling the goal (whatever it is), including specifying what must be done in sequence, vs can be done in parallel; plus control flow patterns such as branching, merging (judgement/picking/synthesizing of results), looping (iterative analysis, refinement), etc. We imagined there might want to be a "reviewer" or "verifiier" agent that gates whether the plan can move on for execution, and then an executor that runs it. I guess what one evaluates here is the sophistication of the plan, and its structural validity?
2. delegator -> worker -> evaluator
    this is more of a micro-scenario; but the idea here was something to do with how the steps actually get executed, and that within a step there could be a "delegator" who creates a task "spec" which defines not only what must be done but also how it should be evaluated, and that a "worker" and "evaluator" receive these two parts down-stream, respectively
3. a global check-in/review/accounting agent
    and finally, this idea was about having some kind of agent who works even above the level of the plan designer, to periodically evaluate how the plan is going (probably they would also be the "reviewer" mentioned above), by looking at the current state, the artifacts so far, and so on, and to judget this against the original specification of the overall goal. They could consider:
      - should we amend the plan, yes/no
        - yes: return to design
        - no: continue execution

Regarding the available sub-agents, if we assume for the moment that the domain of the goals that will be broken down here involve technical mathematical research, reasoning and development, we might have some sub-agents like:
- paper summarizer
- progress evaluator
- code explorer
- code writer
- ...etc;
I think we should just improvise a list of these things for now, pretend as if they exist, and provide the list to the planner to see which ones it assigns to which kind of task 

---

## Assistant

This is excellent framing! Your three-level architecture maps really well to what we've been discussing, and it clarifies the separation of concerns. Let me synthesize this:

## Architecture Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 3: SUPERVISOR / GLOBAL REVIEWER                                      │
│  "Are we on track? Should we amend the plan?"                               │
│                                                                             │
│  • Monitors overall progress against original goal                          │
│  • Can trigger re-planning if things go off-track                          │
│  • Periodic check-ins during long-running plans                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 2: PLAN DESIGNER + REVIEWER                                          │
│  "What's the strategy? Is the plan structurally sound?"                     │
│                                                                             │
│  • Designer: Decomposes goal → PlanSpec (our IR)                           │
│  • Reviewer: Validates plan structure, coverage, feasibility               │
│  • Loop: Design → Review → Revise (until approved)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LEVEL 1: STEP EXECUTION (Delegator → Worker → Evaluator)                   │
│  "How does each step actually get done?"                                    │
│                                                                             │
│  For each step in the plan:                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │  Delegator  │ →  │   Worker    │ →  │  Evaluator  │                     │
│  │ (task spec  │    │ (does the   │    │ (judges if  │                     │
│  │  + eval     │    │  work)      │    │  work meets │                     │
│  │  criteria)  │    │             │    │  criteria)  │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Insight: The "Spec" Concept at Multiple Levels

What I find compelling about your framing is that **every level produces a "spec"** that constrains the next level:

| Level | Producer | Spec | Consumer |
|-------|----------|------|----------|
| 3 → 2 | Supervisor | "Goal + Constraints" | Plan Designer |
| 2 → 1 | Plan Designer | "PlanSpec (IR)" | Step Executor |
| 1 internal | Delegator | "TaskSpec + EvalCriteria" | Worker + Evaluator |

This is recursive! The PlanSpec we've been designing is the Level 2 → Level 1 handoff. But within each step, there's a *micro-spec* (TaskSpec) that the Delegator creates for the Worker.

## Refined PlanSpec with Evaluation Criteria

Based on your delegator → worker → evaluator pattern, each step should include **how to evaluate** the result, not just **what to do**:

```typescript
const zPlanStep = z.object({
  id: z.string(),
  description: z.string(),
  dependsOn: z.array(z.string()),
  requirementIds: z.array(z.string()),
  
  // What the delegator specifies
  taskSpec: z.object({
    objective: z.string(),           // What the worker should accomplish
    inputs: z.array(zDataContract),  // What data it receives
    outputs: z.array(zDataContract), // What data it should produce
    constraints: z.array(z.string()).optional(), // Any constraints
  }),
  
  // How to evaluate the result
  evalCriteria: z.object({
    successCondition: z.string(),    // When is this step "done well"?
    failureCondition: z.string().optional(), // When should we retry/escalate?
    scoringRubric: z.array(z.object({
      dimension: z.string(),         // e.g., "completeness", "accuracy"
      weight: z.number(),            // 0-1
      description: z.string(),
    })).optional(),
  }),
  
  executor: zExecutor,
  controlFlow: zControlFlow.optional(),
});
```

## Domain-Specific Sub-Agents (Technical/Mathematical Research)

Here's an improvised list of sub-agents for the domain you mentioned:

```typescript
const availableAgents = {
  // Research & Discovery
  "paper-summarizer": {
    description: "Reads and summarizes academic papers, extracting key findings, methods, and relevance to a research question",
    capabilities: ["pdf-parsing", "citation-extraction", "concept-mapping"],
  },
  "literature-searcher": {
    description: "Searches academic databases and arxiv for relevant papers given a research topic or question",
    capabilities: ["query-formulation", "relevance-ranking"],
  },
  "concept-explainer": {
    description: "Explains mathematical or technical concepts at varying levels of depth and formality",
    capabilities: ["analogies", "formal-definitions", "examples"],
  },
  
  // Analysis & Reasoning
  "proof-checker": {
    description: "Verifies logical steps in mathematical proofs, identifies gaps or errors",
    capabilities: ["formal-logic", "step-validation"],
  },
  "hypothesis-generator": {
    description: "Given observations or partial results, generates plausible hypotheses to explore",
    capabilities: ["pattern-recognition", "conjecture-formulation"],
  },
  "progress-evaluator": {
    description: "Assesses current state of research against goals, identifies blockers and next steps",
    capabilities: ["gap-analysis", "prioritization"],
  },
  
  // Code & Implementation
  "code-explorer": {
    description: "Navigates and explains existing codebases, finds relevant implementations",
    capabilities: ["code-search", "dependency-analysis", "documentation-extraction"],
  },
  "code-writer": {
    description: "Implements algorithms, data structures, or experiments in code",
    capabilities: ["python", "typescript", "rust", "testing"],
  },
  "code-reviewer": {
    description: "Reviews code for correctness, efficiency, and adherence to specifications",
    capabilities: ["static-analysis", "complexity-analysis"],
  },
  
  // Synthesis & Communication
  "result-synthesizer": {
    description: "Combines findings from multiple sources into coherent summaries or conclusions",
    capabilities: ["comparison", "integration", "conflict-resolution"],
  },
  "technical-writer": {
    description: "Produces clear technical documentation, reports, or explanations",
    capabilities: ["structured-writing", "visualization-suggestions"],
  },
};
```

## Questions to Refine the Plan

### Q1: Scope for Initial Implementation

Given the three levels, I'm thinking we should focus on **Level 2 (Plan Design + Review)** first, since that's where your core exploration question lives: "can we get high-quality decomposition?"

Does this sound right, or do you want to tackle all three levels together?

```
Initial scope proposal:
├── Level 2: Plan Designer + Reviewer  ← FOCUS HERE
│   ├── PlanSpec schema (IR)
│   ├── Planner agent (goal → PlanSpec)
│   ├── Validator (structural checks)
│   ├── Scorers (quality evaluation)
│   └── Review loop workflow
│
├── Level 1: Stub execution            ← PROOF OF CONCEPT
│   └── Simple stubs to prove control flow works
│
└── Level 3: Supervisor                ← DEFER
    └── (add later once Level 2 is solid)
```

### Q2: Delegator-Worker-Evaluator at Step Level

For the Level 1 micro-pattern (delegator → worker → evaluator), should we:

**A) Bake it into every step** — Every step in the plan automatically gets this pattern:
```
step.execute() → 
  delegator.createTaskSpec() → 
  worker.execute(taskSpec) → 
  evaluator.judge(result, taskSpec.evalCriteria)
```

**B) Make it optional per step** — Some steps might be simple transforms that don't need evaluation, while complex steps get the full pattern.

**C) Treat it as a "step template"** — One of several execution patterns (simple, delegated, iterative-refinement, etc.)

### Q3: The Reviewer Agent

For the plan reviewer (gates whether plan can proceed to execution), what should it check?

Strawman list:
- **Structural validity**: DAG is acyclic, all refs exist
- **Requirement coverage**: Every requirement mapped to ≥1 step
- **Feasibility**: All specified agents/tools exist in the allowlist
- **Granularity**: Steps are neither too vague nor too atomic
- **Completeness**: No obvious gaps in the plan
- **Risk surfacing**: Assumptions and unknowns are explicitly called out

Should the reviewer also check for things like:
- Estimated complexity/cost?
- Potential parallelism opportunities?
- Redundant steps?

### Q4: Example Goal for First Test

For our first test fixture, I'd suggest a moderately complex goal in the technical research domain. Something like:

> "I want to understand how attention mechanisms evolved from the original Transformer paper to modern LLMs. Specifically: (1) summarize the key innovations in the original 2017 paper, (2) identify 3-4 major subsequent improvements to attention, (3) explain how these relate to each other chronologically, and (4) produce a visual timeline or diagram description."

This goal has:
- Multiple sub-tasks with natural parallelism (researching different papers)
- A synthesis step (relating them chronologically)
- A creative output step (the timeline)
- Clear success criteria

Does this feel like a good starting point, or would you prefer something simpler/different?

### Q5: How to Handle "Unknowns"

Your architecture mentions the supervisor checking if the plan should be amended. A related question: what should happen when the planner identifies unknowns (assumptions, missing info, clarification needed)?

Options:
- **Surface and proceed**: Include unknowns in PlanSpec, let execution handle them
- **Surface and block**: Require human input before proceeding
- **Surface and estimate**: Planner makes explicit assumptions, flags for later validation

---

Once you weigh in on these, I can draft a concrete implementation plan with file-by-file breakdown and test cases.

---

## User

I think your instincts are right.

Q1: focus on level 2
Q2: my instinct says "C". I think it's probably not the only pattern we'll discover
Q3: FTR I think we can consider the global supervisor and this "reviewer" to be the same role, since it's essentially the same application: (a) decide if the plan can proceed; (b) evaluate progress of plan, decide whether to interrupt and prompt for refinement/redirection
Q4: That's a good goal, but what we want to really test in this project is _research goals that lead through to development_. So for example, one of our real goals involves trying to figure out how to create a backend language and database that is 'natively' aligned with category-theoretical expressions. This goes from research tasks to software tasks, and _very importantly, it would also include a dimension of experimentation_. we want to look beyond planning procedures which create a linear flow, to ones that recognize that certain kinds of questions can only be answered through experiement-design and -execution. 

---

## Assistant

This is a crucial clarification! The distinction between:

1. **Linear planning** (research → synthesize → write → done)
2. **Experimental planning** (hypothesize → design experiment → execute → evaluate → iterate/pivot)

...is fundamental. The second pattern requires the plan to express **uncertainty about what the right answer even is**, and to include cycles of hypothesis-testing.

## Revised Mental Model

Your category-theory database example is perfect because it illustrates a common real-world pattern:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GOAL: "Create a backend language/DB natively aligned with CT expressions"  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌───────────────────┐       ┌─────────────────┐
│  RESEARCH     │         │  EXPERIMENTATION  │       │  DEVELOPMENT    │
│  PHASE        │         │  PHASE            │       │  PHASE          │
├───────────────┤         ├───────────────────┤       ├─────────────────┤
│ • What exists?│         │ • Can X work?     │       │ • Build it      │
│ • What's been │         │ • How does Y      │       │ • Test it       │
│   tried?      │         │   perform?        │       │ • Document it   │
│ • What are    │         │ • What tradeoffs? │       │                 │
│   the open    │         │                   │       │                 │
│   questions?  │         │                   │       │                 │
└───────────────┘         └───────────────────┘       └─────────────────┘
        │                           │                           │
        │         ◄─────────────────┤                           │
        │         (results inform   │                           │
        │          new research)    │                           │
        │                           │◄──────────────────────────┤
        │                           │ (implementation reveals   │
        │                           │  new questions)           │
        └───────────────────────────┴───────────────────────────┘
                    (non-linear! cycles and pivots)
```

## Key Insight: "Experiment" as a First-Class Concept

The PlanSpec needs to distinguish between:

| Step Type | Characteristics | Example |
|-----------|-----------------|---------|
| **Research** | Answer is "out there", gather/synthesize | "Survey existing CT-based query languages" |
| **Transform** | Deterministic, known input → output | "Convert bibliography to citation format" |
| **Synthesis** | Combine known pieces into new whole | "Write comparison of approaches A, B, C" |
| **Experiment** | Answer is **unknown**, must be discovered empirically | "Prototype a functor-based query, measure expressiveness vs SQL" |
| **Development** | Build a thing based on known spec | "Implement the morphism compositor" |

The **Experiment** type is special because:
- It has a **hypothesis** (what we think might be true)
- It has **success/failure criteria** (how we'll know)
- It has **possible outcomes** that branch the plan
- The outcome might **invalidate earlier assumptions**

## Extended PlanSpec Schema for Experiments

```typescript
// A hypothesis to be tested
const zHypothesis = z.object({
  id: z.string(),
  statement: z.string(),           // "Functor composition can express JOINs more naturally than SQL"
  assumptions: z.array(z.string()), // What we're taking for granted
  testableVia: z.string(),         // How we'd know if it's true/false
});

// An experiment step (distinct from regular steps)
const zExperimentStep = z.object({
  id: z.string(),
  type: z.literal("experiment"),
  description: z.string(),
  hypothesisIds: z.array(z.string()), // Which hypotheses this tests
  
  // Experiment design
  design: z.object({
    setup: z.string(),              // What needs to be prepared
    procedure: z.string(),          // What we'll do
    measurements: z.array(z.string()), // What we'll observe/measure
    controlConditions: z.array(z.string()).optional(),
  }),
  
  // Possible outcomes and their implications
  outcomes: z.array(z.object({
    id: z.string(),
    condition: z.string(),          // "If execution time < 100ms"
    interpretation: z.string(),     // "Hypothesis supported"
    nextSteps: z.array(z.string()), // Step IDs to enable/proceed to
    invalidates: z.array(z.string()).optional(), // Step IDs to skip/cancel
  })),
  
  executor: zExecutor,
  dependsOn: z.array(z.string()),
});

// The full plan now includes hypotheses and distinguishes step types
const zPlanSpec = z.object({
  goalSummary: z.string(),
  requirements: z.array(zRequirement),
  hypotheses: z.array(zHypothesis),  // NEW: explicit hypotheses
  
  steps: z.array(z.discriminatedUnion("type", [
    zResearchStep,
    zTransformStep,
    zSynthesisStep,
    zExperimentStep,   // NEW
    zDevelopmentStep,
  ])),
  
  // Explicit decision points where plan might branch
  decisionPoints: z.array(z.object({
    id: z.string(),
    afterStepId: z.string(),
    question: z.string(),           // "Did the prototype meet latency requirements?"
    options: z.array(z.object({
      condition: z.string(),
      consequence: z.string(),      // "Proceed to full implementation" | "Revisit architecture"
      enablesStepIds: z.array(z.string()),
      disablesStepIds: z.array(z.string()),
    })),
  })),
  
  unknowns: z.array(zUnknown),
  allowedExecutors: z.object({...}).optional(),
});
```

## Example Goal Breakdown: Category-Theory Database

Let me sketch how a planner might decompose your real goal:

```yaml
goalSummary: |
  Create a backend language and database natively aligned with 
  category-theoretical expressions

requirements:
  - id: req-1
    description: Understand existing CT-based data modeling approaches
    priority: must
  - id: req-2  
    description: Identify what "native alignment" means operationally
    priority: must
  - id: req-3
    description: Prototype core abstractions (objects, morphisms, functors)
    priority: must
  - id: req-4
    description: Evaluate expressiveness vs traditional approaches
    priority: must
  - id: req-5
    description: Determine feasibility of performant implementation
    priority: must

hypotheses:
  - id: hyp-1
    statement: |
      Category-theoretic primitives (objects, morphisms, functors) can serve 
      as the foundational data model with acceptable query performance
    assumptions:
      - Morphism composition can be computed efficiently
      - Natural transformations map to useful query patterns
    testableVia: |
      Prototype benchmark comparing CT-query to equivalent SQL on standard ops

  - id: hyp-2
    statement: |
      Functor-based schema migrations preserve data integrity more naturally 
      than traditional migration scripts
    assumptions:
      - Functors between schemas can be automatically derived in common cases
    testableVia: |
      Implement 3 common migration patterns, compare correctness guarantees

steps:
  # RESEARCH PHASE
  - id: survey-ct-databases
    type: research
    description: Survey existing category-theory-based database projects
    taskSpec:
      objective: Find and summarize existing CT database implementations
      inputs: []
      outputs: [{name: survey-report, description: Summary of 5-10 relevant projects}]
    evalCriteria:
      successCondition: Report covers major approaches with pros/cons
    executor: {kind: agent, ref: literature-searcher}
    dependsOn: []
    requirementIds: [req-1]

  - id: survey-ct-pl
    type: research
    description: Survey CT-based programming language designs
    taskSpec:
      objective: Find languages that embed CT concepts natively
      outputs: [{name: pl-survey, description: Analysis of relevant PLs}]
    executor: {kind: agent, ref: literature-searcher}
    dependsOn: []
    requirementIds: [req-1]

  # SYNTHESIS (after parallel research)
  - id: synthesize-approaches
    type: synthesis
    description: Synthesize findings into candidate design directions
    taskSpec:
      objective: Identify 2-3 promising architectural approaches
      inputs: 
        - {name: survey-report, from: survey-ct-databases}
        - {name: pl-survey, from: survey-ct-pl}
      outputs: [{name: design-candidates, description: 2-3 candidate architectures}]
    executor: {kind: agent, ref: result-synthesizer}
    dependsOn: [survey-ct-databases, survey-ct-pl]
    requirementIds: [req-2]

  # EXPERIMENT PHASE
  - id: prototype-core-model
    type: experiment
    description: Prototype the core CT data model primitives
    hypothesisIds: [hyp-1]
    design:
      setup: Implement Object, Morphism, Functor types in TypeScript
      procedure: |
        1. Model a simple domain (e.g., users/posts) using CT primitives
        2. Implement composition and identity
        3. Write equivalent SQL schema
        4. Compare expressiveness of queries
      measurements:
        - Lines of code for equivalent operations
        - Types of queries expressible in each
        - Compilation/type-checking time
    outcomes:
      - id: outcome-promising
        condition: CT model expresses all SQL queries with ≤1.5x verbosity
        interpretation: Core model viable, proceed to performance testing
        nextSteps: [benchmark-performance]
      - id: outcome-too-verbose
        condition: CT model requires >2x verbosity for common queries
        interpretation: Abstraction level wrong, need to revisit
        nextSteps: [revisit-abstraction-level]
        invalidates: [benchmark-performance]
    executor: {kind: agent, ref: code-writer}
    dependsOn: [synthesize-approaches]
    requirementIds: [req-3]

  - id: benchmark-performance
    type: experiment
    description: Benchmark CT-query performance against SQL baseline
    hypothesisIds: [hyp-1]
    design:
      setup: Use prototype from previous step, add timing instrumentation
      procedure: Run standard query patterns, measure latency
      measurements: [p50 latency, p99 latency, memory usage]
    outcomes:
      - id: perf-acceptable
        condition: Latency within 3x of raw SQL for 80% of queries
        interpretation: Performance feasible with optimization
        nextSteps: [design-optimization-strategy, proceed-to-implementation]
      - id: perf-unacceptable
        condition: Latency >10x SQL baseline
        interpretation: Fundamental performance issue
        nextSteps: [investigate-performance-blockers]
    executor: {kind: agent, ref: code-writer}
    dependsOn: [prototype-core-model]
    requirementIds: [req-5]

  # CONTINGENT STEPS (enabled/disabled by experiment outcomes)
  - id: revisit-abstraction-level
    type: research
    description: Re-examine abstraction level based on verbosity findings
    # ... only runs if prototype-core-model has outcome-too-verbose

  - id: investigate-performance-blockers
    type: research  
    description: Deep-dive into what's causing performance issues
    # ... only runs if benchmark-performance has perf-unacceptable

  # DEVELOPMENT PHASE (contingent on successful experiments)
  - id: proceed-to-implementation
    type: development
    description: Full implementation of the CT-native database core
    # ... only runs if experiments succeed

decisionPoints:
  - id: decision-after-prototype
    afterStepId: prototype-core-model
    question: Is the core abstraction model viable?
    options:
      - condition: Expressiveness acceptable
        consequence: Proceed to performance benchmarking
        enablesStepIds: [benchmark-performance]
        disablesStepIds: [revisit-abstraction-level]
      - condition: Expressiveness unacceptable
        consequence: Revisit abstraction design
        enablesStepIds: [revisit-abstraction-level]
        disablesStepIds: [benchmark-performance]
```

## Questions to Finalize the Design

### Q1: Step Type Taxonomy

Does this taxonomy feel right?
- **Research**: Gather/find existing knowledge
- **Synthesis**: Combine findings into new understanding
- **Experiment**: Test hypothesis empirically
- **Development**: Build based on known spec
- **Transform**: Pure data manipulation

Or are there other types you'd want to distinguish?

### Q2: Hypothesis Tracking

Should hypotheses be:
- **Explicit in the PlanSpec** (as I've shown above) — makes the scientific structure visible
- **Implicit in experiment steps** — simpler schema, hypothesis is just part of the experiment description
- **Both** — top-level hypotheses that experiments reference

### Q3: Decision Points vs Branching

I've separated "decision points" (explicit moments where the plan might pivot) from control-flow "branching" (conditional execution within a step). Does this distinction make sense, or should they be unified?

### Q4: The Supervisor's Role in Experiments

When an experiment completes with an unexpected outcome, who decides what to do?
- **Pre-specified**: The plan explicitly defines what to do for each outcome (as shown above)
- **Supervisor decides**: The supervisor agent evaluates the outcome and chooses next steps
- **Human-in-the-loop**: Flag for human decision on pivotal outcomes

### Q5: Available Agents for This Domain

Given your CT-database example, should I refine the agent list? Current draft:

```typescript
const researchAgents = [
  "literature-searcher",   // Find papers, projects
  "paper-summarizer",      // Digest academic content
  "concept-explainer",     // Explain CT concepts
];

const analysisAgents = [
  "hypothesis-generator",  // Generate testable hypotheses
  "progress-evaluator",    // Assess where we are vs goal
  "result-synthesizer",    // Combine findings
];

const implementationAgents = [
  "code-explorer",         // Navigate existing codebases
  "code-writer",           // Write new code
  "code-reviewer",         // Review for correctness
  "experiment-designer",   // Design experimental procedures (NEW?)
];
```

Should I add/remove/rename any of these?

---

Once you confirm these design choices, I'll draft the full implementation plan with:
1. Schema definitions (with experiment support)
2. Planner agent prompts
3. Validator logic
4. Scorer definitions
5. Test fixtures (including your CT-database goal)

---

## User

This is getting good! 

Q1: "Research, Synthesis, Experiment, Development, Transform" sounds about right; let me expand a bit:

- "Research" seems open to parallelization
- "Synthesize" might be working with multiple research results, and may need multiple forms for doing this, such as choosing best candidate, or merging acceptable candidates, etc.
- "Hypothesize" may be a distinct setp before "Experiment"?
- "Experiment" also seems open to parallelization; and something like "Assessment" or "Synthesize" should again follow after it
- "Development" and "Transform" sound more task-oriented or tactical to me; might be a part of an "Experiment" step for example, as needed

Q2: I think "Both" (that was my instinct, above)

Q3: "Decision points vs Branching" seems to me to point at an essential question of the implementation, which is whether the control flow can be completely dynamic. Branching is a control-flow structure which is defined up-front, whereas "Decision" sounds more like "if I'm not satisfied with the outcome at this point I might need to dynamically generate new steps" and I'm not sure if we might run in to the boundaries of Mastra with the latter

Q4: I think the answer here is clearly one of the latter two. if we're acknowledging from the start that some parts are unknown, we need to define our expected outcomes typologically rather than literally

Q5: those agents sound good! I think we'll discover as we go, what we need 

---

## Assistant

Excellent refinements! Let me synthesize where we've landed and address the key implementation question you raised about dynamic control flow.

## Refined Step Type Taxonomy

Based on your feedback:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STRATEGIC / PLANNING STEPS                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Research      │ Gather existing knowledge (parallelizable)                 │
│  Hypothesize   │ Generate testable hypotheses from findings                 │
│  Synthesize    │ Combine results (choose-best, merge, compare, etc.)        │
│  Assess        │ Evaluate outcomes against criteria, inform next decision   │
├─────────────────────────────────────────────────────────────────────────────┤
│  EXECUTION / TACTICAL STEPS (often nested within strategic steps)           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Experiment    │ Test hypothesis empirically (parallelizable)               │
│  Develop       │ Build/implement something                                  │
│  Transform     │ Pure data manipulation                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

And the **Synthesize** step now has sub-types:

```typescript
const zSynthesisMode = z.enum([
  "choose-best",      // Pick one from multiple candidates
  "merge",            // Combine acceptable candidates into one
  "compare",          // Produce comparison without choosing
  "integrate",        // Weave findings into coherent narrative
  "distill",          // Extract core insights, discard noise
]);
```

## The Critical Question: Dynamic Control Flow in Mastra

You've hit on something important. Let me explore the boundaries:

### What Mastra Supports (Static)

Mastra workflows are **defined at build time**. The control flow primitives:

```typescript
.then(step)           // Sequential
.parallel([a, b, c])  // Fixed parallel set
.branch([             // Conditions evaluated at runtime, but branches defined statically
  [condition1, stepA],
  [condition2, stepB],
])
.dountil(step, cond)  // Loop with runtime condition
.dowhile(step, cond)  // Loop with runtime condition
.foreach(step)        // Iterate over runtime array
```

The **conditions** are dynamic (evaluated at runtime), but the **structure** is static (what steps exist, what branches are possible).

### What Mastra Doesn't Support (Dynamic)

```typescript
// ❌ Can't do this: dynamically generate new steps at runtime
.then(async ({ inputData }) => {
  if (needsMoreResearch(inputData)) {
    return createNewStep({ id: "additional-research-" + Date.now(), ... });
  }
})
```

### Implications for Our Design

This means we have a spectrum of approaches:

| Approach | Description | Mastra Fit |
|----------|-------------|------------|
| **Fully Static Plan** | All steps and branches defined upfront | ✅ Perfect fit |
| **Static with Runtime Conditions** | Steps defined upfront, conditions evaluated at runtime | ✅ Good fit |
| **Bounded Dynamism** | Pre-define a "library" of possible steps, enable/disable at runtime | ⚠️ Workable |
| **Fully Dynamic** | Generate new steps at runtime based on outcomes | ❌ Requires interpreter |

### Proposed Solution: Hybrid Architecture

I think we need **two modes** of execution:

**Mode 1: Compiled Workflow (for well-understood plans)**
- When the planner produces a plan with known structure
- Compile PlanSpec → static Mastra workflow
- Use `.branch()` for decision points with pre-defined options

**Mode 2: Interpreter Loop (for exploratory plans)**
- When the plan might need runtime modification
- Use a `dountil` loop with a supervisor step
- Each iteration: supervisor evaluates state, picks next action from a menu
- Can "inject" new hypotheses/experiments by adding to state

```typescript
// Mode 2: Interpreter pattern
const exploratoryWorkflow = createWorkflow({
  id: "exploratory-research",
  inputSchema: z.object({ 
    goal: z.string(),
    initialPlan: zPlanSpec,
  }),
  outputSchema: z.object({ 
    finalState: z.any(),
    completedSteps: z.array(z.string()),
    outcome: z.string(),
  }),
})
  .then(initializeStateStep)
  .dountil(
    supervisorIterationStep,  // Supervisor picks next action, executes it, updates state
    async ({ inputData }) => inputData.isComplete || inputData.iterations > 20
  )
  .then(finalizeStep)
  .commit();
```

The `supervisorIterationStep` would:
1. Look at current state (completed steps, findings, open hypotheses)
2. Decide: continue plan as-is? Modify plan? Add new hypothesis? Conclude?
3. Execute the chosen action
4. Update state
5. Return to loop

This gives us **bounded dynamism** — the supervisor can effectively "replan" within the loop, but the loop structure itself is static.

### Decision Point Types

Given this, I'd propose three types of "what happens next" logic:

```typescript
const zDecisionType = z.discriminatedUnion("type", [
  // Type 1: Pre-defined branching (static structure, runtime condition)
  z.object({
    type: z.literal("branch"),
    conditions: z.array(z.object({
      condition: z.string(),
      thenStepId: z.string(),
    })),
    defaultStepId: z.string().optional(),
  }),
  
  // Type 2: Supervisor decision (bounded dynamism)
  z.object({
    type: z.literal("supervisor-decision"),
    question: z.string(),
    possibleActions: z.array(z.object({
      id: z.string(),
      description: z.string(),
      enablesStepIds: z.array(z.string()).optional(),
      disablesStepIds: z.array(z.string()).optional(),
      triggersReplanning: z.boolean().optional(),  // If true, supervisor can add steps
    })),
  }),
  
  // Type 3: Human-in-the-loop (suspend workflow, await input)
  z.object({
    type: z.literal("human-decision"),
    question: z.string(),
    options: z.array(z.string()),
    timeout: z.string().optional(),  // e.g., "24h"
  }),
]);
```

## Updated Schema Structure

Based on everything we've discussed:

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
  status: z.enum(["untested", "testing", "supported", "refuted", "inconclusive"]).default("untested"),
});

// === DATA CONTRACTS ===
const zDataContract = z.object({
  name: z.string(),
  description: z.string(),
  fromStepId: z.string().optional(),  // Where this data comes from
});

// === EVALUATION CRITERIA ===
const zEvalCriteria = z.object({
  successCondition: z.string(),
  failureCondition: z.string().optional(),
  dimensions: z.array(z.object({
    name: z.string(),
    weight: z.number().min(0).max(1),
    description: z.string(),
  })).optional(),
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
  query: z.string(),  // What are we trying to find out?
});

const zHypothesizeStep = zBaseStep.extend({
  type: z.literal("hypothesize"),
  basedOn: z.array(z.string()),  // Step IDs whose outputs inform this
  targetUnknowns: z.array(z.string()),  // What questions are we trying to answer?
});

const zSynthesizeStep = zBaseStep.extend({
  type: z.literal("synthesize"),
  mode: zSynthesisMode,
  inputStepIds: z.array(z.string()),  // Which steps' outputs to synthesize
});

const zExperimentStep = zBaseStep.extend({
  type: z.literal("experiment"),
  hypothesisIds: z.array(z.string()),
  design: z.object({
    setup: z.string(),
    procedure: z.string(),
    measurements: z.array(z.string()),
  }),
  possibleOutcomes: z.array(z.object({
    id: z.string(),
    condition: z.string(),
    interpretation: z.string(),
    hypothesisEffect: z.object({
      hypothesisId: z.string(),
      newStatus: z.enum(["supported", "refuted", "inconclusive"]),
    }).optional(),
  })),
});

const zAssessStep = zBaseStep.extend({
  type: z.literal("assess"),
  evaluating: z.array(z.string()),  // Step IDs to assess
  againstCriteria: z.array(z.string()),  // Requirement IDs or hypothesis IDs
});

const zDevelopStep = zBaseStep.extend({
  type: z.literal("develop"),
  specification: z.string(),
  deliverables: z.array(z.string()),
});

const zTransformStep = zBaseStep.extend({
  type: z.literal("transform"),
  transformation: z.string(),  // Description of the transformation
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

// === DECISION POINTS ===
const zDecisionPoint = z.object({
  id: z.string(),
  afterStepId: z.string(),
  question: z.string(),
  decisionType: zDecisionType,  // branch | supervisor-decision | human-decision
});

// === UNKNOWNS ===
const zUnknown = z.object({
  id: z.string(),
  type: z.enum(["assumption", "missing-input", "clarification-needed", "risk", "open-question"]),
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
  estimatedComplexity: z.enum(["low", "medium", "high", "very-high"]).optional(),
  suggestedExecutionMode: z.enum(["compiled", "interpreted"]).optional(),
  
  // Allowlist of available primitives (optional, for validation)
  availableExecutors: z.object({
    agents: z.array(z.string()),
    tools: z.array(z.string()),
    workflows: z.array(z.string()),
  }).optional(),
});

export type PlanSpec = z.infer<typeof zPlanSpec>;
```

## Implementation Plan Overview

Here's what I'm envisioning for the implementation:

```
apps/hash-ai-agent/src/mastra/
├── schemas/
│   └── plan-spec.ts                    # The PlanSpec IR schema (above)
│
├── agents/
│   ├── planner-agent.ts                # Decomposes goal → PlanSpec
│   └── supervisor-agent.ts             # Reviews plans, makes decisions
│
├── workflows/
│   ├── planning-workflow.ts            # Goal → PlanSpec (with review loop)
│   └── interpreted-execution-workflow.ts # For exploratory/dynamic plans
│
├── scorers/
│   ├── plan-structure-scorer.ts        # DAG validity, ref existence
│   ├── plan-coverage-scorer.ts         # Requirements coverage
│   ├── plan-hypothesis-scorer.ts       # Hypotheses are testable
│   └── plan-granularity-scorer.ts      # Steps neither too vague nor atomic
│
├── tools/
│   ├── plan-validator.ts               # Deterministic structural validation
│   └── plan-topology-analyzer.ts       # Identify parallel groups, branches
│
├── fixtures/
│   └── decomposition-prompts/
│       ├── simple-sequential.ts        # Basic linear flow
│       ├── parallel-research.ts        # Multiple independent research tasks
│       ├── hypothesis-experiment.ts    # Research → hypothesize → experiment
│       ├── ct-database-goal.ts         # Your real example
│       └── expected-outputs/           # Expected PlanSpec shapes for validation
│
└── constants.ts                        # Available agents list, etc.
```

## Questions Before Finalizing

### Q1: Execution Mode Selection

Should the planner explicitly recommend an execution mode (`compiled` vs `interpreted`), or should that be determined by analyzing the plan structure?

Criteria that might suggest `interpreted`:
- Many decision points with `supervisor-decision` type
- Hypotheses with uncertain outcomes
- Steps that might trigger replanning

### Q2: Stub Executors for Phase 1

For proving the concept without real execution, should I plan for:

**A) Fully static stubs** — Each stub agent returns the same canned response
```typescript
execute: async () => ({ findings: "Mock research findings about topic X" })
```

**B) Template-based stubs** — Stubs return responses based on input
```typescript
execute: async ({ inputData }) => ({ 
  findings: `Mock findings about ${inputData.topic}` 
})
```

**C) LLM-minimal stubs** — Stubs make a single cheap LLM call to generate plausible-looking output
```typescript
execute: async ({ inputData }) => {
  const response = await cheapModel.generate(`Generate brief mock findings about: ${inputData.topic}`);
  return { findings: response.text };
}
```

### Q3: Test Fixture Depth

For the CT-database goal fixture, should I:
- Just provide the input goal (let the planner generate the plan)
- Provide both input goal AND expected PlanSpec (for comparison/scoring)
- Provide multiple valid PlanSpecs (since there's no single "right" decomposition)

### Q4: Supervisor Agent Scope

For Phase 1, should the supervisor:
- Only validate/review plans (simpler)
- Also make runtime decisions during interpreted execution (more complex)

My instinct is to start with just plan review, and add runtime decision-making when we get to interpreted execution.

---

Let me know your thoughts on these, and I can then produce a detailed file-by-file implementation plan with specific code structures for each component.

---

## User

Q1: I think 'interpreted'
Q2: let's start with B, and maybe later do C
Q3: I think the expectation for the PlanSpec is probably going to have to be evaluated by an LLM judge, unlesss it's just about validating it structurally
Q4: let's have the supervisor just validate before kickoff for now

I'll add one more thought re: dynamism (though I think we can leave this for later), which I think resonates with some of what you outlined, namely that it occured to me that full dynamism might possibly be achievable as a kind of "workflow within the workflow", where the build-time Mastra worklow is mainly a loop, and the run-time dynamic workflow is a deterministic step function (or an agent, with a minimum of tools) that modifies the workflow's state object on each run of the loop and possibly hooks in to custom events somehow, so as to be able to trigger Mastra's workflow status streaming 

---

## Assistant

Your insight about "workflow within workflow" is exactly right! That's essentially the interpreter pattern I sketched — a static Mastra `dountil` loop where the loop body is a step function that reads/modifies state and decides what to do next. The Mastra workflow provides the execution scaffold, and the dynamic logic lives in the state transitions.

## Consolidated Design Summary

Let me crystallize where we've landed:

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PLANNING PHASE (our focus)                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Planner    │ ──▶ │  Validator   │ ──▶ │  Supervisor  │                │
│  │   Agent      │     │  (structural)│     │  (approval)  │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│    Goal → PlanSpec     Check structure      Approve/Reject                 │
│    (structured output) (deterministic)      (LLM judge)                    │
│                                                                             │
│  Loop until approved or max attempts                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXECUTION PHASE (stub implementation for proof-of-concept)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Interpreted execution: dountil loop where each iteration:                  │
│  1. Reads current state (completed steps, pending steps, findings)          │
│  2. Step function picks next action based on plan topology                  │
│  3. Executes via stub (template-based mock output)                          │
│  4. Updates state                                                           │
│  5. Checks: all steps done? decision point reached? max iterations?         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution mode | Interpreted | Supports dynamism, single workflow handles any plan shape |
| Stub executors | Template-based (B) | Plausible outputs without LLM cost, upgradeable later |
| Plan evaluation | LLM judge + structural validation | No single "correct" decomposition |
| Supervisor scope | Pre-kickoff validation only | Simpler for Phase 1 |
| Step types | Research, Hypothesize, Synthesize, Experiment, Assess, Develop, Transform | Captures R&D workflow patterns |
| Hypotheses | Explicit top-level + referenced by experiments | Makes scientific structure visible |
| Decision points | Typed (branch / supervisor-decision / human-decision) | Distinguishes static vs dynamic control flow |

### Available Agents (Placeholder List)

```typescript
export const AVAILABLE_AGENTS = {
  // Research & Discovery
  "literature-searcher": "Searches academic databases for relevant papers",
  "paper-summarizer": "Reads and summarizes academic papers",
  "concept-explainer": "Explains technical concepts at varying depths",
  
  // Analysis & Reasoning
  "hypothesis-generator": "Generates testable hypotheses from findings",
  "progress-evaluator": "Assesses current state against goals",
  "result-synthesizer": "Combines findings (choose-best, merge, compare, etc.)",
  
  // Implementation
  "code-explorer": "Navigates and explains existing codebases",
  "code-writer": "Implements algorithms and experiments",
  "code-reviewer": "Reviews code for correctness",
  "experiment-designer": "Designs experimental procedures",
} as const;
```

---

## Implementation Plan

### File Structure

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
│       └── ct-database-goal.ts         # Your real example
│
└── constants.ts                        # Available agents, models, etc.
```

### Phase 1: Schema & Validation (Read-only exploration first)

**1. `schemas/plan-spec.ts`**
- Full PlanSpec schema as outlined above
- Exported types for TypeScript inference
- Helper validators (e.g., `isValidStepRef`, `isAcyclic`)

**2. `tools/plan-validator.ts`**
- Deterministic checks:
  - All `dependsOn` refs point to existing step IDs
  - All `executor.ref` values are in available agents list
  - DAG is acyclic (topological sort succeeds)
  - All `hypothesisIds` in experiment steps point to existing hypotheses
  - All `requirementIds` point to existing requirements
- Returns: `{ valid: boolean, errors: string[] }`

**3. `tools/topology-analyzer.ts`**
- Analyze plan structure:
  - Identify parallelizable step groups (steps with same dependencies)
  - Identify decision points and their downstream effects
  - Compute critical path
  - Detect potential bottlenecks
- Returns: `{ parallelGroups: string[][], decisionPoints: {...}[], criticalPath: string[] }`

### Phase 2: Agents & Planning Workflow

**4. `agents/planner-agent.ts`**
- Instructions that explain:
  - Available step types and when to use each
  - Available agents and their capabilities
  - How to structure hypotheses and experiments
  - How to identify parallelization opportunities
- Uses structured output with `zPlanSpec` schema
- System prompt includes available agents list

**5. `agents/supervisor-agent.ts`**
- Reviews plans for:
  - Feasibility (can this actually be done?)
  - Completeness (does it address the full goal?)
  - Coherence (do the steps make sense together?)
  - Risk awareness (are unknowns properly surfaced?)
- Returns: `{ approved: boolean, feedback: string, suggestedChanges?: string[] }`

**6. `workflows/planning-workflow.ts`**
```typescript
createWorkflow({
  id: "planning-workflow",
  inputSchema: z.object({ 
    goal: z.string(), 
    context: z.string().optional() 
  }),
  outputSchema: z.object({
    plan: zPlanSpec,
    validationResult: z.object({ valid: z.boolean(), errors: z.array(z.string()) }),
    supervisorApproval: z.object({ approved: z.boolean(), feedback: z.string() }),
  }),
})
  .then(extractRequirementsStep)
  .then(generatePlanStep)
  .then(validatePlanStep)
  .branch([
    [async ({ inputData }) => !inputData.validationResult.valid, reviseForStructureStep],
    [async ({ inputData }) => inputData.validationResult.valid, supervisorReviewStep],
  ])
  .dountil(
    revisionLoopStep,
    async ({ inputData }) => inputData.approved || inputData.attempts >= 3
  )
  .commit();
```

### Phase 3: Stub Execution (Proof of Concept)

**7. `steps/execution/stub-executors.ts`**
```typescript
// Template-based stubs that return plausible mock outputs
export const stubExecutors: Record<string, StubExecutor> = {
  "literature-searcher": async ({ inputs }) => ({
    findings: `Found 5 relevant papers on "${inputs.topic}": [Paper1], [Paper2], ...`,
    paperCount: 5,
  }),
  "paper-summarizer": async ({ inputs }) => ({
    summary: `Summary of "${inputs.paperTitle}": Key findings include X, Y, Z...`,
    keyPoints: ["Point 1", "Point 2", "Point 3"],
  }),
  "hypothesis-generator": async ({ inputs }) => ({
    hypotheses: [
      { statement: `Based on findings, we hypothesize that...`, confidence: 0.7 },
    ],
  }),
  // ... etc for each agent
};
```

**8. `steps/execution/interpreter-step.ts`**
- The core loop body that:
  - Reads execution state (what's done, what's pending, current findings)
  - Uses topology analyzer to find "ready" steps (dependencies satisfied)
  - Executes ready steps via stub executors
  - Updates state with results
  - Checks for decision points
- Returns updated state

**9. `workflows/stub-execution-workflow.ts`**
```typescript
createWorkflow({
  id: "stub-execution",
  inputSchema: z.object({ plan: zPlanSpec }),
  outputSchema: z.object({
    completedSteps: z.array(z.string()),
    stepResults: z.record(z.any()),
    finalState: z.any(),
  }),
})
  .then(initializeExecutionStateStep)
  .dountil(
    interpreterStep,
    async ({ inputData }) => inputData.allStepsComplete || inputData.iterations > 50
  )
  .then(finalizeExecutionStep)
  .commit();
```

### Phase 4: Scorers & Evaluation

**10. `scorers/plan-structure-scorer.ts`** (deterministic)
- Uses `plan-validator.ts` under the hood
- Score = (checks passed) / (total checks)

**11. `scorers/plan-coverage-scorer.ts`** (deterministic)
- Score = (requirements with ≥1 mapped step) / (total requirements)

**12. `scorers/plan-testability-scorer.ts`** (LLM judge)
- For each hypothesis, judge whether `testableVia` is actually testable
- Score = average testability across hypotheses

**13. `scorers/plan-granularity-scorer.ts`** (LLM judge)
- Judge whether steps are appropriately scoped (not too vague, not too atomic)
- Score = average appropriateness across steps

### Phase 5: Test Fixtures

**14. `fixtures/decomposition-prompts/ct-database-goal.ts`**
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
    expectedStepTypes: ["research", "hypothesize", "experiment", "assess", "develop"],
  },
};
```

---

## Evaluation Strategy

Since there's no single "correct" decomposition, evaluation will be multi-dimensional:

| Scorer | Type | What it measures |
|--------|------|------------------|
| `plan-structure` | Deterministic | DAG valid, refs exist, no orphans |
| `plan-coverage` | Deterministic | All requirements addressed |
| `plan-testability` | LLM judge | Hypotheses can actually be tested |
| `plan-granularity` | LLM judge | Steps appropriately scoped |
| `plan-coherence` | LLM judge | Steps make sense together |
| `plan-completeness` | LLM judge | No obvious gaps for the goal |

The overall evaluation would combine these with configurable weights.

---

## Questions Before Proceeding

### Q1: Revision Loop Behavior

When the plan fails validation or supervisor review, should the planner:
- **A) See all previous feedback** — accumulate feedback across attempts
- **B) See only latest feedback** — fresh attempt each time
- **C) Configurable** — let the workflow decide

### Q2: Execution State Shape

For the interpreted execution, what should the state object track?

Draft:
```typescript
interface ExecutionState {
  plan: PlanSpec;
  completedStepIds: string[];
  pendingStepIds: string[];
  stepResults: Record<string, any>;  // stepId → output
  hypothesisStatuses: Record<string, HypothesisStatus>;
  currentPhase: "research" | "hypothesize" | "experiment" | "assess" | "develop";
  iterations: number;
  decisionLog: Array<{ stepId: string, decision: string, reason: string }>;
}
```

Anything to add/remove?

### Q3: Fixture Evaluation Approach

For test fixtures, should we:
- **A) Just run the planner and inspect output manually** — exploratory
- **B) Run planner + all scorers, assert thresholds** — automated
- **C) Both** — manual inspection for development, automated for CI

### Q4: Implementation Order

I'm thinking:
1. Schema + Validator (foundation)
2. Fixtures (so we have something to test against)
3. Planner agent (core capability)
4. Scorers (evaluate planner output)
5. Planning workflow (tie it together)
6. Stub execution (proof of concept)

Does this order make sense, or would you prefer a different sequence?

---

Once you confirm these, I can produce a more detailed specification for each file, including specific type signatures, prompts, and test cases — all ready for implementation once we exit plan mode.

---

## User

great. And let's please persist this plan somewhere, because when we're done planning I'll end this session and resume tomorrow.

Q1: I think (C), if it's not too complicated... would that mean a human-in-loop decision at that point, or is this a configurable option that the user sets before kickoff?
Q2: I can't think of anything to change here
Q3: let's start with A
Q4: that order sounds great 

---

## Assistant

I'll persist this plan to a markdown file in the project. Let me create a comprehensive plan document.

```
Tool: todowrite
```

---

## Assistant

```
Tool: list
```

---

## Assistant

Good, I can see the structure. I'll create the plan document. Since I'm in plan mode and cannot write files, let me prepare the full content of the plan document and present it to you. You can then save it yourself, or I can save it when we exit plan mode.

Here's the complete implementation plan document:

---

# Task Decomposition & Planning Framework — Implementation Plan

## Document Info
- **Created**: 2024-12-16
- **Status**: Planning Phase
- **Location**: `apps/hash-ai-agent/docs/PLAN-task-decomposition.md` (suggested)

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

| Type | Category | Description | Parallelizable |
|------|----------|-------------|----------------|
| `research` | Strategic | Gather existing knowledge | ✅ Yes |
| `hypothesize` | Strategic | Generate testable hypotheses from findings | No |
| `synthesize` | Strategic | Combine results (choose-best, merge, compare, integrate, distill) | No |
| `assess` | Strategic | Evaluate outcomes against criteria | No |
| `experiment` | Tactical | Test hypothesis empirically | ✅ Yes |
| `develop` | Tactical | Build/implement something | Sometimes |
| `transform` | Tactical | Pure data manipulation | N/A |

### 3.1 Synthesis Modes

```typescript
type SynthesisMode = 
  | "choose-best"   // Pick one from multiple candidates
  | "merge"         // Combine acceptable candidates into one
  | "compare"       // Produce comparison without choosing
  | "integrate"     // Weave findings into coherent narrative
  | "distill";      // Extract core insights, discard noise
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
  status: z.enum(["untested", "testing", "supported", "refuted", "inconclusive"]).default("untested"),
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
  dimensions: z.array(z.object({
    name: z.string(),
    weight: z.number().min(0).max(1),
    description: z.string(),
  })).optional(),
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
  possibleOutcomes: z.array(z.object({
    id: z.string(),
    condition: z.string(),
    interpretation: z.string(),
    hypothesisEffect: z.object({
      hypothesisId: z.string(),
      newStatus: z.enum(["supported", "refuted", "inconclusive"]),
    }).optional(),
  })),
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
    conditions: z.array(z.object({
      condition: z.string(),
      thenStepId: z.string(),
    })),
    defaultStepId: z.string().optional(),
  }),
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
  type: z.enum(["assumption", "missing-input", "clarification-needed", "risk", "open-question"]),
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
  estimatedComplexity: z.enum(["low", "medium", "high", "very-high"]).optional(),
  
  // Allowlist of available primitives
  availableExecutors: z.object({
    agents: z.array(z.string()),
    tools: z.array(z.string()),
    workflows: z.array(z.string()),
  }).optional(),
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
  "result-synthesizer": "Combines findings (choose-best, merge, compare, etc.)",
  
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

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution mode | Interpreted | Supports dynamism, single workflow handles any plan |
| Stub executors | Template-based | Plausible outputs without LLM cost |
| Plan evaluation | LLM judge + structural | No single "correct" decomposition |
| Supervisor scope | Pre-kickoff validation | Simpler for Phase 1 |
| Hypotheses | Explicit top-level + referenced | Makes scientific structure visible |
| Decision points | Typed (branch/supervisor/human) | Distinguishes static vs dynamic |
| Revision feedback | Configurable (all/latest) | Flexibility in revision strategy |

---

## 9. Execution State Shape

```typescript
interface ExecutionState {
  plan: PlanSpec;
  completedStepIds: string[];
  pendingStepIds: string[];
  stepResults: Record<string, any>;
  hypothesisStatuses: Record<string, HypothesisStatus>;
  currentPhase: "research" | "hypothesize" | "experiment" | "assess" | "develop";
  iterations: number;
  decisionLog: Array<{ stepId: string; decision: string; reason: string }>;
}
```

---

## 10. Evaluation Strategy

| Scorer | Type | Measures |
|--------|------|----------|
| `plan-structure` | Deterministic | DAG valid, refs exist, no orphans |
| `plan-coverage` | Deterministic | All requirements addressed |
| `plan-testability` | LLM judge | Hypotheses can actually be tested |
| `plan-granularity` | LLM judge | Steps appropriately scoped |
| `plan-coherence` | LLM judge | Steps make sense together |
| `plan-completeness` | LLM judge | No obvious gaps for the goal |

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
    expectedStepTypes: ["research", "hypothesize", "experiment", "assess", "develop"],
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
  revisionStrategy: z.enum(["all-feedback", "latest-only"]).default("all-feedback"),
  maxRevisionAttempts: z.number().default(3),
})
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

*End of Plan Document*

---

I've prepared the complete plan document above. Since I'm in plan mode and cannot write files, here are your options:

1. **Save it yourself**: Copy the content above into `apps/hash-ai-agent/docs/PLAN-task-decomposition.md` (or wherever you prefer)

2. **Exit plan mode**: When you're ready to resume, I can save it as the first action

3. **Different location**: Let me know if you'd prefer a different filename or location

Also, regarding your Q1 clarification: Yes, the revision feedback strategy (`all-feedback` vs `latest-only`) would be a **configurable option set before kickoff**, not a human-in-the-loop decision during execution. I've added that to Section 13 of the plan.

```
Tool: todowrite
```

---

## Assistant

The full plan is ready. Let me know how you'd like to persist it, and have a good evening! When you resume tomorrow, we can pick up from Phase 1 (Schema & Validation).

---

## User

please go ahead and write the document as you suggested

---

## Assistant

```
Tool: list
```

---

## Assistant

```
Tool: bash
```

---

## Assistant

```
Tool: write
```

---

## Assistant

```
Tool: todowrite
```

---

## Assistant

Done! I've written the full implementation plan to:

```
apps/hash-ai-agent/docs/PLAN-task-decomposition.md
```

The document contains:
- Architecture overview (3-level model)
- Step type taxonomy
- Full PlanSpec schema (ready to copy into actual `.ts` file)
- Available agents list
- File structure
- Implementation phases (6 phases, 18 items)
- Key design decisions
- Execution state shape
- Evaluation strategy
- Test fixture example (CT-database goal)
- Open questions for future work
- Next steps checklist

When you resume tomorrow, we can start with Phase 1: creating `schemas/plan-spec.ts` and `tools/plan-validator.ts`. Have a good evening!

---

