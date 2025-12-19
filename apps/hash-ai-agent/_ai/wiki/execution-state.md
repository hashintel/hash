# Execution State: Accumulating Handoffs into Epistemic State

> Formalizes how handoff packets fold into cumulative execution state.
> Captured 2024-12-19. See also: [handoff-packets.md](./handoff-packets.md)

## Core Concept

Handoffs are the **incremental unit of state change**. Each step produces a handoff; the orchestrator's job is to *fold* handoffs into cumulative execution state that tracks:

- What we've learned (evidence ledger)
- What we still don't know (uncertainty inventory)
- What we've produced (artifact registry)
- What we didn't do (gaps registry)
- The sequence of contributions (handoff log / audit trail)

## Execution State Shape

```typescript
interface ExecutionState {
  // === Plan reference (immutable unless re-planning) ===
  plan: PlanSpec;
  
  // === Step tracking ===
  completedStepIds: string[];
  pendingStepIds: string[];      // derived from plan topology
  currentStepId: string | null;  // for in-progress tracking
  
  // === Handoff accumulation (audit trail) ===
  handoffLog: Array<{
    stepId: string;
    handoff: StepHandoff;
    timestamp: number;
  }>;
  
  // === Derived epistemic state (folded from handoffs) ===
  
  // Evidence: observations with provenance
  evidenceLedger: Array<{
    finding: string;
    source?: string;
    confidence?: number;
    fromStepId: string;
  }>;
  
  // Uncertainty: open questions raised by steps
  uncertaintyInventory: Array<{
    question: string;
    raisedByStepId: string;
    status: "open" | "testing" | "resolved";
    resolvedByStepId?: string;
  }>;
  
  // Artifacts: produced outputs with refs
  artifactRegistry: Array<{
    artifact: string;
    ref: string;
    fromStepId: string;
  }>;
  
  // Gaps: what wasn't done (informs future planning)
  gapsRegistry: Array<{
    item: string;
    reason: string;
    fromStepId: string;
  }>;
  
  // === Control flow state ===
  iterations: number;            // for loop bounds
  planComplete: boolean;         // all steps done
  needsReplanning: boolean;      // trigger for re-plan branch
  
  // === Hypothesis tracking (updated by experiment handoffs) ===
  hypothesisStatuses: Record<string, {
    status: "untested" | "testing" | "supported" | "refuted" | "inconclusive";
    testedByStepIds: string[];
    evidenceStepIds: string[];
  }>;
}
```

## State Initialization

At plan execution start, initialize from the PlanSpec:

```typescript
function initializeExecutionState(plan: PlanSpec): ExecutionState {
  return {
    plan,
    completedStepIds: [],
    pendingStepIds: plan.steps.map(s => s.id),
    currentStepId: null,
    handoffLog: [],
    
    // Start empty — populated by handoff folding
    evidenceLedger: [],
    uncertaintyInventory: [],
    artifactRegistry: [],
    gapsRegistry: [],
    
    iterations: 0,
    planComplete: false,
    needsReplanning: false,
    
    // Initialize hypothesis statuses from plan
    hypothesisStatuses: Object.fromEntries(
      plan.hypotheses.map(h => [h.id, {
        status: h.status ?? "untested",
        testedByStepIds: [],
        evidenceStepIds: [],
      }])
    ),
  };
}
```

## Fold Operation: Handoff → State

After each step completes with a valid handoff, fold it into state:

```typescript
function foldHandoff(
  state: ExecutionState, 
  stepId: string, 
  handoff: StepHandoff
): ExecutionState {
  const timestamp = Date.now();
  
  return {
    ...state,
    
    // Mark step complete
    completedStepIds: [...state.completedStepIds, stepId],
    pendingStepIds: state.pendingStepIds.filter(id => id !== stepId),
    currentStepId: null,
    
    // Append to audit trail
    handoffLog: [...state.handoffLog, { stepId, handoff, timestamp }],
    
    // Fold observations into evidence ledger
    evidenceLedger: [
      ...state.evidenceLedger,
      ...handoff.observed.map(obs => ({ 
        finding: obs.finding,
        source: obs.source,
        confidence: obs.confidence,
        fromStepId: stepId,
      })),
    ],
    
    // Add highest-impact uncertainty as new known-unknown
    uncertaintyInventory: [
      ...state.uncertaintyInventory,
      { 
        question: handoff.highestImpactUncertainty, 
        raisedByStepId: stepId,
        status: "open",
      },
    ],
    
    // Register produced artifacts
    artifactRegistry: [
      ...state.artifactRegistry,
      ...handoff.changed.map(c => ({ 
        artifact: c.artifact,
        ref: c.ref,
        fromStepId: stepId,
      })),
    ],
    
    // Track acknowledged gaps
    gapsRegistry: [
      ...state.gapsRegistry,
      ...handoff.notDone.map(nd => ({ 
        item: nd.item,
        reason: nd.reason,
        fromStepId: stepId,
      })),
    ],
    
    iterations: state.iterations + 1,
  };
}
```

## Interpreter Loop Integration

The execution state is the "mutable state" in the interpreter pattern from [gaps-and-next-steps.md](./gaps-and-next-steps.md):

```typescript
const executionWorkflow = createWorkflow({
  id: "plan-execution",
  inputSchema: z.object({ plan: zPlanSpec }),
  outputSchema: zExecutionResult,
})
  // Initialize state from plan
  .map(async ({ inputData }) => initializeExecutionState(inputData.plan))
  
  // Interpreter loop: execute steps, fold handoffs, check termination
  .dountil(
    interpreterStep,
    async ({ inputData }) => inputData.planComplete || inputData.needsReplanning
  )
  
  // Branch on outcome
  .branch([
    [({ inputData }) => inputData.needsReplanning, replanStep],
    [() => true, finalizeStep],
  ])
  .commit();
```

### Interpreter Step Logic

```typescript
const interpreterStep = createStep({
  id: "interpreter",
  inputSchema: zExecutionState,
  outputSchema: zExecutionState,
  execute: async ({ inputData }) => {
    const state = inputData;
    
    // 1. Pick next step(s) based on topology and completed steps
    const nextStepId = pickNextReadyStep(state);
    if (!nextStepId) {
      return { ...state, planComplete: true };
    }
    
    // 2. Get step definition from plan
    const planStep = state.plan.steps.find(s => s.id === nextStepId)!;
    
    // 3. Build context from prior handoffs
    const context = buildContextFromState(state, planStep);
    
    // 4. Execute step, expecting handoff-shaped output
    const handoff = await executeStepAndGetHandoff(planStep, context);
    
    // 5. Fold handoff into state
    const newState = foldHandoff(state, nextStepId, handoff);
    
    // 6. Check re-planning triggers
    const needsReplanning = shouldReplan(newState, handoff);
    
    // 7. Check completion
    const planComplete = newState.pendingStepIds.length === 0;
    
    return { ...newState, planComplete, needsReplanning };
  },
});
```

## Context Building for Successor Steps

When executing a step, build context from accumulated state:

```typescript
function buildContextFromState(
  state: ExecutionState, 
  planStep: PlanStep
): StepContext {
  // Get handoffs from dependency steps
  const dependencyHandoffs = planStep.dependsOn
    .map(depId => state.handoffLog.find(h => h.stepId === depId))
    .filter((h): h is NonNullable<typeof h> => h !== undefined);
  
  // Get relevant evidence (from dependencies or all)
  const relevantEvidence = state.evidenceLedger.filter(e => 
    planStep.dependsOn.includes(e.fromStepId)
  );
  
  // Get current hypothesis statuses
  const hypothesisContext = planStep.type === "experiment" 
    ? planStep.hypothesisIds.map(hid => ({
        id: hid,
        ...state.hypothesisStatuses[hid],
      }))
    : [];
  
  // Include the "nextAgentShouldFirst" recommendations from dependencies
  const recommendations = dependencyHandoffs
    .map(h => h.handoff.nextAgentShouldFirst);
  
  return {
    dependencyHandoffs,
    relevantEvidence,
    hypothesisContext,
    recommendations,
    openUncertainties: state.uncertaintyInventory.filter(u => u.status === "open"),
  };
}
```

## Re-planning Triggers

Handoffs can signal that the current plan is no longer valid:

```typescript
function shouldReplan(state: ExecutionState, handoff: StepHandoff): boolean {
  // 1. Uncertainty invalidates a plan assumption (known-known)
  const invalidatesAssumption = state.plan.unknownsMap.knownKnowns.some(kk =>
    handoff.highestImpactUncertainty.toLowerCase().includes(kk.toLowerCase())
  );
  
  // 2. Critical gap accumulation threshold
  const criticalGapCount = state.gapsRegistry.filter(g => 
    isCriticalGap(g, state.plan.requirements)
  ).length;
  const tooManyGaps = criticalGapCount > 3; // configurable threshold
  
  // 3. Hypothesis refuted that plan depends on
  const refutedCriticalHypothesis = Object.entries(state.hypothesisStatuses)
    .some(([hid, status]) => 
      status.status === "refuted" && isPlanCritical(hid, state.plan)
    );
  
  // 4. Explicit signal in handoff (future: structured field)
  const explicitReplanRequest = handoff.highestImpactUncertainty
    .toLowerCase().includes("need to replan");
  
  return invalidatesAssumption || tooManyGaps || refutedCriticalHypothesis || explicitReplanRequest;
}
```

## Hypothesis Status Updates

Experiment step handoffs should update hypothesis statuses:

```typescript
function updateHypothesisStatuses(
  state: ExecutionState,
  experimentStepId: string,
  handoff: StepHandoff,
  planStep: ExperimentStep
): ExecutionState {
  const updatedStatuses = { ...state.hypothesisStatuses };
  
  for (const hid of planStep.hypothesisIds) {
    const current = updatedStatuses[hid];
    if (!current) continue;
    
    // Determine new status from handoff observations
    // (In practice, this might be a structured field in payload)
    const newStatus = inferHypothesisStatus(handoff, hid);
    
    updatedStatuses[hid] = {
      ...current,
      status: newStatus,
      testedByStepIds: [...current.testedByStepIds, experimentStepId],
      evidenceStepIds: [...current.evidenceStepIds, experimentStepId],
    };
  }
  
  return { ...state, hypothesisStatuses: updatedStatuses };
}
```

## State Persistence

For long-running execution with suspend/resume, state must be serializable:

```typescript
// All fields are JSON-serializable by design
const serializedState = JSON.stringify(executionState);

// Mastra's suspend() persists this automatically
await suspend({ reason: "Human approval required", state: executionState });

// On resume, state is restored
const { resumeData } = context;
const restoredState = resumeData.state as ExecutionState;
```

## Diagram: State Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Step S1   │───▶│   Step S2   │───▶│   Step S3   │
└─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │
      ▼                  ▼                  ▼
  Handoff H1         Handoff H2         Handoff H3
      │                  │                  │
      └────────┬─────────┴─────────┬───────┘
               │                   │
               ▼                   ▼
         ┌─────────────────────────────────┐
         │        ExecutionState           │
         ├─────────────────────────────────┤
         │  handoffLog: [H1, H2, H3]       │
         │  evidenceLedger: [obs...]       │
         │  uncertaintyInventory: [q...]   │
         │  artifactRegistry: [a...]       │
         │  gapsRegistry: [g...]           │
         └─────────────────────────────────┘
                       │
                       ▼
               ┌───────────────┐
               │ Re-plan check │
               └───────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
    Continue plan            Trigger re-plan
```

## Open Questions

1. **Parallel step handoffs**: When multiple steps execute in parallel, how do we handle concurrent folds? Order may matter for uncertainty resolution.

2. **Handoff validation**: Should there be a dedicated validator that checks handoff quality before folding?

3. **State compaction**: As handoff log grows, may need summarization for context limits. How to preserve audit trail while compacting?

4. **Uncertainty deduplication**: Multiple steps may raise similar uncertainties. How to detect and merge?

5. **Confidence propagation**: When synthesize steps combine evidence, how do confidence scores aggregate?
