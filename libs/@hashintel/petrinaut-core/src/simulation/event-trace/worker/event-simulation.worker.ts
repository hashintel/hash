/**
 * Event simulation worker: steps one run off the main thread and streams the
 * events it produces, computing only as far as the host has demanded.
 */

import { createWorkerThreadRuntime } from "../../../environment";
import { FLUSH_EVENTS, FLUSH_STEPS, shouldFlush } from "./flush-policy";
import {
  createTraceStepper,
  DEFAULT_EVENT_STEP_DT,
  DEFAULT_REFERENCE_INTERVAL,
  type TraceStepper,
} from "./trace-stepper";

import type { SimulationFrameNewStrings } from "../../worker/frame-payload";
import type { TraceEvent } from "../trace";
import type { ToEventMainMessage, ToEventWorkerMessage } from "./messages";

const runtime = createWorkerThreadRuntime<
  ToEventWorkerMessage,
  ToEventMainMessage
>();

let stepper: TraceStepper | null = null;
let status: "ready" | "running" | "complete" | "error" | null = null;
let isRunning = false;
/** The time the host last asked for; nothing is computed past it. */
let demandedTime = 0;
/** Pool entries already shipped; id 0 (`""`) is pre-seeded on both sides. */
let sentStringCount = 1;

/** Steps computed and events produced since the last message to the host. */
let pending: TraceEvent[] = [];
let pendingSteps = 0;
let lastFlushAt = 0;

const flush = (): void => {
  if (!stepper) {
    return;
  }
  runtime.postMessage({
    type: "events",
    events: pending,
    coveredTime: stepper.time,
  });
  pending = [];
  pendingSteps = 0;
  lastFlushAt = Date.now();
};

const flushIfDue = (stopping: boolean): void => {
  if (
    shouldFlush({
      stepsPending: pendingSteps,
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
  pendingSteps = 0;
  lastFlushAt = 0;
};

const takeNewStringsDelta = (): SimulationFrameNewStrings | undefined => {
  if (!stepper || stepper.stringPool.size <= sentStringCount) {
    return undefined;
  }
  const delta = {
    baseId: sentStringCount,
    values: stepper.stringPool.valuesFrom(sentStringCount),
  };
  sentStringCount = stepper.stringPool.size;
  return delta;
};

const withStringsDelta = (event: TraceEvent): TraceEvent => {
  const newStrings = takeNewStringsDelta();
  return newStrings ? { ...event, newStrings } : event;
};

const computeLoop = async (): Promise<void> => {
  while (isRunning && stepper) {
    if (stepper.time >= demandedTime) {
      flushIfDue(false);
      await runtime.delay(10);
      continue;
    }

    let stop: ToEventMainMessage | null = null;
    while (
      pendingSteps < FLUSH_STEPS &&
      pending.length < FLUSH_EVENTS &&
      stepper.time < demandedTime
    ) {
      const result = stepper.step();
      pendingSteps += 1;
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
        stepper = createTraceStepper({
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
          stepDt: message.stepDt ?? DEFAULT_EVENT_STEP_DT,
          referenceInterval:
            message.referenceInterval ?? DEFAULT_REFERENCE_INTERVAL,
        });
        status = "ready";
        isRunning = false;
        demandedTime = 0;
        sentStringCount = 1;
        resetPending();
        runtime.postMessage({
          type: "events",
          events: [withStringsDelta(stepper.initialEvent)],
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
      if (!stepper || status === null) {
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
      void computeLoop();
      break;
    }
    case "pause": {
      isRunning = false;
      if (status === "running") {
        status = "ready";
      }
      if (stepper) {
        flush();
        runtime.postMessage({ type: "paused", time: stepper.time });
      }
      break;
    }
    case "stop": {
      isRunning = false;
      stepper = null;
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
