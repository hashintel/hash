/**
 * Plan Compiler Integration Tests
 *
 * Tests that the plan compiler correctly transforms PlanSpec instances
 * into executable Mastra workflows with proper:
 * - Execution order (respecting dependencies)
 * - Parallel group handling
 * - Streaming event emission
 * - Mock agent execution
 *
 * Uses mock agents throughout - no LLM calls.
 */

import { describe, expect, test } from "vitest";

import type { PlanSpec } from "../schemas/plan-spec";
import { validatePlan } from "./plan-validator";
import {
  compilePlanToWorkflow,
  type PlanExecutionEvent,
} from "./plan-compiler";
import { analyzePlanTopology } from "./topology-analyzer";

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Creates a minimal valid plan for testing.
 * Single research step - the simplest possible plan.
 */
function createMinimalPlan(): PlanSpec {
  return {
    id: "minimal-plan",
    goalSummary: "Minimal test plan",
    requirements: [
      { id: "R1", description: "Test requirement", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Single research step",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Research findings" }],
        query: "Test query",
        stoppingRule: "Find 3 sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Test framework works"],
      knownUnknowns: ["All edge cases"],
      unknownUnknowns: [
        {
          potentialSurprise: "Unexpected behavior",
          detectionSignal: "Tests fail",
        },
      ],
      communityCheck: "Code review",
    },
  };
}

/**
 * Creates a linear plan with 3 sequential steps.
 * S1 → S2 → S3
 */
function createLinearPlan(): PlanSpec {
  return {
    id: "linear-plan",
    goalSummary: "Linear sequential plan",
    requirements: [
      { id: "R1", description: "Complete all steps", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Initial research",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Initial findings" }],
        query: "Initial query",
        stoppingRule: "Find sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S2",
        description: "Synthesize findings",
        dependsOn: ["S1"],
        requirementIds: ["R1"],
        inputs: [
          { name: "findings", description: "From S1", fromStepId: "S1" },
        ],
        outputs: [{ name: "synthesis", description: "Synthesized results" }],
        mode: "integrative",
        inputStepIds: ["S1"],
        parallelizable: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      {
        type: "develop",
        id: "S3",
        description: "Produce deliverable",
        dependsOn: ["S2"],
        requirementIds: ["R1"],
        inputs: [
          { name: "synthesis", description: "From S2", fromStepId: "S2" },
        ],
        outputs: [{ name: "deliverable", description: "Final output" }],
        specification: "Build based on synthesis",
        deliverables: ["Documentation"],
        parallelizable: false,
        executor: { kind: "agent", ref: "documentation-writer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Sequential flow works"],
      knownUnknowns: ["Performance characteristics"],
      unknownUnknowns: [
        {
          potentialSurprise: "Ordering issues",
          detectionSignal: "Wrong order",
        },
      ],
      communityCheck: "Review execution logs",
    },
  };
}

/**
 * Creates a plan with parallel research steps.
 * S1, S2, S3 (parallel) → S4 (synthesis)
 */
function createParallelPlan(): PlanSpec {
  return {
    id: "parallel-plan",
    goalSummary: "Parallel research then synthesis",
    requirements: [
      { id: "R1", description: "Research multiple topics", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Research topic A",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_a", description: "Topic A findings" }],
        query: "Topic A query",
        stoppingRule: "Find 3 sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S2",
        description: "Research topic B",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_b", description: "Topic B findings" }],
        query: "Topic B query",
        stoppingRule: "Find 3 sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S3",
        description: "Research topic C",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_c", description: "Topic C findings" }],
        query: "Topic C query",
        stoppingRule: "Find 3 sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S4",
        description: "Combine all findings",
        dependsOn: ["S1", "S2", "S3"],
        requirementIds: ["R1"],
        inputs: [
          { name: "findings_a", description: "From S1", fromStepId: "S1" },
          { name: "findings_b", description: "From S2", fromStepId: "S2" },
          { name: "findings_c", description: "From S3", fromStepId: "S3" },
        ],
        outputs: [{ name: "synthesis", description: "Combined synthesis" }],
        mode: "integrative",
        inputStepIds: ["S1", "S2", "S3"],
        parallelizable: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Parallel execution supported"],
      knownUnknowns: ["Exact parallelism level"],
      unknownUnknowns: [
        {
          potentialSurprise: "Race conditions",
          detectionSignal: "Inconsistent results",
        },
      ],
      communityCheck: "Verify parallel execution",
    },
  };
}

/**
 * Creates a diamond-shaped plan.
 *      S1
 *     /  \
 *   S2    S3
 *     \  /
 *      S4
 */
function createDiamondPlan(): PlanSpec {
  return {
    id: "diamond-plan",
    goalSummary: "Diamond dependency pattern",
    requirements: [
      { id: "R1", description: "Handle diamond pattern", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Initial research",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "initial", description: "Initial data" }],
        query: "Initial query",
        stoppingRule: "Find sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S2",
        description: "Branch A analysis",
        dependsOn: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "initial", description: "From S1", fromStepId: "S1" }],
        outputs: [{ name: "branch_a", description: "Branch A results" }],
        query: "Branch A query",
        stoppingRule: "Analyze branch A",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S3",
        description: "Branch B analysis",
        dependsOn: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "initial", description: "From S1", fromStepId: "S1" }],
        outputs: [{ name: "branch_b", description: "Branch B results" }],
        query: "Branch B query",
        stoppingRule: "Analyze branch B",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S4",
        description: "Merge branches",
        dependsOn: ["S2", "S3"],
        requirementIds: ["R1"],
        inputs: [
          { name: "branch_a", description: "From S2", fromStepId: "S2" },
          { name: "branch_b", description: "From S3", fromStepId: "S3" },
        ],
        outputs: [{ name: "merged", description: "Merged results" }],
        mode: "integrative",
        inputStepIds: ["S2", "S3"],
        parallelizable: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Diamond patterns are valid DAGs"],
      knownUnknowns: ["Optimal parallel execution"],
      unknownUnknowns: [
        {
          potentialSurprise: "Merge conflicts",
          detectionSignal: "Data inconsistency",
        },
      ],
      communityCheck: "Verify fan-in handling",
    },
  };
}

/**
 * Creates a plan with mixed parallelism at the same depth.
 * S1 (parallel) and S2 (not parallel) at depth 0.
 */
function createMixedParallelismPlan(): PlanSpec {
  return {
    id: "mixed-parallelism-plan",
    goalSummary: "Mixed parallel and sequential at same depth",
    requirements: [
      { id: "R1", description: "Handle mixed parallelism", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Parallelizable research",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "Query",
        stoppingRule: "Find sources",
        parallelizable: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S2",
        description: "Non-parallelizable synthesis (no deps)",
        dependsOn: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "synthesis", description: "Synthesis" }],
        mode: "integrative",
        inputStepIds: [],
        parallelizable: false, // Explicitly not parallelizable
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      {
        type: "develop",
        id: "S3",
        description: "Final development",
        dependsOn: ["S1", "S2"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "output", description: "Output" }],
        specification: "Combine results",
        deliverables: ["Final artifact"],
        parallelizable: false,
        executor: { kind: "agent", ref: "documentation-writer" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["Mixed parallelism patterns exist"],
      knownUnknowns: ["Optimal handling strategy"],
      unknownUnknowns: [
        {
          potentialSurprise: "Scheduling issues",
          detectionSignal: "Unexpected order",
        },
      ],
      communityCheck: "Review scheduling logic",
    },
  };
}

// =============================================================================
// COMPILATION TESTS
// =============================================================================

describe("Plan Compiler — Compilation", () => {
  describe("Basic compilation", () => {
    test("compiles a minimal valid plan", () => {
      const plan = createMinimalPlan();

      // Verify plan is valid first
      const validation = validatePlan(plan);
      expect(validation.valid).toBe(true);

      // Compile should not throw
      const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });

      expect(workflow).toBeDefined();
    });

    test("compiles a linear plan with sequential dependencies", () => {
      const plan = createLinearPlan();

      const validation = validatePlan(plan);
      expect(validation.valid).toBe(true);

      const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });
      expect(workflow).toBeDefined();
    });

    test("compiles a plan with parallel steps", () => {
      const plan = createParallelPlan();

      const validation = validatePlan(plan);
      expect(validation.valid).toBe(true);

      const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });
      expect(workflow).toBeDefined();
    });

    test("compiles a diamond-shaped plan", () => {
      const plan = createDiamondPlan();

      const validation = validatePlan(plan);
      expect(validation.valid).toBe(true);

      const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });
      expect(workflow).toBeDefined();
    });

    test("compiles a plan with mixed parallelism", () => {
      const plan = createMixedParallelismPlan();

      const validation = validatePlan(plan);
      expect(validation.valid).toBe(true);

      const workflow = compilePlanToWorkflow(plan, { useMockAgents: true });
      expect(workflow).toBeDefined();
    });
  });
});

// =============================================================================
// TOPOLOGY ANALYSIS TESTS
// =============================================================================

describe("Plan Compiler — Topology Analysis", () => {
  test("correctly identifies entry points", () => {
    const plan = createParallelPlan();
    const topology = analyzePlanTopology(plan);

    // S1, S2, S3 should all be entry points (no dependencies)
    expect(topology.entryPoints).toContain("S1");
    expect(topology.entryPoints).toContain("S2");
    expect(topology.entryPoints).toContain("S3");
    expect(topology.entryPoints).not.toContain("S4");
  });

  test("correctly identifies exit points", () => {
    const plan = createParallelPlan();
    const topology = analyzePlanTopology(plan);

    // S4 should be the only exit point (nothing depends on it)
    expect(topology.exitPoints).toEqual(["S4"]);
  });

  test("correctly computes parallel groups for parallel plan", () => {
    const plan = createParallelPlan();
    const topology = analyzePlanTopology(plan);

    // Should have 2 parallel groups:
    // Depth 0: S1, S2, S3
    // Depth 1: S4
    expect(topology.parallelGroups.length).toBe(2);

    const depth0 = topology.parallelGroups.find((g) => g.depth === 0);
    const depth1 = topology.parallelGroups.find((g) => g.depth === 1);

    expect(depth0?.stepIds).toHaveLength(3);
    expect(depth0?.stepIds).toContain("S1");
    expect(depth0?.stepIds).toContain("S2");
    expect(depth0?.stepIds).toContain("S3");

    expect(depth1?.stepIds).toHaveLength(1);
    expect(depth1?.stepIds).toContain("S4");
  });

  test("correctly computes parallel groups for diamond plan", () => {
    const plan = createDiamondPlan();
    const topology = analyzePlanTopology(plan);

    // Should have 3 parallel groups:
    // Depth 0: S1
    // Depth 1: S2, S3
    // Depth 2: S4
    expect(topology.parallelGroups.length).toBe(3);

    const depth0 = topology.parallelGroups.find((g) => g.depth === 0);
    const depth1 = topology.parallelGroups.find((g) => g.depth === 1);
    const depth2 = topology.parallelGroups.find((g) => g.depth === 2);

    expect(depth0?.stepIds).toEqual(["S1"]);
    expect(depth1?.stepIds).toHaveLength(2);
    expect(depth1?.stepIds).toContain("S2");
    expect(depth1?.stepIds).toContain("S3");
    expect(depth2?.stepIds).toEqual(["S4"]);
  });

  test("correctly computes topological order for linear plan", () => {
    const plan = createLinearPlan();
    const topology = analyzePlanTopology(plan);

    // Topological order should be S1, S2, S3
    expect(topology.topologicalOrder).toEqual(["S1", "S2", "S3"]);
  });

  test("correctly identifies critical path", () => {
    const plan = createDiamondPlan();
    const topology = analyzePlanTopology(plan);

    // Critical path should be length 3 (S1 → S2/S3 → S4)
    expect(topology.criticalPath.length).toBe(3);
    expect(topology.criticalPath.stepIds[0]).toBe("S1");
    expect(topology.criticalPath.stepIds[2]).toBe("S4");
  });

  test("correctly identifies parallelizable steps within groups", () => {
    const plan = createMixedParallelismPlan();
    const topology = analyzePlanTopology(plan);

    const depth0 = topology.parallelGroups.find((g) => g.depth === 0);

    // S1 is parallelizable, S2 is not
    expect(depth0?.parallelizableStepIds).toContain("S1");
    expect(depth0?.parallelizableStepIds).not.toContain("S2");
  });
});

// =============================================================================
// EXECUTION TESTS (with mocks)
// =============================================================================

describe("Plan Compiler — Execution", () => {
  test("executes minimal plan and returns result", async () => {
    const plan = createMinimalPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10, // Fast for testing
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.planId).toBe("minimal-plan");
      expect(result.result.success).toBe(true);
      expect(result.result.executionOrder).toEqual(["S1"]);
    }
  }, 10000);

  test("executes linear plan in correct order", async () => {
    const plan = createLinearPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.success).toBe(true);
      expect(result.result.executionOrder).toEqual(["S1", "S2", "S3"]);
    }
  }, 10000);

  test("executes parallel plan respecting dependencies", async () => {
    const plan = createParallelPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.success).toBe(true);
      // S4 should be last (depends on S1, S2, S3)
      const order = result.result.executionOrder as string[];
      expect(order[order.length - 1]).toBe("S4");
    }
  }, 10000);

  test("executes diamond plan respecting dependencies", async () => {
    const plan = createDiamondPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.success).toBe(true);
      const order = result.result.executionOrder as string[];

      // S1 should be first
      expect(order[0]).toBe("S1");
      // S4 should be last
      expect(order[order.length - 1]).toBe("S4");
      // S2 and S3 should be between S1 and S4
      const s2Index = order.indexOf("S2");
      const s3Index = order.indexOf("S3");
      expect(s2Index).toBeGreaterThan(0);
      expect(s3Index).toBeGreaterThan(0);
      expect(s2Index).toBeLessThan(order.length - 1);
      expect(s3Index).toBeLessThan(order.length - 1);
    }
  }, 10000);
});

// =============================================================================
// STREAMING EVENTS TESTS
// =============================================================================

describe("Plan Compiler — Streaming Events", () => {
  test("emits plan-start event", async () => {
    const plan = createMinimalPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const events: PlanExecutionEvent[] = [];
    const run = await workflow.createRun();

    // Use stream to capture events
    const stream = await run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const startEvent = events.find((e) => e.type === "data-plan-start");
    expect(startEvent).toBeDefined();
    expect(startEvent?.data.planId).toBe("minimal-plan");
    expect(startEvent?.data.totalSteps).toBe(1);
  }, 10000);

  test("emits step-start and step-complete events", async () => {
    const plan = createMinimalPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const events: PlanExecutionEvent[] = [];
    const run = await workflow.createRun();
    const stream = await run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const stepStartEvents = events.filter(
      (e) => e.type === "data-plan-step-start",
    );
    const stepCompleteEvents = events.filter(
      (e) => e.type === "data-plan-step-complete",
    );

    expect(stepStartEvents).toHaveLength(1);
    expect(stepCompleteEvents).toHaveLength(1);

    expect(stepStartEvents[0]?.data.stepId).toBe("S1");
    expect(stepCompleteEvents[0]?.data.stepId).toBe("S1");
  }, 10000);

  test("emits progress events", async () => {
    const plan = createLinearPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const events: PlanExecutionEvent[] = [];
    const run = await workflow.createRun();
    const stream = await run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const progressEvents = events.filter(
      (e) => e.type === "data-plan-progress",
    );

    // Should have progress events after each depth
    expect(progressEvents.length).toBeGreaterThan(0);

    // Last progress should show all steps complete
    const lastProgress = progressEvents[progressEvents.length - 1];
    expect(lastProgress?.data.completedSteps).toBe(3);
    expect(lastProgress?.data.totalSteps).toBe(3);
  }, 10000);

  test("emits plan-complete event", async () => {
    const plan = createMinimalPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const events: PlanExecutionEvent[] = [];
    const run = await workflow.createRun();
    const stream = await run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const completeEvent = events.find((e) => e.type === "data-plan-complete");
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.planId).toBe("minimal-plan");
    expect(completeEvent?.data.success).toBe(true);
    expect(completeEvent?.data.stepsCompleted).toBe(1);
    expect(completeEvent?.data.stepsFailed).toBe(0);
  }, 10000);
});
