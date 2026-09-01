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

export type GetFramesInRange = (
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

  let conditionErrorCount = 0;
  let firstConditionErrorMessage = "";
  const createTracker = () =>
    createStatusViewTracker({
      statusView,
      evaluateFrame: createStatusViewFrameEvaluator({
        statusView,
        places,
        types,
        statusConditions,
        onConditionError: (error) => {
          if (conditionErrorCount === 0) {
            firstConditionErrorMessage = error.message;
          }
          conditionErrorCount += 1;
        },
      }),
    });

  // All three are owned by the serialized tasks below; advanceTo itself
  // never touches them.
  let tracker = createTracker();
  let observedFrameCount = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const snapshot = (): BoardSnapshot => ({
    instances: tracker.getInstanceStatuses(),
    nowMs: tracker.lastObservedTimeMs(),
    conditionErrors:
      conditionErrorCount === 0
        ? null
        : {
            count: conditionErrorCount,
            firstMessage: firstConditionErrorMessage,
          },
  });

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
          for (const frame of frames) {
            if (frame.time * 1_000 < tracker.lastObservedTimeMs()) {
              tracker = createTracker();
              const replayed = await getFramesInRange(0, toIndexExclusive);
              for (const replayedFrame of replayed) {
                tracker.observeFrame(replayedFrame);
              }
              break;
            }
            tracker.observeFrame(frame);
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
