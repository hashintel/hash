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
  | "abandoned"
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

const stateOfStatus: Record<FlowStepStatus, ItemState> = {
  [FlowStepStatus.Scheduled]: "running",
  [FlowStepStatus.Started]: "running",
  [FlowStepStatus.Completed]: "done",
  [FlowStepStatus.InformationRequired]: "needsReview",
  [FlowStepStatus.Failed]: "failed",
  [FlowStepStatus.TimedOut]: "failed",
  [FlowStepStatus.CancelRequested]: "abandoned",
  [FlowStepStatus.Cancelled]: "abandoned",
  [FlowStepStatus.Skipped]: "skipped",
};

/** In the order a bar draws them: what's finished first, what's still to come last. */
const itemStates: ItemState[] = [
  "done",
  "failed",
  "needsReview",
  "running",
  "skipped",
  "abandoned",
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

/**
 * What a step's items add up to. Items not reached yet keep a step running while its run is `live`; once the run has
 * stopped, they never will be, so the step was abandoned part way.
 */
const getStateOfItems = (counts: ItemCounts, live: boolean): StepState => {
  const total = itemStates.reduce((sum, state) => sum + counts[state], 0);

  if (counts.needsReview > 0) {
    return "needsReview";
  }

  if (counts.running > 0) {
    return "running";
  }

  if (counts.notReached === total && total > 0) {
    return "notReached";
  }

  if (counts.notReached > 0) {
    return live ? "running" : "abandoned";
  }

  if (counts.abandoned > 0) {
    return "abandoned";
  }

  if (counts.failed > 0) {
    return counts.done > 0 ? "doneWithFailures" : "failed";
  }

  return counts.done > 0 || total === 0 ? "done" : "skipped";
};

/** An item's state from its steps' states for it: a failure in any step fails the item. */
const getItemState = (stepStates: ItemState[], live: boolean): ItemState => {
  const state = getStateOfItems(countItems(stepStates), live);

  return state === "doneWithFailures" ? "failed" : state;
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
 * theirs, an item failing when any of its steps does.
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

  const getRunState = (stepRunId: string): ItemState => {
    const status = statusByStepRunId.get(stepRunId);

    return status === undefined ? "notReached" : stateOfStatus[status];
  };

  for (const step of steps) {
    if (step.kind === "action") {
      marks.set(step.stepId, {
        state: getRunState(step.stepId),
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
        state: getRunState(step.stepId),
        items: countItems([]),
      });
      continue;
    }

    const itemIndexes = Array.from(
      { length: itemCount },
      (_, itemIndex) => itemIndex,
    );
    const innerSteps = step.steps.map(({ stepId }) => ({
      stepId,
      stateByItem: itemIndexes.map((itemIndex) =>
        getRunState(generateStepRunId(stepId, itemIndex)),
      ),
    }));

    for (const { stepId, stateByItem } of innerSteps) {
      const innerCounts = countItems(stateByItem);

      marks.set(stepId, {
        /* With no items, there was nothing to run it for. */
        state: itemCount === 0 ? "skipped" : getStateOfItems(innerCounts, live),
        items: innerCounts,
      });
    }

    const counts = countItems(
      itemIndexes.map((itemIndex) =>
        getItemState(
          innerSteps.map(
            ({ stateByItem }) => stateByItem[itemIndex] ?? "notReached",
          ),
          live,
        ),
      ),
    );
    const state = getStateOfItems(counts, live);

    /* Once started, it's under way until its items are, even before any of them has. */
    marks.set(step.stepId, {
      state: state === "notReached" ? (live ? "running" : "abandoned") : state,
      items: counts,
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

  return segments.length > 0 ? segments : [{ state, weight: 1 }];
};
