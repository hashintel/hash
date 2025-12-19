# Conditional Branching in Plan Execution

> **Status**: Deferred — see [gaps-and-next-steps.md](./gaps-and-next-steps.md)
> **Created**: 2024-12-18
> **Moved to wiki**: 2024-12-19
> **Context**: Design options for runtime branching in plan execution

## Overview

Conditional branching allows plan execution to take different paths based on
runtime evaluation results. This is essential for:

- **Evaluation → retry cycles**: When synthesis/evaluation step determines quality is insufficient
- **Quality gates**: Pass/fail/escalate decisions at key checkpoints
- **Human-in-the-loop decision points**: Routing to human review when confidence is low
- **Adaptive execution**: Choosing different strategies based on intermediate results

## Current State

The plan compiler (`plan-compiler.ts`) currently supports:

- Linear execution (`.then()`)
- Parallel execution (`.parallel()`)
- Fan-in patterns (multiple steps → single synthesis)
- Fan-out patterns (single step → multiple parallel steps)

**Not yet supported**:

- Conditional branching (`.branch()`)
- Loop constructs (`.dowhile()`, `.dountil()`)

## Mastra Primitive

Mastra workflows support conditional branching via `.branch()`:

```typescript
workflow.branch([
  [async ({ inputData }) => inputData.decision === "retry", retryStep],
  [async ({ inputData }) => inputData.decision === "pass", continueStep],
  [async ({ inputData }) => true, fallbackStep], // default case
]);
```

The condition functions receive the output of the previous step and return a boolean.
The first matching condition determines which branch is taken.

## PlanSpec Extension Options

### Option A: Explicit Conditional Edges

Add a `conditionalEdges` array to PlanSpec with serializable condition specs:

```typescript
interface ConditionSpec {
  field: string; // Path in previous step output, e.g., "decision"
  operator: "eq" | "neq" | "gt" | "lt" | "in" | "contains";
  value: unknown; // Value to compare against
}

interface ConditionalEdge {
  id: string;
  fromStepId: string; // Source step (typically an evaluation step)
  conditions: Array<{
    condition: ConditionSpec;
    toStepId: string; // Target step if condition matches
  }>;
  defaultStepId?: string; // Fallback if no condition matches
}

// In PlanSpec:
interface PlanSpec {
  // ... existing fields ...
  conditionalEdges?: ConditionalEdge[];
}
```

**Pros**:

- Explicit and declarative
- Easy to validate statically
- Clear visualization in UI

**Cons**:

- Adds complexity to PlanSpec schema
- Condition language is limited (no arbitrary expressions)

### Option B: Gateway Steps

Use evaluation steps that output decisions, followed by a special "gateway" step type:

```typescript
interface GatewayStep {
  type: "gateway";
  id: string;
  dependsOn: [string]; // Must depend on exactly one step
  routes: Array<{
    condition: ConditionSpec;
    toStepId: string;
  }>;
  defaultRoute?: string;
}
```

**Pros**:

- Gateway is a first-class step type
- Clearer semantic meaning
- Easier to reason about in isolation

**Cons**:

- More verbose plans
- Gateway steps don't "do" anything (just routing)

### Option C: Inline Conditions on dependsOn

Extend `dependsOn` to optionally include conditions:

```typescript
interface ConditionalDependency {
  stepId: string;
  condition?: ConditionSpec; // Only proceed if condition matches
}

// In PlanStep:
dependsOn: Array<string | ConditionalDependency>;
```

**Pros**:

- Minimal schema changes
- Natural extension of existing pattern

**Cons**:

- Makes dependency analysis more complex
- Harder to visualize

## Relationship to Decision Points

Earlier discussion identified the need for plans to surface uncertainty:

- Assumptions
- Missing inputs
- Clarifying questions
- Risks / decision points

These are currently tracked in `unknownsMap` as metadata. Decision points for
conditional branching could be:

| Decision Type   | How It Maps to Branching                       |
| --------------- | ---------------------------------------------- |
| `clarification` | Branch to HITL step for user input             |
| `assumption`    | Branch based on assumption validation          |
| `risk`          | Branch to mitigation path if risk materializes |
| `tradeoff`      | Branch based on user preference or heuristic   |

The relationship between `unknownsMap` and conditional edges needs further design:

- Should decision points automatically generate conditional edges?
- Or should they remain separate (metadata vs control flow)?

**Tracked for future**: Clarify this relationship when implementing Phase 4.

## Security Considerations

Condition evaluation must be carefully constrained:

1. **No arbitrary code execution**: Conditions must be declarative, not executable JS
2. **Limited operators**: Only safe comparison operators
3. **Field path validation**: Ensure field paths don't access sensitive data
4. **Timeout protection**: Condition evaluation should be bounded

## Deferred Because

1. **Current focus**: Phase 1-3 focus on basic DAG execution with streaming
2. **Schema design**: Need to finalize which option (A, B, or C) to pursue
3. **Validation complexity**: Conditional edges require additional validation:
   - All branches must be reachable
   - No orphaned steps after conditions
   - Conditions must be evaluable given step outputs
4. **UI implications**: Conditional branches need visualization support

## Implementation Plan (Phase 4)

When we return to this:

1. **Design decision**: Choose between Option A, B, or C (likely A)
2. **Schema extension**: Add conditional edges to PlanSpec
3. **Validation**: Extend plan-validator.ts for conditional edge checks
4. **Compiler**: Implement `.branch()` generation from conditional edges
5. **Tests**: Add conditional branching test fixtures
6. **Topology**: Update topology-analyzer.ts to handle conditional paths
7. **Streaming**: Emit events for branch decisions

## Related Files

- `src/mastra/tools/plan-compiler.ts` - Main compiler (needs `.branch()` support)
- `src/mastra/schemas/plan-spec.ts` - Schema (needs conditional edge types)
- `src/mastra/tools/plan-validator.ts` - Validation (needs edge validation)
- `src/mastra/tools/topology-analyzer.ts` - Analysis (needs conditional path handling)

## References

- Mastra workflow `.branch()` documentation
- Earlier conversation about decision points and surfaced uncertainty
- XState/Stately statechart patterns (for future consideration)
