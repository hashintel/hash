import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/** How a run's canvas and Steps list show a step: what its runs so far add up to. */
export type StepState =
  | "notReached"
  | "running"
  | "needsReview"
  | "done"
  /** A step that ran per item, with some items done and some failed. */
  | "doneWithFailures"
  | "failed"
  | "skipped";

/** The state of one item of a for-each step, or of a step inside one for one item. */
export type ItemState = Exclude<StepState, "doneWithFailures">;

export type ItemCounts = Record<ItemState, number>;

export type StepRunMark = {
  state: StepState;
  /** How many items are in each state, for a for-each step and the steps inside one. `null` for a step that runs once. */
  items: ItemCounts | null;
};

export const notReachedMark: StepRunMark = { state: "notReached", items: null };
/** Start has no step run of its own: it ran as soon as the run did. */
export const startMark: StepRunMark = { state: "done", items: null };

/**
 * What one run of a step did, or why it has none. Finer than the states shown, so that adding runs up keeps apart
 * what shows alike: a step not reached yet, one never reached, one waiting on a failed step and one cancelled part way
 * all show as not reached.
 */
type StepRunOutcome =
  /** No run yet, while its run is live. */
  | "pending"
  /** No run, and its run has stopped. */
  | "unreached"
  /**
   * No run, or a cancelled one, as another step for its item failed: the steps after a failed one wait on it and never
   * start, and those under way when it failed are cancelled.
   */
  | "blocked"
  | "running"
  | "needsReview"
  | "completed"
  | "failed"
  | "timedOut"
  /** Cancelled, or being cancelled, part way through. */
  | "cancelled"
  /** Skipped by the run itself, rather than stopped. */
  | "skipped";

const outcomeOfStatus: Record<FlowStepStatus, StepRunOutcome> = {
  [FlowStepStatus.Scheduled]: "running",
  [FlowStepStatus.Started]: "running",
  [FlowStepStatus.Completed]: "completed",
  [FlowStepStatus.InformationRequired]: "needsReview",
  [FlowStepStatus.Failed]: "failed",
  [FlowStepStatus.TimedOut]: "timedOut",
  [FlowStepStatus.CancelRequested]: "cancelled",
  [FlowStepStatus.Cancelled]: "cancelled",
  [FlowStepStatus.Skipped]: "skipped",
};

/** How a step run shows: on a card of its own, or as its item's part of its card's status bar. */
const stateOfOutcome: Record<StepRunOutcome, ItemState> = {
  pending: "notReached",
  unreached: "notReached",
  blocked: "notReached",
  running: "running",
  needsReview: "needsReview",
  completed: "done",
  failed: "failed",
  timedOut: "failed",
  /* A step cancelled part way never finished, like one its run never reached. */
  cancelled: "notReached",
  skipped: "skipped",
};

/** What one item of a for-each step came to, or what one step run counts as when a step's runs across items add up. */
type ItemOutcome =
  | "pending"
  | "running"
  | "needsReview"
  | "completed"
  | "failed"
  /** Its run stopped before it finished, however far it got. */
  | "stopped"
  | "skipped";

type UnblockedOutcome = Exclude<StepRunOutcome, "blocked">;

/** What a step run counts as in its item, or in its step across items. A blocked run counts as neither. */
const itemOutcomeOfStepRun: Record<UnblockedOutcome, ItemOutcome> = {
  pending: "pending",
  unreached: "stopped",
  cancelled: "stopped",
  running: "running",
  needsReview: "needsReview",
  completed: "completed",
  failed: "failed",
  timedOut: "failed",
  skipped: "skipped",
};

/** How an item shows in its for-each step's counts and status bar. */
const stateOfItemOutcome: Record<ItemOutcome, ItemState> = {
  pending: "notReached",
  running: "running",
  needsReview: "needsReview",
  completed: "done",
  failed: "failed",
  /* Items stopped part way and items never started count alike. */
  stopped: "notReached",
  skipped: "skipped",
};

/** In the order a bar draws them: what's finished first, what's still to come last. */
const itemStates: ItemState[] = [
  "done",
  "failed",
  "needsReview",
  "running",
  "skipped",
  "notReached",
];

const countItems = (states: ItemState[]): ItemCounts => {
  const counts = Object.fromEntries(
    itemStates.map((state) => [state, 0]),
  ) as ItemCounts;

  for (const state of states) {
    counts[state] += 1;
  }

  return counts;
};

const isFailure = (outcome: StepRunOutcome) =>
  outcome === "failed" || outcome === "timedOut";

const isUnblocked = (outcome: StepRunOutcome): outcome is UnblockedOutcome =>
  outcome !== "blocked";

const toItemOutcomes = (outcomes: StepRunOutcome[]): ItemOutcome[] =>
  outcomes.filter(isUnblocked).map((outcome) => itemOutcomeOfStepRun[outcome]);

/**
 * What an item came to from its steps' outcomes for it. A failure in any step fails it. While its run is `live`,
 * steps not run yet or being cancelled keep it running; once the run has stopped, they mean it stopped.
 */
const getItemOutcome = (
  stepOutcomes: StepRunOutcome[],
  live: boolean,
): ItemOutcome => {
  const outcomes = toItemOutcomes(stepOutcomes);

  if (outcomes.includes("needsReview")) {
    return "needsReview";
  }

  if (outcomes.includes("running")) {
    return "running";
  }

  if (outcomes.includes("failed")) {
    return "failed";
  }

  if (
    outcomes.length > 0 &&
    outcomes.every((outcome) => outcome === "pending")
  ) {
    return "pending";
  }

  if (outcomes.includes("pending") || outcomes.includes("stopped")) {
    return live ? "running" : "stopped";
  }

  return outcomes.length > 0 &&
    outcomes.every((outcome) => outcome === "skipped")
    ? "skipped"
    : "completed";
};

/**
 * What outcomes add up to: a for-each step's items, or a step inside one across its items. With none finished, it's
 * not reached. While its run is `live`, outcomes not reached yet or being cancelled keep it running. Once the run has
 * stopped, failures show first, then anything stopped part way, as skipped.
 */
const getStateOfOutcomes = (
  outcomes: ItemOutcome[],
  live: boolean,
): StepState => {
  if (outcomes.includes("needsReview")) {
    return "needsReview";
  }

  if (outcomes.includes("running")) {
    return "running";
  }

  if (
    outcomes.length > 0 &&
    outcomes.every((outcome) => outcome === "pending" || outcome === "stopped")
  ) {
    return "notReached";
  }

  if (live && (outcomes.includes("pending") || outcomes.includes("stopped"))) {
    return "running";
  }

  if (outcomes.includes("failed")) {
    return outcomes.includes("completed") ? "doneWithFailures" : "failed";
  }

  if (outcomes.includes("stopped")) {
    return "skipped";
  }

  return outcomes.length > 0 &&
    outcomes.every((outcome) => outcome === "skipped")
    ? "skipped"
    : "done";
};

/** The number of items each for-each step started, by its id, as the run last started it. */
const getItemCountByStepId = (events: FlowRunEvent[]) => {
  const itemCountByStepId = new Map<string, number>();

  for (const event of events) {
    if (event.kind === "forEachStarted") {
      itemCountByStepId.set(event.stepRun.stepId, event.itemCount);
    }
  }

  return itemCountByStepId;
};

/**
 * Each step's mark in a run, by step id, including the steps inside for-each steps. A step with no run of its own is
 * not reached. A for-each step has no run of its own unless it was skipped: it starts its items, and its state is
 * what they came to.
 *
 * `live` is whether the run is still going, so more of its steps will run.
 */
export const getStepRunMarks = ({
  steps,
  stepRuns,
  events,
  live,
}: {
  steps: StepDefinition<string>[];
  stepRuns: FlowRunStepRunState[];
  events: FlowRunEvent[];
  live: boolean;
}): Map<string, StepRunMark> => {
  const statusByStepRunId = new Map(
    stepRuns.map(({ stepId, status }) => [stepId, status]),
  );
  const itemCountByStepId = getItemCountByStepId(events);
  const marks = new Map<string, StepRunMark>();

  const noRunOutcome: StepRunOutcome = live ? "pending" : "unreached";

  const getOutcome = (
    stepRunId: string,
    itemFailed: boolean,
  ): StepRunOutcome => {
    const status = statusByStepRunId.get(stepRunId);
    const outcome =
      status === undefined ? noRunOutcome : outcomeOfStatus[status];

    return itemFailed && (outcome === noRunOutcome || outcome === "cancelled")
      ? "blocked"
      : outcome;
  };

  for (const step of steps) {
    if (step.kind === "action") {
      marks.set(step.stepId, {
        state: stateOfOutcome[getOutcome(step.stepId, false)],
        items: null,
      });
      continue;
    }

    const itemCount = itemCountByStepId.get(step.stepId);

    /* Never started: skipped or not reached itself, with none of its steps reached. */
    if (itemCount === undefined) {
      for (const innerStep of step.steps) {
        marks.set(innerStep.stepId, {
          state: "notReached",
          items: countItems([]),
        });
      }

      marks.set(step.stepId, {
        state: stateOfOutcome[getOutcome(step.stepId, false)],
        items: countItems([]),
      });
      continue;
    }

    /* With no items, there was nothing to run its steps for. */
    if (itemCount === 0) {
      for (const innerStep of step.steps) {
        marks.set(innerStep.stepId, {
          state: "skipped",
          items: countItems([]),
        });
      }

      marks.set(step.stepId, { state: "done", items: countItems([]) });
      continue;
    }

    const itemIndexes = Array.from(
      { length: itemCount },
      (_, itemIndex) => itemIndex,
    );

    const failedItemIndexes = new Set(
      itemIndexes.filter((itemIndex) =>
        step.steps.some(({ stepId }) =>
          isFailure(getOutcome(generateStepRunId(stepId, itemIndex), false)),
        ),
      ),
    );

    const getItemStepOutcome = (stepId: string, itemIndex: number) =>
      getOutcome(
        generateStepRunId(stepId, itemIndex),
        failedItemIndexes.has(itemIndex),
      );

    for (const { stepId } of step.steps) {
      const outcomes = itemIndexes.map((itemIndex) =>
        getItemStepOutcome(stepId, itemIndex),
      );
      const reachable = toItemOutcomes(outcomes);

      marks.set(stepId, {
        state:
          reachable.length > 0
            ? getStateOfOutcomes(reachable, live)
            : "notReached",
        items: countItems(outcomes.map((outcome) => stateOfOutcome[outcome])),
      });
    }

    const itemOutcomes = itemIndexes.map((itemIndex) =>
      getItemOutcome(
        step.steps.map(({ stepId }) => getItemStepOutcome(stepId, itemIndex)),
        live,
      ),
    );
    const state = getStateOfOutcomes(itemOutcomes, live);

    marks.set(step.stepId, {
      /* Once started, it's under way until its items are, even before any of them has, or stopped part way. */
      state: state === "notReached" ? (live ? "running" : "skipped") : state,
      items: countItems(
        itemOutcomes.map((outcome) => stateOfItemOutcome[outcome]),
      ),
    });
  }

  return marks;
};

/** A part of a card's status bar, as wide as its share of the weights. */
export type BarSegment = { state: ItemState; weight: number };

/**
 * A card's status bar. A step that runs once fills it with its state; one that runs per item splits it by its items'
 * states, in proportion. Done with failures is split into equal halves, done and failed, so that a few failures among
 * many items still stand out.
 */
export const getBarSegments = ({ state, items }: StepRunMark): BarSegment[] => {
  if (state === "doneWithFailures") {
    return [
      { state: "done", weight: 1 },
      { state: "failed", weight: 1 },
    ];
  }

  const segments = items
    ? itemStates.flatMap((itemState) =>
        items[itemState] > 0
          ? [{ state: itemState, weight: items[itemState] }]
          : [],
      )
    : [];

  /* A for-each step under way, or stopped, before any of its items got anywhere shows its own state. */
  return segments.some((segment) => segment.state !== "notReached")
    ? segments
    : [{ state, weight: 1 }];
};
