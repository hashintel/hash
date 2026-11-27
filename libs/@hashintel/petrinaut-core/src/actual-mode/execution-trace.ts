import { createExecutionTrace } from "../execution-trace/execution-trace";
import { createTraceEncoder } from "../execution-trace/trace-encoder";
import { parseActualModeTimestampMs } from "./time";

import type { ExecutionTrace } from "../execution-trace/execution-trace";
import type { TraceEvent } from "../execution-trace/trace-event";
import type { SDCPN } from "../types/sdcpn";
import type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeTransitionFiring,
} from "./types";

type AvailableActualMode = Extract<ActualModeContextValue, { available: true }>;

/** A firing with no timestamp to read is put this long after the one before it, in seconds. */
const UNTIMED_FIRING_GAP = 0.001;

/**
 * The instant position 0 of a host's execution stands for: when the host
 * says the execution started, or else when its first transition fired.
 * Null while the host has reported neither.
 */
export const getActualModeEpochMs = (
  value: Pick<AvailableActualMode, "transitionFirings" | "timelineStartedAtMs">,
): number | null => {
  if (value.timelineStartedAtMs !== null) {
    return value.timelineStartedAtMs;
  }
  for (const firing of value.transitionFirings) {
    const timestampMs = parseActualModeTimestampMs(firing.ts);
    if (timestampMs !== null) {
      return timestampMs;
    }
  }
  return null;
};

export type ActualModeTrace = {
  readonly trace: ExecutionTrace;
  /** Firings of the host's list the trace already holds. */
  readonly firingCount: number;
  /**
   * Brings the trace up to what the host now reports: appends the firings
   * it does not hold yet, covers the time the host says it is, and ends the
   * trace once the host's execution has. The host's list only grows, so
   * the firings the trace holds are not read again.
   */
  update(
    this: void,
    value: Pick<
      AvailableActualMode,
      "status" | "transitionFirings" | "timelineNowMs"
    >,
  ): void;
};

/**
 * A host's execution as an execution trace. Actual mode is this mapping and
 * nothing more: the initial marking is the trace's first event, each
 * transition firing is an event at its timestamp, and whatever shows a
 * simulated run then shows the host's execution.
 */
export const createActualModeTrace = (params: {
  definition: Pick<SDCPN, "places" | "transitions" | "types">;
  initialState: ActualModeMarking;
  /** See {@link getActualModeEpochMs}. Null puts untimed firings a millisecond apart. */
  epochMs: number | null;
}): ActualModeTrace => {
  const { definition, initialState, epochMs } = params;
  const encoder = createTraceEncoder(definition);
  const { trace, writer } = createExecutionTrace({
    net: definition,
    clock: "time",
    // A host reports firings, not how tokens evolve between them.
    continuity: "discrete",
    epochMs,
  });
  writer.append([encoder.state(0, initialState, "initial")]);

  let firingCount = 0;
  let lastTime = 0;

  const timeOf = (firing: ActualModeTransitionFiring): number => {
    const timestampMs = parseActualModeTimestampMs(firing.ts);
    return timestampMs === null || epochMs === null
      ? lastTime + UNTIMED_FIRING_GAP
      : // A firing stamped before the one it follows keeps its place in the list.
        Math.max(lastTime, (timestampMs - epochMs) / 1000);
  };

  return {
    trace,
    get firingCount() {
      return firingCount;
    },
    update({ status, transitionFirings, timelineNowMs }) {
      if (trace.coverage.get().ended) {
        return;
      }
      const events: TraceEvent[] = [];
      for (; firingCount < transitionFirings.length; firingCount++) {
        const firing = transitionFirings[firingCount]!;
        lastTime = timeOf(firing);
        events.push(
          encoder.firing(lastTime, {
            transitionIds: [firing.transitionId],
            consumed: firing.input,
            produced: firing.output,
          }),
        );
      }
      const nowTime =
        status === "streaming" && timelineNowMs !== null && epochMs !== null
          ? (timelineNowMs - epochMs) / 1000
          : undefined;
      if (events.length > 0) {
        writer.append(events, nowTime);
      } else if (nowTime !== undefined) {
        writer.cover(nowTime);
      }
      if (status === "complete" || status === "error") {
        writer.end();
      }
    },
  };
};
