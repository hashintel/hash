#!/usr/bin/env tsx
/**
 * Plan Execution TUI Demo
 *
 * A terminal UI for visualizing plan generation and execution.
 * Uses @clack/prompts to display streaming events in real-time.
 *
 * Modes:
 * - Real mode (default): Uses LLM to generate plans from fixture goals
 * - Mock mode (--mock): Uses cached plans for fast iteration
 *
 * Usage:
 *   npx tsx src/mastra/scripts/demo-plan-execution.ts
 *   npx tsx src/mastra/scripts/demo-plan-execution.ts --mock
 *   npx tsx src/mastra/scripts/demo-plan-execution.ts --fixture=summarize-papers
 *   npx tsx src/mastra/scripts/demo-plan-execution.ts --mock --fixture=ct-database-goal
 *   npx tsx src/mastra/scripts/demo-plan-execution.ts --mock --fast  # 100ms delay for testing
 */

// eslint-disable-next-line id-length -- clack convention
import * as p from "@clack/prompts";
import color from "picocolors";

import { getMockPlan } from "../fixtures/mock-plans";
import { ctDatabaseGoalFixture } from "../fixtures/planning-goals/ct-database-goal";
import { exploreAndRecommendFixture } from "../fixtures/planning-goals/explore-and-recommend";
import { hypothesisValidationFixture } from "../fixtures/planning-goals/hypothesis-validation";
import { summarizePapersFixture } from "../fixtures/planning-goals/summarize-papers";
import type {
  Executor,
  PlanSpec,
  PlanStep,
  StepType,
} from "../schemas/plan-spec";
import type { PlanningGoal } from "../schemas/planning-goal";
import {
  type CompositePlanScore,
  scorePlanComposite,
} from "../scorers/plan-scorers";
import {
  compilePlanToWorkflow,
  type PlanExecutionEvent,
} from "../utils/plan-compiler";
import { planningWorkflow } from "../workflows/planning-workflow";

// =============================================================================
// FIXTURES
// =============================================================================

/**
 * All available fixtures with display metadata.
 */
/**
 * Score threshold for plan quality. Below this triggers revision in production.
 */
const SCORE_THRESHOLD = 0.6;

const FIXTURES: Array<{
  fixture: PlanningGoal;
  label: string;
  hint: string;
}> = [
  {
    fixture: summarizePapersFixture,
    label: "Summarize Papers",
    hint: "Simplest — parallel research → synthesize (3-6 steps)",
  },
  {
    fixture: exploreAndRecommendFixture,
    label: "Explore & Recommend",
    hint: "Medium — parallel research → evaluative synthesis (4-8 steps)",
  },
  {
    fixture: hypothesisValidationFixture,
    label: "Hypothesis Validation",
    hint: "Complex — research → experiment → synthesize (5-10 steps)",
  },
  {
    fixture: ctDatabaseGoalFixture,
    label: "CT Database Goal",
    hint: "Full R&D cycle — all step types (8-15+ steps)",
  },
];

/**
 * Custom goals added by the user during this session.
 * Persists across demo iterations until the process exits.
 */
interface CustomGoal {
  id: string;
  label: string;
  input: PlanningGoal["input"];
  cachedPlan?: PlanSpec;
}

const customGoals: CustomGoal[] = [];

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

interface CliArgs {
  mock: boolean;
  fast: boolean;
  fixture?: string;
  delay?: number;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    mock: false,
    fast: false,
  };

  for (const arg of args) {
    if (arg === "--mock") {
      result.mock = true;
    } else if (arg === "--fast") {
      result.fast = true;
    } else if (arg.startsWith("--fixture=")) {
      result.fixture = arg.split("=")[1];
    } else if (arg.startsWith("--delay=")) {
      result.delay = Number.parseInt(arg.split("=")[1]!, 10);
    }
  }

  return result;
}

// =============================================================================
// CUSTOM GOAL INPUT
// =============================================================================

/**
 * Prompt user for a custom research goal with guided input and confirmation.
 * Returns the CustomGoal object, or undefined if cancelled.
 */
async function promptForCustomGoal(): Promise<CustomGoal | undefined> {
  let goalText = "";
  let contextText = "";
  let confirmed = false;

  // Loop until confirmed or cancelled
  while (!confirmed) {
    // Goal input with hints
    p.note(
      `A good research goal is specific and outcome-focused.\n` +
        `Examples:\n` +
        `  • "Validate whether RAG improves accuracy for legal Q&A"\n` +
        `  • "Compare embedding models for scientific paper search"\n` +
        `  • "Determine optimal chunk size for document retrieval"`,
      "Goal guidance",
    );

    const goalResult = await p.text({
      message: "Describe your research goal:",
      placeholder: "Determine whether X is more effective than Y for Z",
      initialValue: goalText,
      validate: (value) => {
        if (value.length < 10) {
          return "Please provide a more detailed goal (at least 10 characters)";
        }
      },
    });

    if (p.isCancel(goalResult)) {
      return undefined;
    }
    goalText = goalResult;

    // Context input with hints
    p.note(
      `Context helps the planner understand constraints and background.\n` +
        `Examples:\n` +
        `  • Available resources, timeline, or technical constraints\n` +
        `  • Domain knowledge or assumptions to consider\n` +
        `  • Prior work or approaches already attempted`,
      "Context guidance",
    );

    const contextResult = await p.text({
      message: "Provide context:",
      placeholder: "Background information, constraints, assumptions...",
      initialValue: contextText,
      validate: (value) => {
        if (value.length < 10) {
          return "Please provide some context (at least 10 characters)";
        }
      },
    });

    if (p.isCancel(contextResult)) {
      return undefined;
    }
    contextText = contextResult;

    // Confirmation step
    p.note(
      `${color.bold("Goal:")}\n${goalText}\n\n${color.bold("Context:")}\n${contextText}`,
      "Review your input",
    );

    const confirmResult = await p.select({
      message: "Proceed with this goal?",
      options: [
        { value: "yes", label: "Yes, generate plan" },
        { value: "edit", label: "Edit goal and context" },
        { value: "cancel", label: "Cancel" },
      ],
    });

    if (p.isCancel(confirmResult) || confirmResult === "cancel") {
      return undefined;
    }

    if (confirmResult === "yes") {
      confirmed = true;
    }
    // If "edit", loop continues with pre-filled values
  }

  // Create and return the custom goal
  const goalId = `custom-${Date.now()}`;
  const truncatedLabel =
    goalText.length > 40 ? `${goalText.slice(0, 37)}...` : goalText;

  return {
    id: goalId,
    label: truncatedLabel,
    input: {
      id: goalId,
      goal: goalText,
      context: contextText,
    },
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// =============================================================================
// UI HELPERS
// =============================================================================

const STEP_TYPE_ICONS: Record<StepType, string> = {
  research: "🔍",
  synthesize: "🔗",
  experiment: "🧪",
  develop: "🛠️",
};

const STEP_TYPE_COLORS: Record<StepType, (s: string) => string> = {
  research: color.blue,
  synthesize: color.magenta,
  experiment: color.yellow,
  develop: color.green,
};

function formatStepType(stepType: StepType): string {
  const icon = STEP_TYPE_ICONS[stepType];
  const colorFn = STEP_TYPE_COLORS[stepType];
  return `${icon} ${colorFn(stepType)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function getExecutorRef(executor: Executor): string {
  if (executor.kind === "human") {
    return "human";
  }
  return executor.ref;
}

/**
 * Write a line to stdout without extra spacing.
 * Clack's p.log.message() adds blank lines between messages,
 * which is too verbose for streaming output.
 */
function writeLine(line: string): void {
  process.stdout.write(`${color.gray("│")}  ${line}\n`);
}

/**
 * Format a step for display in the plan visualization.
 */
function formatStepForDisplay(step: PlanStep, depth: number): string[] {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const icon = STEP_TYPE_ICONS[step.type];
  const colorFn = STEP_TYPE_COLORS[step.type];

  // Main step line
  lines.push(`${indent}${icon} ${colorFn(step.id)} — ${step.description}`);

  // Dependencies
  if (step.dependencyIds.length > 0) {
    lines.push(
      `${indent}   ${color.dim(`depends on: ${step.dependencyIds.join(", ")}`)}`,
    );
  }

  // Executor
  lines.push(
    `${indent}   ${color.dim(`executor: ${getExecutorRef(step.executor)}`)}`,
  );

  // Type-specific metadata
  switch (step.type) {
    case "research":
      lines.push(`${indent}   ${color.dim("query:")} ${step.query}`);
      lines.push(
        `${indent}   ${color.dim("stopping rule:")} ${step.stoppingRule}`,
      );
      break;

    case "experiment":
      lines.push(`${indent}   ${color.dim("mode:")} ${step.mode}`);
      if (step.hypothesisIds.length > 0) {
        lines.push(
          `${indent}   ${color.dim("hypotheses:")} ${step.hypothesisIds.join(", ")}`,
        );
      }
      if (step.successCriteria.length > 0) {
        lines.push(`${indent}   ${color.dim("success criteria:")}`);
        for (const criterion of step.successCriteria) {
          lines.push(`${indent}     ${color.dim("•")} ${criterion}`);
        }
      }
      if (
        step.preregisteredCommitments &&
        step.preregisteredCommitments.length > 0
      ) {
        lines.push(`${indent}   ${color.dim("preregistered commitments:")}`);
        for (const commitment of step.preregisteredCommitments) {
          lines.push(`${indent}     ${color.dim("•")} ${commitment}`);
        }
      }
      if (step.expectedOutcomes.length > 0) {
        lines.push(`${indent}   ${color.dim("expected outcomes:")}`);
        for (const outcome of step.expectedOutcomes) {
          lines.push(`${indent}     ${color.dim("•")} ${outcome}`);
        }
      }
      break;

    case "synthesize":
      lines.push(`${indent}   ${color.dim("mode:")} ${step.mode}`);
      if (
        step.mode === "evaluative" &&
        step.evaluateAgainst &&
        step.evaluateAgainst.length > 0
      ) {
        lines.push(
          `${indent}   ${color.dim("evaluate against:")} ${step.evaluateAgainst.join(", ")}`,
        );
      }
      break;

    case "develop":
      lines.push(
        `${indent}   ${color.dim("specification:")} ${step.specification}`,
      );
      if (step.deliverables.length > 0) {
        lines.push(`${indent}   ${color.dim("deliverables:")}`);
        for (const deliverable of step.deliverables) {
          lines.push(`${indent}     ${color.dim("•")} ${deliverable}`);
        }
      }
      break;
  }

  return lines;
}

/**
 * Display a nicely formatted visualization of the generated plan.
 * Uses direct stdout writes to avoid extra blank lines from p.log.message().
 */
function displayPlanVisualization(plan: PlanSpec): void {
  p.log.step("Generated Plan Structure:");

  // Goal summary
  writeLine(`${color.bold("Goal:")} ${plan.goalSummary}`);

  // Plan metadata (optional fields)
  if (plan.aimType || plan.estimatedComplexity) {
    writeLine("");
    if (plan.aimType) {
      writeLine(`${color.dim("Aim Type:")} ${plan.aimType}`);
    }
    if (plan.estimatedComplexity) {
      const complexityColor =
        plan.estimatedComplexity === "high"
          ? color.red
          : plan.estimatedComplexity === "medium"
            ? color.yellow
            : color.green;
      writeLine(
        `${color.dim("Estimated Complexity:")} ${complexityColor(plan.estimatedComplexity)}`,
      );
    }
  }

  // Requirements
  if (plan.requirements.length > 0) {
    writeLine("");

    // Count by priority
    const mustCount = plan.requirements.filter(
      (req) => req.priority === "must",
    ).length;
    const shouldCount = plan.requirements.filter(
      (req) => req.priority === "should",
    ).length;
    const couldCount = plan.requirements.filter(
      (req) => req.priority === "could",
    ).length;

    writeLine(
      `${color.bold("Requirements:")} ${color.red(`${mustCount} must`)}, ${color.yellow(`${shouldCount} should`)}, ${color.dim(`${couldCount} could`)}`,
    );

    for (const req of plan.requirements) {
      const priorityColor =
        req.priority === "must"
          ? color.red
          : req.priority === "should"
            ? color.yellow
            : color.dim;
      writeLine(
        `  ${priorityColor(`[${req.priority}]`)} ${req.id}: ${req.description}`,
      );
    }
  }

  // Hypotheses
  if (plan.hypotheses.length > 0) {
    writeLine("");
    writeLine(color.bold("Hypotheses:"));
    for (const hyp of plan.hypotheses) {
      // Status color coding
      const statusColors: Record<string, (s: string) => string> = {
        untested: color.dim,
        testing: color.yellow,
        supported: color.green,
        refuted: color.red,
        inconclusive: color.gray,
      };
      const statusColorFn = statusColors[hyp.status] ?? color.dim;

      writeLine(`  ${color.cyan(hyp.id)}: ${hyp.statement}`);
      writeLine(`    ${color.dim("status:")} ${statusColorFn(hyp.status)}`);
      writeLine(`    ${color.dim("testable via:")} ${hyp.testableVia}`);

      // Show assumptions if present
      if (hyp.assumptions.length > 0) {
        writeLine(`    ${color.dim("assumptions:")}`);
        for (const assumption of hyp.assumptions) {
          writeLine(`      ${color.dim("•")} ${assumption}`);
        }
      }
    }
  }

  // Steps organized by depth
  writeLine("");
  writeLine(color.bold("Execution Steps:"));

  // Group steps by their dependencies to show structure
  const entrySteps = plan.steps.filter(
    (step) => step.dependencyIds.length === 0,
  );
  const otherSteps = plan.steps.filter((step) => step.dependencyIds.length > 0);

  // Show entry points (depth 0)
  if (entrySteps.length > 0) {
    writeLine(color.dim("  ┌─ Entry points (parallel):"));
    for (const step of entrySteps) {
      for (const line of formatStepForDisplay(step, 1)) {
        writeLine(line);
      }
    }
  }

  // Show dependent steps
  if (otherSteps.length > 0) {
    writeLine(color.dim("  │"));
    writeLine(color.dim("  └─ Dependent steps:"));
    for (const step of otherSteps) {
      for (const line of formatStepForDisplay(step, 1)) {
        writeLine(line);
      }
    }
  }

  // Unknowns map - show all items
  writeLine("");
  writeLine(color.bold("Unknowns Map:"));

  // Known knowns
  writeLine(
    `  ${color.green(`Known Knowns (${plan.unknownsMap.knownKnowns.length}):`)}`,
  );
  for (const item of plan.unknownsMap.knownKnowns) {
    writeLine(`    ${color.dim("•")} ${item}`);
  }

  // Known unknowns
  writeLine(
    `  ${color.yellow(`Known Unknowns (${plan.unknownsMap.knownUnknowns.length}):`)}`,
  );
  for (const item of plan.unknownsMap.knownUnknowns) {
    writeLine(`    ${color.dim("•")} ${item}`);
  }

  // Unknown unknowns with detection signals
  writeLine(
    `  ${color.red(`Unknown Unknowns (${plan.unknownsMap.unknownUnknowns.length}):`)}`,
  );
  for (const uu of plan.unknownsMap.unknownUnknowns) {
    writeLine(`    ${color.dim("•")} Surprise: ${uu.potentialSurprise}`);
    writeLine(`      ${color.dim("Signal:")} ${uu.detectionSignal}`);
  }

  // Community check
  writeLine(`  ${color.cyan("Community Check:")}`);
  writeLine(`    ${color.dim(plan.unknownsMap.communityCheck)}`);
}

// =============================================================================
// PLAN SCORING DISPLAY
// =============================================================================

/**
 * Create a visual score bar like [████████░░] for a score 0-1.
 */
function scoreBar(score: number, width: number = 10): string {
  const filled = Math.round(score * width);
  const empty = width - filled;
  return `[${color.green("█".repeat(filled))}${color.dim("░".repeat(empty))}]`;
}

/**
 * Get color function and label for overall score.
 */
function scoreQuality(score: number): {
  colorFn: (s: string) => string;
  label: string;
} {
  if (score >= 0.7) {
    return { colorFn: color.green, label: "Good" };
  }
  if (score >= 0.5) {
    return { colorFn: color.yellow, label: "Fair" };
  }
  return { colorFn: color.red, label: "Poor" };
}

/**
 * Display plan quality scores with visual breakdown.
 */
function displayPlanScores(scores: CompositePlanScore): void {
  // Visual separator
  writeLine("");
  process.stdout.write(`${color.dim("═".repeat(60))}\n`);
  p.log.step("Plan Quality Scores");

  // Overall score
  const { colorFn, label } = scoreQuality(scores.overall);
  writeLine(
    `${color.bold("Overall:")} ${colorFn(scores.overall.toFixed(2))} ${colorFn(label)}`,
  );
  writeLine("");

  // Component scores with weights
  const components: Array<{
    name: string;
    weight: string;
    score: number;
    reason: string;
  }> = [
    {
      name: "Structure",
      weight: "25%",
      score: scores.structure.score,
      reason: scores.structure.reason,
    },
    {
      name: "Coverage",
      weight: "30%",
      score: scores.coverage.score,
      reason: scores.coverage.reason,
    },
    {
      name: "Experiment",
      weight: "25%",
      score: scores.experimentRigor.score,
      reason: scores.experimentRigor.reason,
    },
    {
      name: "Unknowns",
      weight: "20%",
      score: scores.unknownsCoverage.score,
      reason: scores.unknownsCoverage.reason,
    },
  ];

  for (const comp of components) {
    const nameLabel = `${comp.name.padEnd(12)} (${comp.weight})`;
    writeLine(
      `${color.dim(nameLabel)} ${scoreBar(comp.score)} ${comp.score.toFixed(2)}`,
    );
    // Truncate reason to fit nicely
    const maxReasonLen = 70;
    const reasonDisplay =
      comp.reason.length > maxReasonLen
        ? `${comp.reason.slice(0, maxReasonLen)}...`
        : comp.reason;
    writeLine(`  ${color.dim(reasonDisplay)}`);
  }

  // Threshold warning if applicable
  if (scores.overall < SCORE_THRESHOLD) {
    writeLine("");
    writeLine(
      color.yellow(
        `⚠ Score ${scores.overall.toFixed(2)} is below threshold (${SCORE_THRESHOLD.toFixed(2)})`,
      ),
    );
    writeLine(
      color.dim("  In production, this would trigger a revision loop."),
    );
    writeLine(color.dim("  Proceeding with mock execution for demo purposes."));
  }
}

// =============================================================================
// PLAN GENERATION
// =============================================================================

/**
 * Generate a plan from a fixture goal.
 * In mock mode, returns the cached plan. Otherwise, uses the LLM.
 */
async function generatePlanFromFixture(
  fixture: PlanningGoal,
  useMock: boolean,
  spinner: ReturnType<typeof p.spinner>,
): Promise<{ plan: PlanSpec; fromCache: boolean }> {
  const fixtureId = fixture.input.id;

  if (useMock) {
    spinner.message(`Loading cached plan for ${fixtureId}...`);
    await delay(300); // Brief delay for visual feedback

    const mockPlan = getMockPlan(fixtureId);
    if (!mockPlan) {
      throw new Error(`No mock plan found for fixture: ${fixtureId}`);
    }
    return { plan: mockPlan, fromCache: true };
  }

  // Real LLM generation
  spinner.message(`Generating plan from goal (this may take 30-60s)...`);

  const run = await planningWorkflow.createRun();
  const result = await run.start({
    inputData: {
      goal: fixture.input.goal,
      context: fixture.input.context,
      maxAttempts: 3,
    },
  });

  if (result.status !== "success") {
    throw new Error(`Planning workflow failed: ${result.status}`);
  }

  // The result includes the output with plan, valid, attempts
  const output = result.result as {
    plan: PlanSpec;
    valid: boolean;
    attempts: number;
  };

  if (!output.valid) {
    p.log.warn(
      `Plan generated but validation failed after ${output.attempts} attempts`,
    );
  }

  return { plan: output.plan, fromCache: false };
}

// =============================================================================
// PLAN EXECUTION
// =============================================================================
/**
 * Execute a plan and stream progress to the TUI.
 *
 * NOTE: We intentionally avoid using spinners during streaming because
 * spinners use cursor positioning (ANSI escape codes) that can interfere
 * with log output, causing display corruption. Instead, we use plain
 * stdout writes which are append-only and don't move the cursor.
 */
async function executePlan(
  plan: PlanSpec,
  delayMs: number,
): Promise<{ success: boolean; completedSteps: number; errorCount: number }> {
  // Track state for UI updates
  const stepStates = new Map<
    string,
    { status: "pending" | "running" | "done" | "error"; startTime?: number }
  >();
  for (const step of plan.steps) {
    stepStates.set(step.id, { status: "pending" });
  }

  let completedSteps = 0;
  let errorCount = 0;

  // Compile the plan with mock agents
  const workflow = compilePlanToWorkflow(plan, {
    useMockAgents: true,
    mockDelayMs: delayMs,
  });

  // Create workflow run and stream
  const run = await workflow.createRun();
  const stream = run.stream({ inputData: { context: {} } });

  // Process streaming events using direct stdout writes (no spinner, no extra spacing)
  for await (const chunk of stream.fullStream) {
    if (!chunk.type.startsWith("data-plan-")) {
      continue;
    }

    const event = chunk as unknown as PlanExecutionEvent;

    switch (event.type) {
      case "data-plan-start": {
        writeLine(
          `${color.dim("┌")} Plan started: ${color.cyan(event.data.planId)}`,
        );
        writeLine(
          `${color.dim("│")} Steps: ${event.data.totalSteps}, Critical path: ${
            event.data.criticalPathLength
          }, Parallel groups: ${event.data.parallelGroups}`,
        );
        break;
      }

      case "data-plan-step-start": {
        const { stepId, stepType, description, depth } = event.data;
        stepStates.set(stepId, { status: "running", startTime: Date.now() });

        const stepInfo = plan.steps.find((step) => step.id === stepId);
        const depthIndicator = color.dim(`d${depth}`);

        writeLine(
          `${color.dim("│")} ${color.yellow("▶")} ${formatStepType(stepType)} ${color.bold(
            stepId,
          )} ${depthIndicator} — ${color.dim(description)}`,
        );

        if (stepInfo?.executor) {
          writeLine(
            `${color.dim("│")}   executor: ${color.cyan(getExecutorRef(stepInfo.executor))}`,
          );
        }
        break;
      }

      case "data-plan-step-complete": {
        const { stepId, stepType, durationMs } = event.data;
        stepStates.set(stepId, { status: "done" });
        completedSteps++;

        writeLine(
          `${color.dim("│")} ${color.green("✓")} ${formatStepType(stepType)} ${color.bold(
            stepId,
          )} ${color.dim(`(${formatDuration(durationMs)})`)} ${color.dim(
            `[${completedSteps}/${plan.steps.length}]`,
          )}`,
        );
        break;
      }

      case "data-plan-step-error": {
        const { stepId, stepType, error, durationMs } = event.data;
        stepStates.set(stepId, { status: "error" });
        errorCount++;

        writeLine(
          `${color.dim("│")} ${color.red("✗")} ${formatStepType(stepType)} ${color.bold(stepId)} ${color.dim(
            `(${formatDuration(durationMs)})`,
          )}`,
        );
        writeLine(`${color.dim("│")}   ${color.red(error)}`);
        break;
      }

      case "data-plan-depth-transition": {
        const {
          fromDepth,
          toDepth,
          stepsCompletedAtDepth,
          stepsStartingAtDepth,
        } = event.data;

        writeLine(
          `${color.dim("├──")} Depth ${fromDepth} → ${toDepth} ${color.dim(
            `(${stepsCompletedAtDepth} done, ${stepsStartingAtDepth} starting)`,
          )}`,
        );
        break;
      }

      case "data-plan-progress": {
        // Progress is shown inline with step completion
        break;
      }

      case "data-plan-complete": {
        const {
          planId,
          success,
          totalDurationMs,
          stepsCompleted,
          stepsFailed,
        } = event.data;

        writeLine(
          `${color.dim("└")} ${success ? color.green("Done") : color.red("Failed")}: ${planId} — ${color.cyan(
            formatDuration(totalDurationMs),
          )}, ${stepsCompleted} completed, ${stepsFailed} failed`,
        );
        break;
      }
    }
  }

  return {
    success: errorCount === 0,
    completedSteps,
    errorCount,
  };
}

// =============================================================================
// MAIN LOOP
// =============================================================================

/**
 * Run a single demo iteration.
 * Returns true to continue looping, false to exit.
 */
async function runDemoIteration(cliArgs: CliArgs): Promise<boolean> {
  // Fixture selection - use CLI arg or prompt
  // Using definite assignment assertion - the loop logic guarantees assignment before use
  let selectedFixture!: PlanningGoal;
  let customGoalRef: CustomGoal | undefined; // Track if this is a custom goal (for caching)

  if (cliArgs.fixture) {
    const found = FIXTURES.find(
      (item) => item.fixture.input.id === cliArgs.fixture,
    );
    if (!found) {
      p.log.error(`Unknown fixture: ${cliArgs.fixture}`);
      p.log.info(
        `Available: ${FIXTURES.map((item) => item.fixture.input.id).join(", ")}`,
      );
      return false;
    }
    selectedFixture = found.fixture;
    p.log.info(`Fixture: ${color.cyan(found.label)} (from CLI)`);
  } else {
    // Fixture selection loop (allows retry on cancel from custom goal prompt)
    let selectionComplete = false;
    while (!selectionComplete) {
      // Build options: presets + custom goals + add option (real mode only) + exit
      const presetOptions = FIXTURES.map((item) => ({
        value: item.fixture.input.id,
        label: item.label,
        hint: item.hint,
      }));

      const customGoalOptions = customGoals.map((cg) => ({
        value: cg.id,
        label: cg.label,
        hint: cg.cachedPlan ? "Custom (cached)" : "Custom",
      }));

      const addCustomOption = cliArgs.mock
        ? [] // Don't show "Add custom goal" in mock mode
        : [
            {
              value: "__add_custom__",
              label: "Add custom goal...",
              hint: "Enter your own research goal",
            },
          ];

      const fixtureChoice = await p.select({
        message: "Select a fixture:",
        options: [
          ...presetOptions,
          ...customGoalOptions,
          ...addCustomOption,
          { value: "__exit__", label: "Exit", hint: "Quit the demo" },
        ],
      });

      if (p.isCancel(fixtureChoice) || fixtureChoice === "__exit__") {
        return false;
      }

      // Handle "Add custom goal" selection
      if (fixtureChoice === "__add_custom__") {
        const newCustomGoal = await promptForCustomGoal();
        if (!newCustomGoal) {
          // User cancelled, restart fixture selection
          continue;
        }
        customGoals.push(newCustomGoal);
        customGoalRef = newCustomGoal;
        // Create a minimal PlanningGoal for custom goals
        selectedFixture = {
          input: newCustomGoal.input,
          expected: {
            shouldHaveHypotheses: false,
            shouldHaveExperiments: false,
            shouldHaveConcurrentResearch: true,
            minSteps: 3,
            maxSteps: 15,
            expectedStepTypes: ["research"],
          },
        };
        selectionComplete = true;
      } else {
        // Check if it's a custom goal
        const existingCustomGoal = customGoals.find(
          (cg) => cg.id === fixtureChoice,
        );
        if (existingCustomGoal) {
          customGoalRef = existingCustomGoal;
          selectedFixture = {
            input: existingCustomGoal.input,
            expected: {
              shouldHaveHypotheses: false,
              shouldHaveExperiments: false,
              shouldHaveConcurrentResearch: true,
              minSteps: 3,
              maxSteps: 15,
              expectedStepTypes: ["research"],
            },
          };
        } else {
          // It's a preset fixture
          selectedFixture = FIXTURES.find(
            (item) => item.fixture.input.id === fixtureChoice,
          )!.fixture;
        }
        selectionComplete = true;
      }
    }
  }

  // Display goal
  p.log.step("Goal:");
  p.log.message(color.dim(selectedFixture.input.goal.trim()));

  if (selectedFixture.input.context) {
    p.log.step("Context:");
    p.log.message(color.dim(selectedFixture.input.context.trim()));
  }

  // Phase 1: Generate plan
  p.log.step("Phase 1: Plan Generation");

  const genSpinner = p.spinner();
  genSpinner.start(
    cliArgs.mock ? "Loading cached plan..." : "Generating plan...",
  );

  let plan: PlanSpec;
  let fromCache: boolean;
  try {
    // Check if custom goal has a cached plan
    if (customGoalRef?.cachedPlan) {
      await delay(300); // Brief delay for visual feedback
      plan = customGoalRef.cachedPlan;
      fromCache = true;
    } else {
      const result = await generatePlanFromFixture(
        selectedFixture,
        cliArgs.mock,
        genSpinner,
      );
      plan = result.plan;
      fromCache = result.fromCache;

      // Cache the generated plan on custom goal for future runs
      if (customGoalRef && !fromCache) {
        customGoalRef.cachedPlan = plan;
      }
    }
    genSpinner.stop(
      `Plan ${fromCache ? "loaded" : "generated"}: ${color.cyan(plan.id)} (${plan.steps.length} steps)`,
    );
  } catch (error) {
    // spinner.stop(msg, code) - code 2 is error
    genSpinner.stop(
      `Plan generation failed: ${error instanceof Error ? error.message : String(error)}`,
      2,
    );
    return !cliArgs.fixture; // Continue loop if interactive, exit if CLI-specified fixture
  }

  // Show full plan visualization for both real and cached plans
  displayPlanVisualization(plan);

  // Score the plan and display results
  const scores = scorePlanComposite(plan);
  displayPlanScores(scores);

  // Ask whether to execute and select delay
  let delayMs: number;
  if (cliArgs.fast) {
    delayMs = 100;
    p.log.info(`Mock agent delay: ${color.cyan("100ms")} (--fast mode)`);
  } else if (cliArgs.delay !== undefined) {
    delayMs = cliArgs.delay;
    p.log.info(`Mock agent delay: ${color.cyan(String(delayMs))}ms (from CLI)`);
  } else {
    const executeChoice = await p.select<number | "__back__" | "__exit__">({
      message: "Execute this plan now?",
      options: [
        { value: 1000, label: "Yes — Normal (1s)", hint: "Comfortable pace" },
        { value: 2000, label: "Yes — Slow (2s)", hint: "Easy to follow" },
        { value: 3000, label: "Yes — Very slow (3s)", hint: "Step by step" },
        { value: "__back__", label: "No — pick another goal", hint: "Back" },
        { value: "__exit__", label: "No — exit demo", hint: "Quit" },
      ],
    });

    const selection = executeChoice as number | "__back__" | "__exit__";

    if (p.isCancel(executeChoice) || selection === "__exit__") {
      return false;
    }

    if (selection === "__back__") {
      return !cliArgs.fixture;
    }

    delayMs = selection;
  }

  // Brief pause before execution
  await delay(500);

  // Phase 2: Execute plan
  p.log.step("Phase 2: Plan Execution");

  const { success, completedSteps, errorCount } = await executePlan(
    plan,
    delayMs,
  );

  // Summary
  p.log.message("");
  if (success) {
    p.log.success(`All ${completedSteps} steps completed successfully!`);
  } else {
    p.log.error(
      `Completed with errors: ${completedSteps} done, ${errorCount} failed`,
    );
  }

  // If fixture was specified via CLI, don't loop
  if (cliArgs.fixture) {
    return false;
  }

  // Wait for user to acknowledge before continuing
  // This ensures they can read/scroll the output
  p.log.message("");
  p.log.message(color.dim("─".repeat(50)));

  const runAnother = await p.confirm({
    message: "Run another demo?",
    initialValue: false,
  });

  if (p.isCancel(runAnother) || !runAnother) {
    return false;
  }

  // Add visual separator before next run
  p.log.message("");
  p.log.message(color.bgCyan(color.black(" Next Demo ")));
  p.log.message("");

  return true; // Continue looping
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const cliArgs = parseCliArgs();

  console.clear();

  const modeLabel = cliArgs.mock
    ? color.yellow(" MOCK MODE ")
    : color.green(" REAL MODE ");
  p.intro(`${color.bgCyan(color.black(" Plan Execution Demo "))} ${modeLabel}`);

  if (cliArgs.mock) {
    p.log.info(
      color.dim(
        "Using cached plans for fast iteration. Remove --mock for real LLM calls.",
      ),
    );
  }

  if (cliArgs.fast) {
    p.log.info(color.dim("Fast mode enabled (100ms delays)."));
  }

  // Main loop - the runDemoIteration function handles continue/exit logic
  let continueLoop = true;
  while (continueLoop) {
    continueLoop = await runDemoIteration(cliArgs);
  }

  p.outro(color.dim("Thanks for using the Plan Execution Demo!"));
}

main().catch((err) => {
  p.log.error(String(err));
  process.exit(1);
});
