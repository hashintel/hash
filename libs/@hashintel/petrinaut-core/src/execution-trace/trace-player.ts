import { createReadableStore } from "../store/readable-store";

import type {
  ComputePlayMode,
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
} from "../playback/playback";
import type { ReadableStore } from "../store/readable-store";
import type { ExecutionTrace, TraceCoverage } from "./execution-trace";

/**
 * What a player reads from a trace: how far it goes, where its events are,
 * and a way to ask for more. It reads no state, so something that has
 * positions and no events, as the samples of an experiment, plays too.
 */
export type PlayableTrace = Pick<
  ExecutionTrace,
  | "continuity"
  | "coverage"
  | "demand"
  | "findEventIndexAt"
  | "getEvent"
  | "findDiscreteEventAtOrBefore"
  | "findDiscreteEventAfter"
>;

export type TracePlayerSnapshot = {
  playState: PlaybackState;
  /** The viewed position, in the trace's seconds or steps. */
  time: number;
  speed: PlaybackSpeed;
  mode: PlayMode;
  /**
   * True while playback is held at the end of an execution that is still
   * going, and shows each event as it arrives. Pausing lets go, and so does
   * viewing an earlier position; viewing the end again takes it back up.
   */
  following: boolean;
};

export type TracePlayerLoadOptions = {
  /**
   * Opens the trace at its end, as a viewer of an execution that happens on
   * its own wants: while that execution is still going, the trace plays
   * there and the view follows it. Left out, the trace opens at its start.
   */
  follow?: boolean;
};

/**
 * Moves a viewed position over a trace. The same player plays a run a
 * simulator computes and an execution a host reports: it reads the trace,
 * and never what wrote it.
 */
export interface TracePlayer {
  readonly state: ReadableStore<TracePlayerSnapshot>;

  /**
   * Plays `trace` from here on. A play pressed before the trace existed
   * still plays it. Null unloads and stops.
   */
  load(
    this: void,
    trace: PlayableTrace | null,
    options?: TracePlayerLoadOptions,
  ): void;

  /** Plays on from the viewed position, or from the start of a trace that ended and was viewed to its end. */
  play(this: void): void;
  /** Pauses. A discrete trace then rests on the event it last passed. */
  pause(this: void): void;
  /** Pauses and returns to the start of the trace. */
  stop(this: void): void;

  /**
   * Views `time`, clamped to what the trace covers. A discrete trace is
   * viewed at its last event at or before it.
   */
  seek(this: void, time: number): void;
  /**
   * Views the previous or next discrete event: a firing, or the initial
   * state. Reference events are stepped over.
   */
  step(this: void, direction: -1 | 1): void;

  setSpeed(this: void, speed: PlaybackSpeed): void;
  setMode(this: void, mode: PlayMode): void;

  /**
   * Advances the viewed position by the wall-clock time since the previous
   * tick, scaled by the speed. The caller drives it from
   * `requestAnimationFrame`, with a timestamp in milliseconds.
   */
  tick(this: void, now: number): void;

  dispose(this: void): void;
}

/**
 * How far ahead of the viewed position, in the trace's seconds or steps,
 * each compute mode asks the source to cover. The buffer mode keeps a short
 * lead so pausing wastes little; the max mode never holds the source back.
 */
export const EVENT_PLAY_MODE_LEAD: Record<ComputePlayMode, number> = {
  computeBuffer: 2,
  computeMax: Number.POSITIVE_INFINITY,
};

/** The demand has to move by this much before the source hears of it. */
const DEMAND_STEP = 1 / 60;

const NO_COVERAGE: TraceCoverage = {
  eventCount: 0,
  startTime: 0,
  coveredTime: 0,
  ended: false,
};

/**
 * The mode playback is in for what the trace can still do. An execution
 * that ended only has what it holds to view, and one with nothing to view
 * yet cannot be view-only.
 */
export const effectivePlayMode = (
  requested: PlayMode,
  coverage: Pick<TraceCoverage, "eventCount" | "ended">,
): PlayMode =>
  coverage.ended
    ? "viewOnly"
    : requested === "viewOnly" && coverage.eventCount === 0
      ? "computeBuffer"
      : requested;

/**
 * The position a view of the trace rests at when it is put at `time`.
 *
 * A continuous trace has a state of its own at every position, so the view
 * rests where it is put. A discrete trace changes only at its events:
 * between two of them there is nothing the earlier one did not already
 * show. Its view rests on the last discrete event at or before `time`.
 */
export const findRestingTime = (
  trace: Pick<
    PlayableTrace,
    | "continuity"
    | "coverage"
    | "findEventIndexAt"
    | "getEvent"
    | "findDiscreteEventAtOrBefore"
  >,
  time: number,
): number => {
  if (trace.continuity === "continuous") {
    return time;
  }
  const index = trace.findDiscreteEventAtOrBefore(trace.findEventIndexAt(time));
  return (
    (index === null ? null : trace.getEvent(index)?.time) ??
    trace.coverage.get().startTime
  );
};

/**
 * Index of the event viewed after stepping from `time` in `direction`, or
 * null at either end of the trace.
 *
 * Only discrete events count. Stepping back from between two events lands
 * on the earlier one first. Stepping back from a position several events
 * share passes all of them: the viewed position is what a step moves, and
 * theirs is the one already viewed.
 */
export const findStepTargetIndex = (
  trace: Pick<
    PlayableTrace,
    | "findEventIndexAt"
    | "getEvent"
    | "findDiscreteEventAtOrBefore"
    | "findDiscreteEventAfter"
  >,
  time: number,
  direction: -1 | 1,
): number | null => {
  const current = trace.findEventIndexAt(time);
  if (direction === 1) {
    return trace.findDiscreteEventAfter(current);
  }
  let target = trace.findDiscreteEventAtOrBefore(current);
  while (target !== null && trace.getEvent(target)?.time === time) {
    target = trace.findDiscreteEventAtOrBefore(target - 1);
  }
  return target;
};

export function createTracePlayer(
  initial?: Partial<Pick<TracePlayerSnapshot, "speed" | "mode">>,
): TracePlayer {
  const store = createReadableStore<TracePlayerSnapshot>({
    playState: "Stopped",
    time: 0,
    speed: 1,
    mode: "computeBuffer",
    following: false,
    ...initial,
  });

  let trace: PlayableTrace | null = null;
  /** Whether the loaded trace is one the view follows once at its end. */
  let followsEnd = false;
  let stopFollowingCoverage: (() => void) | null = null;
  let lastTickTime: number | null = null;
  let demanded = Number.NEGATIVE_INFINITY;
  let disposed = false;

  const coverage = (): TraceCoverage => trace?.coverage.get() ?? NO_COVERAGE;

  /** Asks the source to cover the viewed position and the mode's lead past it. */
  const demand = (): void => {
    if (!trace) {
      return;
    }
    const snapshot = store.get();
    const mode = effectivePlayMode(snapshot.mode, coverage());
    if (mode === "viewOnly") {
      return;
    }
    const target = snapshot.time + EVENT_PLAY_MODE_LEAD[mode];
    if (target >= demanded + DEMAND_STEP) {
      demanded = target;
      trace.demand(target);
    }
  };

  const update = (patch: Partial<TracePlayerSnapshot>): void => {
    if (disposed) {
      return;
    }
    const previous = store.get();
    const next = { ...previous, ...patch };
    if (
      next.playState !== previous.playState ||
      next.time !== previous.time ||
      next.speed !== previous.speed ||
      next.mode !== previous.mode ||
      next.following !== previous.following
    ) {
      store.set(next);
    }
    demand();
  };

  /**
   * Whether `time` is the end of an execution the view follows and that is
   * still going. That end is live: viewing it plays it.
   */
  const isLiveEnd = (time: number): boolean => {
    const { coveredTime, ended } = coverage();
    return followsEnd && !ended && time >= coveredTime;
  };

  /** Views `time` as it is, and follows the trace when that is its live end. */
  const view = (time: number): void => {
    const { startTime, coveredTime } = coverage();
    const clamped = Math.max(startTime, Math.min(time, coveredTime));
    update(
      isLiveEnd(clamped)
        ? { time: clamped, following: true, playState: "Playing" }
        : { time: clamped, following: false },
    );
  };

  const seek: TracePlayer["seek"] = (time) => {
    if (!trace) {
      return;
    }
    const { startTime, coveredTime } = coverage();
    const clamped = Math.max(startTime, Math.min(time, coveredTime));
    // The live end is a position of its own: the view stays there for the
    // events to come, and does not rest on the last one.
    view(isLiveEnd(clamped) ? clamped : findRestingTime(trace, clamped));
  };

  /** Keeps the view inside the trace as it grows, and at its end while following. */
  const onCoverage = (next: TraceCoverage): void => {
    const snapshot = store.get();
    if (snapshot.following) {
      // The last event of an execution is where following it stops.
      update({
        time: next.coveredTime,
        ...(next.ended
          ? { playState: "Paused" as const, following: false }
          : {}),
      });
    } else if (snapshot.time < next.startTime) {
      update({ time: next.startTime });
    }
  };

  return {
    state: store,

    load(next, options) {
      if (disposed) {
        return;
      }
      stopFollowingCoverage?.();
      stopFollowingCoverage = null;
      trace = next;
      followsEnd = next !== null && options?.follow === true;
      demanded = Number.NEGATIVE_INFINITY;
      lastTickTime = null;
      if (next === null) {
        update({ playState: "Stopped", time: 0, following: false });
        return;
      }
      const { startTime, coveredTime } = next.coverage.get();
      view(followsEnd ? coveredTime : startTime);
      stopFollowingCoverage = next.coverage.subscribe(onCoverage);
    },

    play() {
      const { startTime, coveredTime, ended } = coverage();
      lastTickTime = null;
      // At the end of an execution that is over, play again from the start.
      const { time } = store.get();
      const replay = trace !== null && ended && time >= coveredTime;
      update({
        playState: "Playing",
        ...(replay
          ? { time: startTime, following: false }
          : { following: isLiveEnd(time) }),
      });
    },

    pause() {
      const { time } = store.get();
      update({
        playState: "Paused",
        time: trace === null ? time : findRestingTime(trace, time),
        following: false,
      });
    },

    stop() {
      lastTickTime = null;
      update({
        playState: "Stopped",
        time: coverage().startTime,
        following: false,
      });
    },

    seek,

    step(direction) {
      if (!trace) {
        return;
      }
      const index = findStepTargetIndex(trace, store.get().time, direction);
      const target = index === null ? null : trace.getEvent(index);
      if (target) {
        view(target.time);
      }
    },

    setSpeed(speed) {
      update({ speed });
    },

    setMode(mode) {
      // A change of mode demands afresh, which is what takes the source's
      // target back down from the max mode's.
      demanded = Number.NEGATIVE_INFINITY;
      update({ mode });
    },

    tick(now) {
      const previousTick = lastTickTime ?? now;
      lastTickTime = now;
      const snapshot = store.get();
      if (disposed || trace === null || snapshot.playState !== "Playing") {
        return;
      }

      const { coveredTime, ended } = coverage();
      const elapsed =
        snapshot.speed === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : ((now - previousTick) / 1000) * snapshot.speed;
      const time = snapshot.following
        ? coveredTime
        : Math.min(snapshot.time + elapsed, coveredTime);
      const reachedEnd = time >= coveredTime;
      // At the end of what the trace holds, playback waits: it resumes on
      // its own when the trace grows, and pauses for good once the
      // execution is over or nothing more is asked of its source.
      const over = ended || (snapshot.mode === "viewOnly" && !followsEnd);
      update({
        time,
        playState: reachedEnd && over ? "Paused" : "Playing",
        following: followsEnd && reachedEnd && !ended,
      });
    },

    dispose() {
      disposed = true;
      stopFollowingCoverage?.();
      stopFollowingCoverage = null;
      trace = null;
      lastTickTime = null;
    },
  };
}
