import { isEqual } from "lodash";

import { parseStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import type { FlowRunEventError } from "@local/hash-isomorphic-utils/flows/run-events";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type {
  StepDefinition,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";

/** A run of a step, and the index of the for-each item it's for, if it's for one. */
export type ItemRun = {
  itemIndex: number | null;
  stepRun: FlowRunStepRunState;
};

/**
 * A step's runs in a run, in item order: its own, one per item for a step inside a for-each step, or for a for-each
 * step, its steps' runs for all its items, and its own if it was skipped.
 */
export const getRunsOfStep = (
  step: StepDefinition<string>,
  stepRuns: Map<string, FlowRunStepRunState>,
): ItemRun[] => {
  const stepIds = new Set([
    step.stepId,
    ...(step.kind === "for-each" ? step.steps.map(({ stepId }) => stepId) : []),
  ]);

  return [...stepRuns.values()]
    .flatMap((stepRun) => {
      const { stepId, itemIndex } = parseStepRunId(stepRun.stepId);

      return stepIds.has(stepId)
        ? [{ itemIndex: itemIndex ?? null, stepRun }]
        : [];
    })
    .toSorted(
      (left, right) => (left.itemIndex ?? -1) - (right.itemIndex ?? -1),
    );
};

/**
 * When the first of some runs that started was scheduled and, once every one of them has closed, when the last did.
 * A run's `startedAt` is its latest attempt's, so a run Temporal retried is timed from when it was scheduled, across
 * all its attempts.
 */
export const getTimeSpan = (
  runs: ItemRun[],
): { startedAt: string | null; closedAt: string | null } => {
  const startedAts = runs.flatMap(({ stepRun }) =>
    stepRun.startedAt ? [stepRun.scheduledAt] : [],
  );
  const closedAts = runs.flatMap(({ stepRun }) =>
    stepRun.closedAt ? [stepRun.closedAt] : [],
  );

  return {
    startedAt: startedAts.toSorted()[0] ?? null,
    closedAt:
      runs.length > 0 && closedAts.length === runs.length
        ? (closedAts.toSorted().at(-1) ?? null)
        : null,
  };
};

/**
 * The inputs every item's run got the same value for, and the names of those that differ between items. Runs that
 * were skipped got none, so they don't count.
 */
export const getCommonInputs = (
  runs: ItemRun[],
): { common: StepInput[]; varying: string[] } => {
  const [first, ...rest] = runs
    .map(({ stepRun }) => stepRun)
    .filter(({ status }) => status !== FlowStepStatus.Skipped);

  if (!first) {
    return { common: [], varying: [] };
  }

  const common: StepInput[] = [];
  const varying = new Set<string>();

  for (const input of first.inputs) {
    const same = rest.every(({ inputs }) =>
      inputs.some(
        ({ inputName, payload }) =>
          inputName === input.inputName && isEqual(payload, input.payload),
      ),
    );

    if (same) {
      common.push(input);
    } else {
      varying.add(input.inputName);
    }
  }

  for (const { inputs } of rest) {
    for (const { inputName } of inputs) {
      if (!common.some((input) => input.inputName === inputName)) {
        varying.add(inputName);
      }
    }
  }

  return { common, varying: [...varying] };
};

/**
 * The error of the run that failed last: the error status its action gave, or else its latest failed attempt's, which
 * may be retried.
 */
export const getLastError = (
  runs: ItemRun[],
): { itemIndex: number | null; error: FlowRunEventError } | null => {
  const failures = runs.flatMap(({ itemIndex, stepRun }) => {
    const error = stepRun.errorStatus ?? stepRun.lastFailure;

    return error
      ? [
          {
            itemIndex,
            error,
            /* `closedAt` is empty while the run is open. */
            at:
              [stepRun.closedAt, stepRun.startedAt].find((time) => !!time) ??
              stepRun.scheduledAt,
          },
        ]
      : [];
  });

  const [last] = failures.toSorted((left, right) =>
    right.at.localeCompare(left.at),
  );

  return last ? { itemIndex: last.itemIndex, error: last.error } : null;
};
