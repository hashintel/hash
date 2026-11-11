/**
 * Event simulation worker: advances one run off the main thread with the
 * stepper of the simulator the host selected, and streams the events it
 * records, computing only as far as the host has demanded.
 */

import { createWorkerThreadRuntime } from "../../../environment";
import {
  COMPUTE_SLICE_MS,
  FLUSH_ADVANCES,
  FLUSH_EVENTS,
  shouldFlush,
} from "./flush-policy";
import { createStepper } from "./steppers";
import { createTraceRecorder, type TraceRecorder } from "./trace-recorder";

import type { StringPool } from "../../engine/string-pool";
import type { SimulationFrameNewStrings } from "../../worker/frame-payload";
import type { TraceEvent } from "../trace";
import type { ToEventMainMessage, ToEventWorkerMessage } from "./messages";

const runtime = createWorkerThreadRuntime<
  ToEventWorkerMessage,
  ToEventMainMessage
>();

let recorder: TraceRecorder | null = null;
/** The run's string pool, for the pool deltas sent with its events. */
let stringPool: StringPool | null = null;
let status: "ready" | "running" | "complete" | "error" | null = null;
let isRunning = false;
/** The compute loop in charge; an older one stops when it wakes. */
let currentLoop = 0;
/** The time the host last asked for; nothing is computed past it. */
let demandedTime = 0;
/** Pool entries already shipped; id 0 (`""`) is pre-seeded on both sides. */
let sentStringCount = 1;

/** Advances made and events recorded since the last message to the host. */
let pending: TraceEvent[] = [];
let pendingAdvances = 0;
let lastFlushAt = 0;

const flush = (): void => {
  if (!recorder) {
    return;
  }
  runtime.postMessage({
    type: "events",
    events: pending,
    coveredTime: recorder.time,
  });
  pending = [];
  pendingAdvances = 0;
  lastFlushAt = Date.now();
};

const flushIfDue = (stopping: boolean): void => {
  if (
    shouldFlush({
      advancesPending: pendingAdvances,
      eventsPending: pending.length,
      msSinceFlush: Date.now() - lastFlushAt,
      stopping,
    })
  ) {
    flush();
  }
};

const resetPending = (): void => {
  pending = [];
  pendingAdvances = 0;
  lastFlushAt = 0;
};

const takeNewStringsDelta = (): SimulationFrameNewStrings | undefined => {
  if (!stringPool || stringPool.size <= sentStringCount) {
    return undefined;
  }
  const delta = {
    baseId: sentStringCount,
    values: stringPool.valuesFrom(sentStringCount),
  };
  sentStringCount = stringPool.size;
  return delta;
};

const withStringsDelta = (event: TraceEvent): TraceEvent => {
  const newStrings = takeNewStringsDelta();
  return newStrings ? { ...event, newStrings } : event;
};

/**
 * Advances the run while it is wanted. `loop` names this loop: a pause and a
 * start while it waits would otherwise leave two loops on one recorder, so a
 * loop that is no longer the current one stops.
 */
const computeLoop = async (loop: number): Promise<void> => {
  while (isRunning && recorder && loop === currentLoop) {
    if (recorder.time >= demandedTime) {
      flushIfDue(false);
      await runtime.delay(10);
      continue;
    }

    let stop: ToEventMainMessage | null = null;
    const sliceStart = Date.now();
    // The demand bounds the loop, not the advances: a stepper that draws
    // random numbers per span has to take the same spans whenever it is
    // asked, so the last advance may carry the run a little past the demand.
    while (
      pendingAdvances < FLUSH_ADVANCES &&
      pending.length < FLUSH_EVENTS &&
      recorder.time < demandedTime &&
      Date.now() - sliceStart < COMPUTE_SLICE_MS
    ) {
      const result = recorder.next();
      pendingAdvances += 1;
      if (result.event) {
        pending.push(withStringsDelta(result.event));
      }
      if (result.error !== null) {
        stop = { type: "error", message: result.error, itemId: null };
        break;
      }
      if (result.completion !== null) {
        stop = {
          type: "complete",
          reason: result.completion,
          time: result.time,
        };
        break;
      }
    }

    flushIfDue(stop !== null);
    if (stop) {
      isRunning = false;
      status = stop.type;
      runtime.postMessage(stop);
      return;
    }
    await runtime.delay(0);
  }
};

runtime.onMessage((message) => {
  switch (message.type) {
    case "init": {
      try {
        const stepper = createStepper(message.simulator, {
          sdcpn: message.sdcpn,
          ...(message.extensions === undefined
            ? {}
            : { extensions: message.extensions }),
          ...(message.hirArtifacts === undefined
            ? {}
            : { hirArtifacts: message.hirArtifacts }),
          initialMarking: message.initialMarking,
          parameterValues: message.parameterValues,
          seed: message.seed,
          maxTime: message.maxTime,
        });
        recorder = createTraceRecorder(stepper);
        stringPool = stepper.run.simulation.stringPool;
        status = "ready";
        isRunning = false;
        demandedTime = 0;
        sentStringCount = 1;
        resetPending();
        runtime.postMessage({
          type: "events",
          events: [withStringsDelta(recorder.initialEvent)],
          coveredTime: 0,
        });
        runtime.postMessage({ type: "ready" });
      } catch (error) {
        status = "error";
        runtime.postMessage({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize the event simulation",
          itemId:
            error instanceof Error && "itemId" in error
              ? ((error as { itemId?: string | null }).itemId ?? null)
              : null,
        });
      }
      break;
    }
    case "start": {
      if (!recorder || status === null) {
        runtime.postMessage({
          type: "error",
          message: "Cannot start: the event simulation is not initialized",
          itemId: null,
        });
        return;
      }
      if (status === "complete" || status === "error" || isRunning) {
        return;
      }
      isRunning = true;
      status = "running";
      currentLoop += 1;
      computeLoop(currentLoop).catch((error: unknown) => {
        // The stepper reports its own failures. What reaches here failed
        // around it, such as the derivatives recorded with an event.
        isRunning = false;
        status = "error";
        runtime.postMessage({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "The event simulation failed",
          itemId: null,
        });
      });
      break;
    }
    case "pause": {
      isRunning = false;
      if (status === "running") {
        status = "ready";
      }
      if (recorder) {
        flush();
        runtime.postMessage({ type: "paused", time: recorder.time });
      }
      break;
    }
    case "stop": {
      isRunning = false;
      recorder = null;
      stringPool = null;
      status = null;
      demandedTime = 0;
      sentStringCount = 1;
      resetPending();
      break;
    }
    case "demand": {
      demandedTime = Math.max(demandedTime, message.time);
      break;
    }
  }
});
