import {
  createStatusViewFrameEvaluator,
  createStatusViewTracker,
  type Color,
  type HirStatusConditionArtifact,
  type InstanceStatus,
  type Place,
  type SimulationFrameReader,
  type StatusView,
} from "@hashintel/petrinaut-core";

export type BoardSnapshot = {
  instances: InstanceStatus[];
  nowMs: number;
  /** Token-condition evaluation failures seen so far; null when none. */
  conditionErrors: { count: number; firstMessage: string } | null;
};

type GetFramesInRange = (
  startIndex: number,
  endIndex: number,
) => Promise<SimulationFrameReader[]>;

export type BoardReplay = {
  /**
   * Brings the board to `frameIndex` and resolves its snapshot. Forward
   * motion feeds only the new frames into the retained tracker; a backward
   * scrub rebuilds from frame zero, since status history is derived, never
   * stored. Calls are serialized internally, so concurrent invocations
   * observe frames in order; a failed fetch leaves the tracker where it
   * was and the next call resumes from the last observed frame.
   */
  advanceTo(
    frameIndex: number,
    getFramesInRange: GetFramesInRange,
  ): Promise<BoardSnapshot>;
};

/**
 * Incremental status replay behind the Kanban board. The last observed
 * frame is re-observed on every advance: in actual mode a frame index can
 * be re-pointed at new content while streaming (a firing arriving at an
 * already-ticked timestamp), and re-observing is a no-op when nothing
 * changed. A frame whose time runs backwards — the timeline was reshaped
 * under us — triggers a rebuild from zero.
 */
export const createBoardReplay = (args: {
  statusView: StatusView;
  places: readonly Place[];
  types: readonly Color[];
  statusConditions: Record<string, HirStatusConditionArtifact>;
}): BoardReplay => {
  const { statusView, places, types, statusConditions } = args;

  // Condition errors are counted per observed frame, so re-observing the
  // last frame replaces its count instead of adding to it, and a rebuild
  // starts the count again.
  let settledConditionErrorCount = 0;
  let lastFrameConditionErrorCount = 0;
  let firstConditionErrorMessage = "";
  const createTracker = () => {
    settledConditionErrorCount = 0;
    lastFrameConditionErrorCount = 0;
    return createStatusViewTracker({
      statusView,
      evaluateFrame: createStatusViewFrameEvaluator({
        statusView,
        places,
        types,
        statusConditions,
        onConditionError: (error) => {
          if (settledConditionErrorCount + lastFrameConditionErrorCount === 0) {
            firstConditionErrorMessage = error.message;
          }
          lastFrameConditionErrorCount += 1;
        },
      }),
    });
  };

  // All three are owned by the serialized tasks below; advanceTo itself
  // never touches them.
  let tracker = createTracker();
  let observedFrameCount = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const observeFrame = (
    frame: SimulationFrameReader,
    isLastObservedFrame: boolean,
  ) => {
    if (!isLastObservedFrame) {
      settledConditionErrorCount += lastFrameConditionErrorCount;
    }
    lastFrameConditionErrorCount = 0;
    tracker.observeFrame(frame);
  };

  const snapshot = (): BoardSnapshot => {
    const conditionErrorCount =
      settledConditionErrorCount + lastFrameConditionErrorCount;
    return {
      instances: tracker.getInstanceStatuses(),
      nowMs: tracker.lastObservedTimeMs(),
      conditionErrors:
        conditionErrorCount === 0
          ? null
          : {
              count: conditionErrorCount,
              firstMessage: firstConditionErrorMessage,
            },
    };
  };

  return {
    advanceTo(frameIndex, getFramesInRange) {
      const result = queue.then(async () => {
        const toIndexExclusive = frameIndex + 1;
        if (toIndexExclusive < observedFrameCount) {
          tracker = createTracker();
          observedFrameCount = 0;
        }
        const fromIndex = Math.max(observedFrameCount - 1, 0);
        if (toIndexExclusive > fromIndex) {
          const frames = await getFramesInRange(fromIndex, toIndexExclusive);
          for (const [offset, frame] of frames.entries()) {
            if (frame.time * 1_000 < tracker.lastObservedTimeMs()) {
              tracker = createTracker();
              const replayed = await getFramesInRange(0, toIndexExclusive);
              for (const replayedFrame of replayed) {
                observeFrame(replayedFrame, false);
              }
              break;
            }
            observeFrame(frame, fromIndex + offset === observedFrameCount - 1);
          }
          observedFrameCount = toIndexExclusive;
        }
        return snapshot();
      });
      queue = result.catch(() => {});
      return result;
    },
  };
};
