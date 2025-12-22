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
import {
  compilePlanToWorkflow,
  type PlanExecutionEvent,
} from "./plan-compiler";
import { validatePlan } from "./plan-validator";
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
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Research findings" }],
        query: "Test query",
        stoppingRule: "Find 3 sources",
        concurrent: true,
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
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Initial findings" }],
        query: "Initial query",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S2",
        description: "Synthesize findings",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "findings", description: "From S1" }],
        outputs: [{ name: "synthesis", description: "Synthesized results" }],
        mode: "integrative",
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      {
        type: "develop",
        id: "S3",
        description: "Produce deliverable",
        dependencyIds: ["S2"],
        requirementIds: ["R1"],
        inputs: [{ name: "synthesis", description: "From S2" }],
        outputs: [{ name: "deliverable", description: "Final output" }],
        specification: "Build based on synthesis",
        deliverables: ["Documentation"],
        concurrent: false,
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
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_a", description: "Topic A findings" }],
        query: "Topic A query",
        stoppingRule: "Find 3 sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S2",
        description: "Research topic B",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_b", description: "Topic B findings" }],
        query: "Topic B query",
        stoppingRule: "Find 3 sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S3",
        description: "Research topic C",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings_c", description: "Topic C findings" }],
        query: "Topic C query",
        stoppingRule: "Find 3 sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S4",
        description: "Combine all findings",
        dependencyIds: ["S1", "S2", "S3"],
        requirementIds: ["R1"],
        inputs: [
          { name: "findings_a", description: "From S1" },
          { name: "findings_b", description: "From S2" },
          { name: "findings_c", description: "From S3" },
        ],
        outputs: [{ name: "synthesis", description: "Combined synthesis" }],
        mode: "integrative",
        concurrent: false,
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
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "initial", description: "Initial data" }],
        query: "Initial query",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S2",
        description: "Branch A analysis",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "initial", description: "From S1" }],
        outputs: [{ name: "branch_a", description: "Branch A results" }],
        query: "Branch A query",
        stoppingRule: "Analyze branch A",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S3",
        description: "Branch B analysis",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "initial", description: "From S1" }],
        outputs: [{ name: "branch_b", description: "Branch B results" }],
        query: "Branch B query",
        stoppingRule: "Analyze branch B",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S4",
        description: "Merge branches",
        dependencyIds: ["S2", "S3"],
        requirementIds: ["R1"],
        inputs: [
          { name: "branch_a", description: "From S2" },
          { name: "branch_b", description: "From S3" },
        ],
        outputs: [{ name: "merged", description: "Merged results" }],
        mode: "integrative",
        concurrent: false,
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
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "Query",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "synthesize",
        id: "S2",
        description: "Non-concurrent synthesis (no deps)",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "synthesis", description: "Synthesis" }],
        mode: "integrative",
        concurrent: false, // Explicitly not concurrent
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      {
        type: "develop",
        id: "S3",
        description: "Final development",
        dependencyIds: ["S1", "S2"],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "output", description: "Output" }],
        specification: "Combine results",
        deliverables: ["Final artifact"],
        concurrent: false,
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

/**
 * Creates a deep DAG plan with 5 depth levels and multiple fan-in/fan-out.
 *
 *        S1 (research)           depth 0
 *       / | \
 *     S2  S3  S4 (research)      depth 1, parallel
 *      \  |  /
 *        S5 (synthesize)         depth 2, fan-in
 *       /   \
 *     S6     S7 (develop)        depth 3, parallel
 *      \   /
 *        S8 (synthesize)         depth 4, final evaluation
 */
function createDeepDagPlan(): PlanSpec {
  return {
    id: "deep-dag-plan",
    goalSummary: "Deep DAG with multiple fan-in/fan-out patterns",
    requirements: [
      { id: "R1", description: "Research phase", priority: "must" },
      { id: "R2", description: "Synthesis phase", priority: "must" },
      { id: "R3", description: "Development phase", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      // Depth 0: Initial research
      {
        type: "research",
        id: "S1",
        description: "Initial exploration of the problem space",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [
          { name: "initial_findings", description: "Initial findings" },
        ],
        query: "Explore problem space",
        stoppingRule: "Identify 3 key areas",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      // Depth 1: Parallel deep-dives
      {
        type: "research",
        id: "S2",
        description: "Deep dive into area A",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "context", description: "From S1" }],
        outputs: [{ name: "area_a_findings", description: "Area A findings" }],
        query: "Research area A in depth",
        stoppingRule: "Find 5 relevant sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S3",
        description: "Deep dive into area B",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "context", description: "From S1" }],
        outputs: [{ name: "area_b_findings", description: "Area B findings" }],
        query: "Research area B in depth",
        stoppingRule: "Find 5 relevant sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      {
        type: "research",
        id: "S4",
        description: "Deep dive into area C",
        dependencyIds: ["S1"],
        requirementIds: ["R1"],
        inputs: [{ name: "context", description: "From S1" }],
        outputs: [{ name: "area_c_findings", description: "Area C findings" }],
        query: "Research area C in depth",
        stoppingRule: "Find 5 relevant sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
      // Depth 2: Synthesis fan-in
      {
        type: "synthesize",
        id: "S5",
        description: "Combine findings from all research areas",
        dependencyIds: ["S2", "S3", "S4"],
        requirementIds: ["R2"],
        inputs: [
          { name: "area_a", description: "From S2" },
          { name: "area_b", description: "From S3" },
          { name: "area_c", description: "From S4" },
        ],
        outputs: [{ name: "synthesis", description: "Combined synthesis" }],
        mode: "integrative",
        concurrent: false,
        executor: { kind: "agent", ref: "result-synthesizer" },
      },
      // Depth 3: Parallel development
      {
        type: "develop",
        id: "S6",
        description: "Develop component X based on synthesis",
        dependencyIds: ["S5"],
        requirementIds: ["R3"],
        inputs: [{ name: "synthesis", description: "From S5" }],
        outputs: [{ name: "component_x", description: "Component X" }],
        specification: "Build component X",
        deliverables: ["Component X implementation"],
        concurrent: true,
        executor: { kind: "agent", ref: "code-writer" },
      },
      {
        type: "develop",
        id: "S7",
        description: "Develop component Y based on synthesis",
        dependencyIds: ["S5"],
        requirementIds: ["R3"],
        inputs: [{ name: "synthesis", description: "From S5" }],
        outputs: [{ name: "component_y", description: "Component Y" }],
        specification: "Build component Y",
        deliverables: ["Component Y implementation"],
        concurrent: true,
        executor: { kind: "agent", ref: "code-writer" },
      },
      // Depth 4: Final synthesis/evaluation
      {
        type: "synthesize",
        id: "S8",
        description: "Evaluate and combine both components",
        dependencyIds: ["S6", "S7"],
        requirementIds: ["R2", "R3"],
        inputs: [
          { name: "component_x", description: "From S6" },
          { name: "component_y", description: "From S7" },
        ],
        outputs: [
          { name: "final_evaluation", description: "Final evaluation" },
        ],
        mode: "evaluative",
        evaluateAgainst: [
          "Do components integrate correctly?",
          "Are requirements met?",
        ],
        concurrent: false,
        executor: { kind: "agent", ref: "progress-evaluator" },
      },
    ],
    unknownsMap: {
      knownKnowns: ["DAG structure is valid", "All step types are supported"],
      knownUnknowns: ["Optimal parallelization", "Integration complexity"],
      unknownUnknowns: [
        {
          potentialSurprise: "Unexpected dependencies between areas",
          detectionSignal: "Synthesis step fails to integrate",
        },
      ],
      communityCheck: "Review DAG structure and data flow",
    },
  };
}

/**
 * Creates a plan with an invalid executor reference for error testing.
 */
function createPlanWithInvalidExecutor(): PlanSpec {
  return {
    id: "invalid-executor-plan",
    goalSummary: "Plan with invalid executor reference",
    requirements: [
      { id: "R1", description: "Test requirement", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "Step with nonexistent executor",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "Test query",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "nonexistent-agent" }, // Invalid!
      },
    ],
    unknownsMap: {
      knownKnowns: [],
      knownUnknowns: [],
      unknownUnknowns: [],
      communityCheck: "",
    },
  };
}

/**
 * Creates a plan where a step will throw an error (via __THROW__ in description).
 */
function createPlanWithThrowingStep(): PlanSpec {
  return {
    id: "throwing-step-plan",
    goalSummary: "Plan where a step throws an error",
    requirements: [
      { id: "R1", description: "Test requirement", priority: "must" },
    ],
    hypotheses: [],
    steps: [
      {
        type: "research",
        id: "S1",
        description: "__THROW__ This step should fail",
        dependencyIds: [],
        requirementIds: ["R1"],
        inputs: [],
        outputs: [{ name: "findings", description: "Findings" }],
        query: "__THROW__ trigger error",
        stoppingRule: "Find sources",
        concurrent: true,
        executor: { kind: "agent", ref: "literature-searcher" },
      },
    ],
    unknownsMap: {
      knownKnowns: [],
      knownUnknowns: [],
      unknownUnknowns: [],
      communityCheck: "",
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

    test("compiles a deep DAG plan with 5 depth levels", () => {
      const plan = createDeepDagPlan();

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

    const depth0 = topology.parallelGroups.find((grp) => grp.depth === 0);
    const depth1 = topology.parallelGroups.find((grp) => grp.depth === 1);

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

    const depth0 = topology.parallelGroups.find((grp) => grp.depth === 0);
    const depth1 = topology.parallelGroups.find((grp) => grp.depth === 1);
    const depth2 = topology.parallelGroups.find((grp) => grp.depth === 2);

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

  test("correctly identifies concurrent steps within groups", () => {
    const plan = createMixedParallelismPlan();
    const topology = analyzePlanTopology(plan);

    const depth0 = topology.parallelGroups.find((grp) => grp.depth === 0);

    // S1 is concurrent, S2 is not
    expect(depth0?.concurrentStepIds).toContain("S1");
    expect(depth0?.concurrentStepIds).not.toContain("S2");
  });

  test("correctly computes 5 depth levels for deep DAG", () => {
    const plan = createDeepDagPlan();
    const topology = analyzePlanTopology(plan);

    // Should have 5 parallel groups (depths 0-4)
    expect(topology.parallelGroups.length).toBe(5);

    // Verify each depth level
    const depth0 = topology.parallelGroups.find((grp) => grp.depth === 0);
    const depth1 = topology.parallelGroups.find((grp) => grp.depth === 1);
    const depth2 = topology.parallelGroups.find((grp) => grp.depth === 2);
    const depth3 = topology.parallelGroups.find((grp) => grp.depth === 3);
    const depth4 = topology.parallelGroups.find((grp) => grp.depth === 4);

    expect(depth0?.stepIds).toEqual(["S1"]);
    expect(depth1?.stepIds).toHaveLength(3);
    expect(depth1?.stepIds).toContain("S2");
    expect(depth1?.stepIds).toContain("S3");
    expect(depth1?.stepIds).toContain("S4");
    expect(depth2?.stepIds).toEqual(["S5"]);
    expect(depth3?.stepIds).toHaveLength(2);
    expect(depth3?.stepIds).toContain("S6");
    expect(depth3?.stepIds).toContain("S7");
    expect(depth4?.stepIds).toEqual(["S8"]);
  });

  test("correctly identifies fan-in points in deep DAG", () => {
    const plan = createDeepDagPlan();
    const topology = analyzePlanTopology(plan);

    // S5 is a fan-in (depends on S2, S3, S4)
    // S8 is a fan-in (depends on S6, S7)
    // These should have higher dependent counts in predecessor steps

    // Entry point is S1
    expect(topology.entryPoints).toEqual(["S1"]);

    // Exit point is S8
    expect(topology.exitPoints).toEqual(["S8"]);

    // Check that fan-in steps are at correct depths
    const depth2 = topology.parallelGroups.find((grp) => grp.depth === 2);
    const depth4 = topology.parallelGroups.find((grp) => grp.depth === 4);

    expect(depth2?.stepIds).toContain("S5"); // Fan-in from S2, S3, S4
    expect(depth4?.stepIds).toContain("S8"); // Fan-in from S6, S7
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
      const order = result.result.executionOrder;
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
      const order = result.result.executionOrder;

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

  test("executes deep DAG respecting all dependencies", async () => {
    const plan = createDeepDagPlan();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.success).toBe(true);
      const order = result.result.executionOrder;

      // Verify execution order respects dependencies
      // S1 must be first
      expect(order[0]).toBe("S1");

      // S8 must be last
      expect(order[order.length - 1]).toBe("S8");

      // S2, S3, S4 must come after S1 and before S5
      const s1Index = order.indexOf("S1");
      const s2Index = order.indexOf("S2");
      const s3Index = order.indexOf("S3");
      const s4Index = order.indexOf("S4");
      const s5Index = order.indexOf("S5");

      expect(s2Index).toBeGreaterThan(s1Index);
      expect(s3Index).toBeGreaterThan(s1Index);
      expect(s4Index).toBeGreaterThan(s1Index);
      expect(s5Index).toBeGreaterThan(s2Index);
      expect(s5Index).toBeGreaterThan(s3Index);
      expect(s5Index).toBeGreaterThan(s4Index);

      // S6, S7 must come after S5 and before S8
      const s6Index = order.indexOf("S6");
      const s7Index = order.indexOf("S7");
      const s8Index = order.indexOf("S8");

      expect(s6Index).toBeGreaterThan(s5Index);
      expect(s7Index).toBeGreaterThan(s5Index);
      expect(s8Index).toBeGreaterThan(s6Index);
      expect(s8Index).toBeGreaterThan(s7Index);
    }
  }, 15000);
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
    const stream = run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const startEvent = events.find((evt) => evt.type === "data-plan-start");
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
    const stream = run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const stepStartEvents = events.filter(
      (evt) => evt.type === "data-plan-step-start",
    );
    const stepCompleteEvents = events.filter(
      (evt) => evt.type === "data-plan-step-complete",
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
    const stream = run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const progressEvents = events.filter(
      (evt) => evt.type === "data-plan-progress",
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
    const stream = run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    const completeEvent = events.find(
      (evt) => evt.type === "data-plan-complete",
    );
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.planId).toBe("minimal-plan");
    expect(completeEvent?.data.success).toBe(true);
    expect(completeEvent?.data.stepsCompleted).toBe(1);
    expect(completeEvent?.data.stepsFailed).toBe(0);
  }, 10000);
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Plan Compiler — Error Handling", () => {
  test("throws when executor ref not found in registry", async () => {
    const plan = createPlanWithInvalidExecutor();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    // Workflow should fail due to missing executor
    expect(result.status).toBe("failed");
  }, 10000);

  test("emits step-error event when step execution fails", async () => {
    const plan = createPlanWithThrowingStep();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const events: PlanExecutionEvent[] = [];
    const run = await workflow.createRun();
    const stream = run.stream({ inputData: { context: {} } });

    for await (const chunk of stream.fullStream) {
      if (chunk.type.startsWith("data-plan-")) {
        events.push(chunk as unknown as PlanExecutionEvent);
      }
    }

    // Should have emitted a step-error event
    const errorEvents = events.filter(
      (evt) => evt.type === "data-plan-step-error",
    );
    expect(errorEvents.length).toBeGreaterThan(0);

    // Error event should contain the step ID and error message
    const errorEvent = errorEvents[0];
    expect(errorEvent?.data.stepId).toBe("S1");
    expect(errorEvent?.data.error).toContain("__THROW__");
  }, 10000);

  test("workflow status is failed when step throws", async () => {
    const plan = createPlanWithThrowingStep();
    const workflow = compilePlanToWorkflow(plan, {
      useMockAgents: true,
      mockDelayMs: 10,
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: { context: {} } });

    // Workflow should have failed status
    expect(result.status).toBe("failed");
  }, 10000);
});
