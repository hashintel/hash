# Gaps & Next Steps

> Living document tracking implementation gaps and planned work.
> Last updated: 2024-12-19

## Current State Summary

The planning framework has:

- ✅ PlanSpec schema with 4 step types (research, synthesize, experiment, develop)
- ✅ Plan validation (structural checks)
- ✅ Deterministic scorers (structure, coverage, rigor, unknowns)
- ✅ LLM judge scorers (alignment, granularity, testability)
- ✅ Planner agent with structured output
- ✅ Planning workflow with revision loop (validate → feedback → regenerate)
- ✅ Plan compiler (PlanSpec → Mastra workflow)
- ✅ Topology analyzer (parallel groups, critical path)
- ✅ Mock agents for testing
- ✅ Streaming events for execution progress
- ✅ Clack-based demo for interactive visualization

## Conceptual Advances (2024-12-19)

New wiki documents capture significant design evolution:

| Document | Concept |
|----------|---------|
| [handoff-packets.md](./handoff-packets.md) | Stop conditions via output contracts — step is "done" when it produces a valid handoff |
| [execution-state.md](./execution-state.md) | Cumulative state from folding handoffs — evidence ledger, uncertainty inventory, artifact registry |
| [meta-cognitive-prompts.md](./meta-cognitive-prompts.md) | Templates for uncertainty-first research and rigorous experiment design |
| [conditional-branching.md](./conditional-branching.md) | Design options for runtime branching (deferred) |

These represent a shift toward **epistemically rigorous R&D orchestration** rather than simple task execution.

---

## Recent Observations (2025-05-04)

- **Branching + suspend/resume** need to be first-class in the compiler approach. We should plan for conditional paths and HITL pauses as part of the compiled workflow model, not just at the prompt layer.
- **Error handling needs a policy layer**: beyond fail-fast, we need declarative choices for retries, fallbacks, and “continue-on-error” semantics. This should be modeled separately from step logic (e.g., per-step or per-plan execution policy).
- **Mastra dev UI is useful but limited** for interaction patterns; keep the TUI demo path as the primary interactive surface until a dedicated frontend is warranted.

---

## Priority 1: Handoff Packet Integration

**Problem**: Current step outputs are unstructured (`outputs: DataContract[]` at plan-time, arbitrary objects at runtime). No standard for what constitutes a "complete" step contribution.

**Solution**: Implement `StepHandoff` schema as the canonical output format:

- Every step produces: attempted, observed, changed, notDone, highestImpactUncertainty, nextAgentShouldFirst
- Handoff completeness becomes the stop condition
- Handoffs fold into execution state

**Files to modify**:

- `schemas/plan-spec.ts` — Add `zStepHandoff` and related types
- `tools/plan-compiler.ts` — Update prompt building to require handoff format
- `tools/mock-agent.ts` — Return handoff-shaped mock responses

**Complexity**: Medium

---

## Priority 2: Execution State Schema

**Problem**: No structured runtime state beyond what Mastra provides. Can't track evidence accumulation, uncertainty evolution, or audit trail across steps.

**Solution**: Implement `ExecutionState` as described in [execution-state.md](./execution-state.md):

- Initialize from PlanSpec
- Fold handoffs after each step
- Track evidence ledger, uncertainty inventory, artifact registry, gaps registry
- Enable re-planning triggers

**Files to create/modify**:

- `schemas/execution-state.ts` — New schema
- `tools/plan-compiler.ts` or new `tools/interpreter.ts` — State management

**Complexity**: Medium-High

---

## Priority 3: Synthetic Mock Agents

**Problem**: Current mock agents return deterministic responses. This is good for testing compilation and flow, but doesn't test workflow dynamics under realistic variation.

**Insight**: Need a middle ground between deterministic mocks and real long-running execution.

**Solution**: "Synthetic mocking" — mock agents that make real LLM calls to generate realistic but synthetic step outputs:

- Takes step context (type, description, inputs)
- Generates plausible handoff packet via LLM
- Can simulate failures, unexpected findings, or re-planning triggers
- Enables testing of interpreter dynamics without real tasks

```typescript
interface SyntheticMockConfig {
  mode: "deterministic" | "synthetic" | "real";
  syntheticVariation?: "nominal" | "surprising" | "failing";
  llmModel?: string;  // For synthetic mode
}
```

**Files to modify**:

- `tools/mock-agent.ts` — Add synthetic mode with LLM-backed generation

**Complexity**: Low-Medium

---

## Priority 4: Interpreter Pattern

**Problem**: Compiled workflows have fixed shape at commit time. Can't support Level 3 dynamism (re-planning based on execution outcomes).

**Solution**: Implement interpreter pattern as described in [execution-state.md](./execution-state.md):

```typescript
createWorkflow(...)
  .map(initializeExecutionState)
  .dountil(interpreterStep, ({ inputData }) => 
    inputData.planComplete || inputData.needsReplanning
  )
  .branch([
    [({ inputData }) => inputData.needsReplanning, replanStep],
    [() => true, finalizeStep],
  ])
  .commit();
```

The interpreter step:

- Picks next ready step(s) from topology
- Builds context from prior handoffs
- Executes step, expecting handoff output
- Folds handoff into state
- Checks re-planning triggers

**Files to create**:

- `workflows/interpreted-execution.ts` — New interpreter-based execution workflow
- Could coexist with compiled approach for simpler plans

**Complexity**: High

---

## Priority 5: Score Threshold Quality Gate

**Problem**: Revision loop only checks boolean `valid` flag. Structurally valid but mediocre plans pass immediately.

**Solution**: Add composite score threshold to revision loop:

- After validation passes, run `scorePlanComposite()`
- Require `overall >= 0.85` (configurable) to exit loop
- If below threshold, build feedback from low-scoring areas

**Files to modify**:

- `workflows/planning-workflow.ts` — Integrate scorer into loop condition

**Complexity**: Low

---

## Priority 6: Supervisor Agent

**Problem**: No semantic review of plans against original goal. Validation is structural only.

**Solution**: Implement supervisor agent as LLM approval gate:

- Reviews plan against goal
- Returns `{ approved: boolean, feedback?: string, issues?: string[] }`
- Integrates after validation + scoring in revision loop

**Files to create**:

- `agents/supervisor-agent.ts`

**Complexity**: Medium

---

## Priority 7: Human-in-the-Loop Gates

**Problem**: No support for human approval checkpoints during execution.

**Solution**: Use Mastra's `suspend()`/`resume()` at key decision points:

- Post-design, pre-execution (human approves experimental design)
- Post-analysis, pre-interpretation (human validates analysis)
- Post-conclusion, pre-propagation (human checks confidence claims)

**Integration**: Works naturally with interpreter pattern — interpreter can decide to suspend based on step type or confidence level.

**Complexity**: Medium (infrastructure exists in Mastra)

---

## Deferred / Low Priority

### Conditional Branching (Level 1 Dynamism)

Static branching based on conditions in plan. Design options captured in [conditional-branching.md](./conditional-branching.md). Less urgent now that interpreter pattern handles higher levels of dynamism.

### Real Agent Execution

Replacing mock agents with actual capable agents. Deferred until:

1. Handoff packet format is stable
2. Execution state management is solid
3. Quality of plan decomposition is validated

---

## Three Levels of Execution Dynamism

| Level | Description | Mastra Primitive | Status |
|-------|-------------|------------------|--------|
| **1: Static branching** | Pre-defined branches in plan | `.branch()` | Design captured, deferred |
| **2: Runtime decisions** | Agent evaluates outcomes, chooses path | Interpreter + handoff analysis | Priority 4 |
| **3: Re-planning** | Outcomes trigger plan revision | Interpreter + `generatePlan()` | Priority 4 |

The interpreter pattern (Priority 4) unlocks both Level 2 and Level 3 dynamism.

---

## Implementation Order Recommendation

1. **Handoff packets** (Priority 1) — Foundation for everything else
2. **Synthetic mocks** (Priority 3) — Enables testing subsequent work
3. **Execution state** (Priority 2) — Requires handoffs
4. **Score threshold** (Priority 5) — Quick win for plan quality
5. **Interpreter** (Priority 4) — Requires execution state
6. **Supervisor** (Priority 6) — Can develop in parallel
7. **HITL gates** (Priority 7) — Builds on interpreter

---

## Reference: Mastra Primitives Available

From source exploration (2024-12-19):

| Primitive | Purpose | Notes |
|-----------|---------|-------|
| `.dountil(step, condition)` | Loop until condition true | Step can be nested workflow |
| `.branch([...])` | Conditional routing | First matching condition wins |
| `suspend()` / `resumeData` | Pause/resume with persisted state | For HITL |
| `writer.custom()` | Emit streaming events | For progress tracking |
| `getStepResult(stepId)` | Read prior step outputs | For context building |
| `setState()` / `state` | Mutable step state | For accumulation |

See also: [mastra-patterns.md](./mastra-patterns.md)
