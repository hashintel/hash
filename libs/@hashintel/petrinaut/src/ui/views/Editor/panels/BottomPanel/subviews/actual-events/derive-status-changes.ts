import {
  applyActualModeTransitionFiring,
  createStatusViewFrameEvaluator,
  createStatusViewTracker,
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
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
 * Statuses come from the same frame evaluator and tracker as the Kanban
 * board and canvas badges — label array order, token conditions, scoped
 * (`instanceId::placeId`) places, and the exit label all behave identically —
 * by reconstructing a frame per firing and diffing consecutive instance
 * label states. The pre-firing marking is observed first (emitting nothing),
 * so instances present in the initial state report their real starting
 * label and dwell on their first change.
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

  let tracker = createStatusViewTracker({
    statusView,
    evaluateFrame: createStatusViewFrameEvaluator({
      statusView,
      places,
      types,
      statusConditions,
    }),
  });
  let marking = initialState;
  let previousLabelStates = new Map<InstanceKey, InstanceLabelState>();
  let baselineObserved = false;
  let processedCount = 0;
  let lastProcessedFiring: ActualModeTransitionFiring | null = null;
  let changesByFiring: ActualEventStatusChange[][] = [];

  return {
    deriveUpTo(transitionFirings) {
      const isExtension =
        transitionFirings.length >= processedCount &&
        (processedCount === 0 ||
          transitionFirings[processedCount - 1] === lastProcessedFiring);
      if (!isExtension) {
        tracker = createStatusViewTracker({
          statusView,
          evaluateFrame: createStatusViewFrameEvaluator({
            statusView,
            places,
            types,
            statusConditions,
          }),
        });
        marking = initialState;
        previousLabelStates = new Map();
        baselineObserved = false;
        processedCount = 0;
        lastProcessedFiring = null;
        changesByFiring = [];
      }

      const transitionFiringTimesMs = getActualModeTransitionFiringTimesMs(
        transitionFirings,
        null,
        null,
      );

      if (!baselineObserved) {
        tracker.observeFrame(
          createActualModeTimelineFrameReader({
            definition: readerDefinition,
            initialState,
            transitionFirings,
            transitionFiringTimesMs,
            point: { kind: "initial", timeMs: 0, transitionFiringIndex: null },
            number: 0,
            marking,
          }),
        );
        previousLabelStates = tracker.getInstanceLabelStates();
        baselineObserved = true;
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
        marking = applyActualModeTransitionFiring(marking, firing);
        tracker.observeFrame(
          createActualModeTimelineFrameReader({
            definition: readerDefinition,
            initialState,
            transitionFirings,
            transitionFiringTimesMs,
            point: {
              kind: "transition_firing",
              timeMs,
              transitionFiringIndex: firingIndex,
            },
            number: firingIndex + 1,
            marking,
          }),
        );

        const labelStates = tracker.getInstanceLabelStates();
        const changes: ActualEventStatusChange[] = [];
        for (const [key, labelState] of labelStates) {
          const previous = previousLabelStates.get(key);
          if (previous?.currentLabelId === labelState.currentLabelId) {
            continue;
          }
          if (!previous && labelState.currentLabelId === null) {
            continue;
          }
          changes.push({
            keyDisplay: labelState.keyValues.join(", "),
            fromLabelName: labelName(previous?.currentLabelId ?? null),
            toLabelName: labelName(labelState.currentLabelId),
            dwellMs: previous ? timeMs - previous.enteredCurrentAtMs : null,
          });
        }
        previousLabelStates = labelStates;
        changesByFiring.push(changes);
        lastProcessedFiring = firing;
      }
      processedCount = transitionFirings.length;

      return [...changesByFiring];
    },
  };
}
