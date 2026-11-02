/**
 * Event simulation worker: steps one run off the main thread and streams the
 * events it produces, computing only as far as the host has demanded.
 */

import { createWorkerThreadRuntime } from "../../../environment";
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

/**
 * Steps between two yields to the message queue: 0.2 s of simulated time at
 * the default step, so a pause or a stop lands within that.
 */
const STEPS_PER_BATCH = 2_000;
/** Events posted in one message at most, so a burst of firings streams. */
const MAX_EVENTS_PER_BATCH = 256;

let stepper: TraceStepper | null = null;
let status: "ready" | "running" | "complete" | "error" | null = null;
let isRunning = false;
/** The time the host last asked for; nothing is computed past it. */
let demandedTime = 0;
/** Pool entries already shipped; id 0 (`""`) is pre-seeded on both sides. */
let sentStringCount = 1;

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
      await runtime.delay(10);
      continue;
    }

    const events: TraceEvent[] = [];
    let stop: ToEventMainMessage | null = null;
    for (
      let step = 0;
      step < STEPS_PER_BATCH && events.length < MAX_EVENTS_PER_BATCH;
      step++
    ) {
      const result = stepper.step();
      if (result.event) {
        events.push(withStringsDelta(result.event));
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
      if (stepper.time >= demandedTime) {
        break;
      }
    }

    runtime.postMessage({ type: "events", events, coveredTime: stepper.time });
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
      break;
    }
    case "demand": {
      demandedTime = Math.max(demandedTime, message.time);
      break;
    }
  }
});
