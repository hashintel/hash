import {
  createActualModeFrameReplay,
  createStatusViewFrameEvaluator,
  createStatusViewTracker,
  diffInstanceLabelStates,
  extendActualModeTransitionFiringTimesMs,
  getStatusViewEvaluationScope,
} from "@hashintel/petrinaut-core";

import type {
  ActualModeMarking,
  ActualModeTransitionFiring,
  HirStatusConditionArtifact,
  InstanceLabelState,
  InstanceKey,
  SDCPN,
  StatusView,
} from "@hashintel/petrinaut-core";

export type ActualEventStatusChange = {
  /** The instance's key element values, joined for display. */
  keyDisplay: string;
  /** null when the firing first introduces the instance. */
  fromLabelName: string | null;
  /** null when the token left the view and it declares no exit label. */
  toLabelName: string | null;
  /** Time the instance spent in the previous label, ms; null without one. */
  dwellMs: number | null;
};

export type ActualEventStatusDeriver = {
  /**
   * Folds newly appended firings into the derived history and returns one
   * entry per firing seen so far. Feeding a list that is not an extension of
   * the previous one (fewer firings, or a different firing at the seam)
   * rederives from scratch.
   */
  deriveUpTo(
    transitionFirings: readonly ActualModeTransitionFiring[],
  ): ActualEventStatusChange[][];
};

/**
 * Derives, per firing, the status changes under one status view: which
 * instances entered a new label and how long they spent in the previous one.
 * The frames come from the same replay as the canvas and the Kanban board
 * and the statuses from the same evaluator and tracker, so label order,
 * token conditions, scoped (`instanceId::placeId`) places and the exit
 * label behave identically. The pre-firing marking is observed first
 * (emitting nothing), so instances present in the initial state report
 * their real starting label and dwell on their first change.
 */
export function createActualEventStatusDeriver(args: {
  statusView: StatusView;
  definition: SDCPN;
  initialState: ActualModeMarking;
  /** Compiled label conditions, from `HirArtifacts.statusConditions`. */
  statusConditions?: Record<string, HirStatusConditionArtifact>;
}): ActualEventStatusDeriver {
  const { statusView, definition, initialState, statusConditions } = args;

  const { places, types } = getStatusViewEvaluationScope(definition);
  const readerDefinition = {
    places,
    transitions: definition.transitions,
    types,
  };
  const labelNameById = new Map(
    statusView.labels.map((label) => [label.id, label.name]),
  );
  const labelName = (labelId: string | null): string | null =>
    labelId === null ? null : (labelNameById.get(labelId) ?? null);

  const createTracker = () =>
    createStatusViewTracker({
      statusView,
      evaluateFrame: createStatusViewFrameEvaluator({
        statusView,
        places,
        types,
        statusConditions,
      }),
    });

  let tracker = createTracker();
  let replay = createActualModeFrameReplay({
    definition: readerDefinition,
    initialState,
  });
  let previousLabelStates = new Map<InstanceKey, InstanceLabelState>();
  let transitionFiringTimesMs: readonly number[] = [];
  let processedCount = 0;
  let lastProcessedFiring: ActualModeTransitionFiring | null = null;
  let changesByFiring: ActualEventStatusChange[][] = [];

  const observeInitialState = (
    transitionFirings: readonly ActualModeTransitionFiring[],
  ) => {
    tracker.observeFrame(
      replay.readerAt({
        transitionFirings,
        transitionFiringTimesMs,
        point: { kind: "initial", timeMs: 0, transitionFiringIndex: null },
        number: 0,
      }),
    );
    previousLabelStates = tracker.getInstanceLabelStates();
  };

  return {
    deriveUpTo(transitionFirings) {
      const isExtension =
        transitionFirings.length >= processedCount &&
        (processedCount === 0 ||
          transitionFirings[processedCount - 1] === lastProcessedFiring);
      if (!isExtension) {
        tracker = createTracker();
        replay = createActualModeFrameReplay({
          definition: readerDefinition,
          initialState,
        });
        transitionFiringTimesMs = [];
        processedCount = 0;
        lastProcessedFiring = null;
        changesByFiring = [];
      }

      transitionFiringTimesMs = extendActualModeTransitionFiringTimesMs(
        transitionFiringTimesMs,
        transitionFirings,
        null,
        null,
      );

      if (processedCount === 0) {
        observeInitialState(transitionFirings);
      }

      for (
        let firingIndex = processedCount;
        firingIndex < transitionFirings.length;
        firingIndex += 1
      ) {
        const firing = transitionFirings[firingIndex];
        if (!firing) {
          continue;
        }
        const timeMs = transitionFiringTimesMs[firingIndex] ?? 0;
        tracker.observeFrame(
          replay.readerAt({
            transitionFirings,
            transitionFiringTimesMs,
            point: {
              kind: "transition_firing",
              timeMs,
              transitionFiringIndex: firingIndex,
            },
            number: firingIndex + 1,
          }),
        );

        const labelStates = tracker.getInstanceLabelStates();
        changesByFiring.push(
          diffInstanceLabelStates(previousLabelStates, labelStates, timeMs).map(
            (change) => ({
              keyDisplay: change.keyValues.join(", "),
              fromLabelName: labelName(change.fromLabelId),
              toLabelName: labelName(change.toLabelId),
              dwellMs: change.dwellMs,
            }),
          ),
        );
        previousLabelStates = labelStates;
        lastProcessedFiring = firing;
      }
      processedCount = transitionFirings.length;

      return [...changesByFiring];
    },
  };
}
