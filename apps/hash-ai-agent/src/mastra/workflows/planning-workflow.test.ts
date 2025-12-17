/* eslint-disable no-console */
/**
 * Planning Workflow Test — Black Triangle
 *
 * This is the "black triangle" test — the simplest possible test that proves
 * the entire planning pipeline works end-to-end:
 *
 * Goal → Planner Agent → PlanSpec → Validator → Success!
 *
 * If this test passes, the core infrastructure is working.
 */

import { describe, expect, test } from 'vitest';

import { generatePlan } from '../agents/planner-agent';
import { summarizePapersGoal } from '../fixtures/decomposition-prompts/summarize-papers';
import { validatePlan } from '../tools/plan-validator';
import { analyzePlanTopology } from '../tools/topology-analyzer';

describe('Planning Pipeline - Black Triangle', () => {
  test(
    'generates and validates a plan for summarize-papers goal',
    { timeout: 2 * 60 * 1000 }, // 2 minutes for LLM call
    async () => {
      // Step 1: Generate a plan from the goal
      console.log('\n=== Generating plan for goal ===');
      console.log(`Goal: ${summarizePapersGoal.goal.slice(0, 100)}...`);

      const result = await generatePlan({
        goal: summarizePapersGoal.goal,
        context: summarizePapersGoal.context,
      });

      console.log('\n=== Generated Plan ===');
      console.log(`ID: ${result.plan.id}`);
      console.log(`Goal Summary: ${result.plan.goalSummary}`);
      console.log(`Steps: ${result.plan.steps.length}`);
      console.log(`Requirements: ${result.plan.requirements.length}`);
      console.log(`Hypotheses: ${result.plan.hypotheses.length}`);

      // Log step details
      console.log('\n=== Steps ===');
      for (const step of result.plan.steps) {
        console.log(`  ${step.id}: [${step.type}] ${step.description.slice(0, 60)}...`);
        console.log(`    dependsOn: [${step.dependsOn.join(', ')}]`);
      }

      // Step 2: Validate the plan structure
      console.log('\n=== Validating Plan ===');
      const validation = validatePlan(result.plan);

      console.log(`Valid: ${validation.valid}`);
      console.log(`Error count: ${validation.errors.length}`);

      if (!validation.valid) {
        console.log('\n=== Validation Errors ===');
        for (const error of validation.errors) {
          console.log(`  [${error.code}] ${error.message}`);
        }
      }

      // Step 3: Analyze topology (if valid)
      if (validation.valid) {
        console.log('\n=== Topology Analysis ===');
        const topology = analyzePlanTopology(result.plan);

        console.log(`Entry points: [${topology.entryPoints.join(', ')}]`);
        console.log(`Exit points: [${topology.exitPoints.join(', ')}]`);
        console.log(`Critical path length: ${topology.criticalPath.length}`);
        console.log(`Critical path: [${topology.criticalPath.stepIds.join(' → ')}]`);
        console.log(`Parallel groups: ${topology.parallelGroups.length}`);

        for (const group of topology.parallelGroups) {
          console.log(
            `  Depth ${group.depth}: [${group.stepIds.join(', ')}] (${
              group.parallelizableStepIds.length
            } parallelizable)`
          );
        }
      }

      // Assertions
      expect(result.plan).toBeDefined();
      expect(result.plan.steps.length).toBeGreaterThan(0);
      expect(result.plan.goalSummary).toBeTruthy();

      // The plan should be valid (no structural errors)
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Basic sanity checks for this specific goal
      expect(result.plan.steps.length).toBeGreaterThanOrEqual(2); // At least research + synthesize

      // Should have research and synthesize steps
      const stepTypes = new Set(result.plan.steps.map((step) => step.type));
      expect(stepTypes.has('research')).toBe(true);
      expect(stepTypes.has('synthesize')).toBe(true);

      console.log('\n=== BLACK TRIANGLE: SUCCESS ===');
    }
  );
});
