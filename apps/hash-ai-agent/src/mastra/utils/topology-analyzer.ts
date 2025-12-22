/**
 * Topology Analyzer — Plan Structure Analysis
 *
 * Analyzes the structure of a PlanSpec to extract useful information:
 * - Topological ordering of steps
 * - Parallelizable step groups (steps that can run concurrently)
 * - Critical path (longest dependency chain)
 * - Dependency depth for each step
 * - Entry points (steps with no dependencies)
 * - Exit points (steps that no other step depends on)
 *
 * This is useful for:
 * - Execution planning (what can run in parallel)
 * - Complexity estimation (critical path length)
 * - Visualization (layer-based layout)
 *
 * @see docs/PLAN-task-decomposition.md for design documentation
 */

import type { PlanSpec, PlanStep } from "../schemas/plan-spec";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A group of steps that can potentially execute in parallel.
 *
 * Steps in a group:
 * - Have the same dependency depth (all dependencies are satisfied at the same time)
 * - May or may not be individually concurrent (check `concurrent` field)
 */
export interface ParallelGroup {
  /** Depth level (0 = entry points, 1 = depends on entry points, etc.) */
  depth: number;
  /** Step IDs in this group */
  stepIds: string[];
  /** Step IDs that are individually concurrent */
  concurrentStepIds: string[];
}

/**
 * The critical path through the plan — the longest dependency chain.
 */
export interface CriticalPath {
  /** Step IDs in order from entry to exit */
  stepIds: string[];
  /** Total length of the path */
  length: number;
}

/**
 * Analysis result for a PlanSpec.
 */
export interface TopologyAnalysis {
  /** Steps in topological order (respects dependencies) */
  topologicalOrder: string[];

  /** Groups of steps organized by dependency depth */
  parallelGroups: ParallelGroup[];

  /** The longest dependency chain */
  criticalPath: CriticalPath;

  /** Steps with no dependencies (starting points) */
  entryPoints: string[];

  /** Steps that nothing depends on (ending points) */
  exitPoints: string[];

  /** Dependency depth for each step (0 = entry point) */
  depthMap: Map<string, number>;

  /** Number of steps that depend on each step */
  dependentCount: Map<string, number>;
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Build adjacency lists for the step graph.
 *
 * Returns two maps:
 * - dependencies: step -> steps it depends on
 * - dependents: step -> steps that depend on it
 */
function buildGraphMaps(plan: PlanSpec): {
  dependencies: Map<string, Set<string>>;
  dependents: Map<string, Set<string>>;
} {
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  // Initialize maps
  for (const stepId of stepIds) {
    dependencies.set(stepId, new Set());
    dependents.set(stepId, new Set());
  }

  // Populate from step references
  for (const step of plan.steps) {
    const deps = step.dependencyIds.filter((ref) => stepIds.has(ref));
    dependencies.set(step.id, new Set(deps));

    for (const dep of deps) {
      dependents.get(dep)!.add(step.id);
    }
  }

  return { dependencies, dependents };
}

/**
 * Compute topological order using Kahn's algorithm.
 *
 * Returns steps in an order where all dependencies come before dependents.
 * Assumes the graph is acyclic (run validatePlan first).
 */
function computeTopologicalOrder(
  stepIds: Set<string>,
  dependencies: Map<string, Set<string>>,
): string[] {
  const result: string[] = [];
  const inDegree = new Map<string, number>();

  // Calculate in-degree for each node
  for (const stepId of stepIds) {
    inDegree.set(stepId, dependencies.get(stepId)!.size);
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [stepId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(stepId);
    }
  }

  // Process nodes in BFS order
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // Find all steps that depend on current
    for (const stepId of stepIds) {
      if (dependencies.get(stepId)!.has(current)) {
        const newDegree = inDegree.get(stepId)! - 1;
        inDegree.set(stepId, newDegree);
        if (newDegree === 0) {
          queue.push(stepId);
        }
      }
    }
  }

  return result;
}

/**
 * Compute dependency depth for each step.
 *
 * Depth is the length of the longest path from any entry point to this step.
 * Entry points have depth 0.
 */
function computeDepthMap(
  topologicalOrder: string[],
  dependencies: Map<string, Set<string>>,
): Map<string, number> {
  const depthMap = new Map<string, number>();

  for (const stepId of topologicalOrder) {
    const deps = dependencies.get(stepId)!;

    if (deps.size === 0) {
      // Entry point
      depthMap.set(stepId, 0);
    } else {
      // Max depth of dependencies + 1
      let maxDepth = 0;
      for (const dep of deps) {
        const depDepth = depthMap.get(dep) ?? 0;
        maxDepth = Math.max(maxDepth, depDepth);
      }
      depthMap.set(stepId, maxDepth + 1);
    }
  }

  return depthMap;
}

/**
 * Group steps by their dependency depth.
 */
function computeParallelGroups(
  steps: PlanStep[],
  depthMap: Map<string, number>,
): ParallelGroup[] {
  const groupsByDepth = new Map<number, ParallelGroup>();

  for (const step of steps) {
    const depth = depthMap.get(step.id) ?? 0;

    if (!groupsByDepth.has(depth)) {
      groupsByDepth.set(depth, {
        depth,
        stepIds: [],
        concurrentStepIds: [],
      });
    }

    const group = groupsByDepth.get(depth)!;
    group.stepIds.push(step.id);

    if (step.concurrent !== false) {
      group.concurrentStepIds.push(step.id);
    }
  }

  // Sort by depth and return as array
  return Array.from(groupsByDepth.values()).sort((a, b) => a.depth - b.depth);
}

/**
 * Find the critical path (longest dependency chain).
 *
 * Uses dynamic programming on the topologically sorted nodes.
 */
function computeCriticalPath(
  topologicalOrder: string[],
  dependencies: Map<string, Set<string>>,
): CriticalPath {
  // Distance and predecessor for path reconstruction
  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();

  // Initialize
  for (const stepId of topologicalOrder) {
    dist.set(stepId, 0);
    pred.set(stepId, null);
  }

  // Process in topological order
  for (const stepId of topologicalOrder) {
    const deps = dependencies.get(stepId)!;
    for (const dep of deps) {
      const newDist = dist.get(dep)! + 1;
      if (newDist > dist.get(stepId)!) {
        dist.set(stepId, newDist);
        pred.set(stepId, dep);
      }
    }
  }

  // Find the endpoint with maximum distance
  let maxDist = 0;
  let endNode: string | null = null;

  for (const [stepId, distance] of dist) {
    if (distance >= maxDist) {
      maxDist = distance;
      endNode = stepId;
    }
  }

  // Reconstruct path
  const path: string[] = [];
  let current = endNode;

  while (current !== null) {
    path.push(current);
    current = pred.get(current) ?? null;
  }

  path.reverse();

  return {
    stepIds: path,
    length: path.length,
  };
}

/**
 * Find entry points (steps with no dependencies).
 */
function findEntryPoints(dependencies: Map<string, Set<string>>): string[] {
  const entryPoints: string[] = [];

  for (const [stepId, deps] of dependencies) {
    if (deps.size === 0) {
      entryPoints.push(stepId);
    }
  }

  return entryPoints;
}

/**
 * Find exit points (steps that nothing depends on).
 */
function findExitPoints(dependents: Map<string, Set<string>>): string[] {
  const exitPoints: string[] = [];

  for (const [stepId, deps] of dependents) {
    if (deps.size === 0) {
      exitPoints.push(stepId);
    }
  }

  return exitPoints;
}

/**
 * Count how many steps depend on each step.
 */
function computeDependentCounts(
  dependents: Map<string, Set<string>>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [stepId, deps] of dependents) {
    counts.set(stepId, deps.size);
  }

  return counts;
}

// =============================================================================
// MAIN ANALYZER
// =============================================================================

/**
 * Analyze the topology of a PlanSpec.
 *
 * Extracts structural information useful for:
 * - Execution planning (what can run in parallel)
 * - Complexity estimation (critical path length)
 * - Visualization (layer-based layout)
 *
 * Assumes the plan has already been validated (no cycles).
 *
 * @example
 * ```typescript
 * const analysis = analyzePlanTopology(planSpec);
 *
 * // Get steps that can run in parallel at depth 0
 * const firstBatch = analysis.parallelGroups[0].concurrentStepIds;
 *
 * // Check critical path length for complexity
 * console.log(`Critical path length: ${analysis.criticalPath.length}`);
 * ```
 */
export function analyzePlanTopology(plan: PlanSpec): TopologyAnalysis {
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const { dependencies, dependents } = buildGraphMaps(plan);

  const topologicalOrder = computeTopologicalOrder(stepIds, dependencies);
  const depthMap = computeDepthMap(topologicalOrder, dependencies);
  const parallelGroups = computeParallelGroups(plan.steps, depthMap);
  const criticalPath = computeCriticalPath(topologicalOrder, dependencies);
  const entryPoints = findEntryPoints(dependencies);
  const exitPoints = findExitPoints(dependents);
  const dependentCount = computeDependentCounts(dependents);

  return {
    topologicalOrder,
    parallelGroups,
    criticalPath,
    entryPoints,
    exitPoints,
    depthMap,
    dependentCount,
  };
}

/**
 * Get the maximum parallelism possible at any depth level.
 *
 * This is the maximum number of concurrent steps in any single group.
 */
export function getMaxParallelism(analysis: TopologyAnalysis): number {
  let max = 0;
  for (const group of analysis.parallelGroups) {
    max = Math.max(max, group.concurrentStepIds.length);
  }
  return max;
}

/**
 * Get the total number of "layers" in the plan.
 *
 * This is the maximum dependency depth + 1.
 */
export function getLayerCount(analysis: TopologyAnalysis): number {
  return analysis.parallelGroups.length;
}

/**
 * Check if a step is on the critical path.
 */
export function isOnCriticalPath(
  analysis: TopologyAnalysis,
  stepId: string,
): boolean {
  return analysis.criticalPath.stepIds.includes(stepId);
}

/**
 * Get steps that can run after a given step completes.
 *
 * Returns steps where all dependencies are satisfied once the given step
 * (and any previously completed steps) are done.
 */
export function getUnblockedSteps(
  plan: PlanSpec,
  completedStepIds: Set<string>,
): string[] {
  const stepIds = new Set(plan.steps.map((step) => step.id));
  const unblocked: string[] = [];

  for (const step of plan.steps) {
    // Skip if already completed
    if (completedStepIds.has(step.id)) {
      continue;
    }

    // Check if all dependencies are completed
    const deps = step.dependencyIds.filter((ref) => stepIds.has(ref));
    const allDepsCompleted = deps.every((dep) => completedStepIds.has(dep));

    if (allDepsCompleted) {
      unblocked.push(step.id);
    }
  }

  return unblocked;
}
