/**
 * Simulation WebWorker
 *
 * Runs SDCPN simulation computation off the main thread.
 * Receives SDCPN definitions, compiles user code, and streams frames back.
 *
 * @see ./README.md for detailed documentation
 * @see ../ARCHITECTURE.md for system overview
 */

import { createWorkerThreadRuntime } from "../../environment";
import { SDCPNItemError } from "../../errors";
import { buildSimulation } from "../engine/build-simulation";
import { computeNextFrame } from "../engine/compute-next-frame";
import {
  framePayloadFromEngineFrame,
  type SimulationFrameNewStrings,
  type SimulationFramePayload,
} from "./frame-payload";

import type { SimulationInstance } from "../engine/types";
import type { ToMainMessage, ToWorkerMessage } from "./messages";

const workerRuntime = createWorkerThreadRuntime<
  ToWorkerMessage,
  ToMainMessage
>();

//
// Default Configuration
//

/**
 * Default maximum number of frames the worker can compute ahead of acknowledgment.
 * Provides backpressure to prevent unbounded memory growth.
 */
const DEFAULT_MAX_FRAMES_AHEAD = 1000;

/**
 * Default number of frames to compute in each batch before checking for messages.
 * Higher values improve throughput but reduce responsiveness to pause/stop.
 */
const DEFAULT_BATCH_SIZE = 1000;

//
// Worker State
//

let simulation: SimulationInstance | null = null;
let isRunning = false;
/**
 * Tracks whether the simulation has reached a terminal state.
 * - "ready": initialized and ready to run
 * - "running": currently computing frames
 * - "complete": reached end condition (maxTime or other)
 * - "error": encountered an error during computation
 */
let simulationStatus: "ready" | "running" | "complete" | "error" | null = null;
/**
 * Last frame number acknowledged by main thread.
 * -1 means no ack received yet (blocks computation until first ack).
 */
let lastAckedFrame = -1;
/**
 * How many string pool entries have already been shipped to the main thread.
 * Starts at 1 because id 0 (`""`) is pre-seeded on both sides; each payload
 * carries the entries interned since the previous payload as an append-only
 * `newStrings` delta.
 */
let sentStringCount = 1;

/**
 * Builds the `newStrings` delta for the next frame payload and advances the
 * shipped-entry counter.
 */
function takeNewStringsDelta(): SimulationFrameNewStrings | undefined {
  if (!simulation || simulation.stringPool.size <= sentStringCount) {
    return undefined;
  }
  const delta: SimulationFrameNewStrings = {
    baseId: sentStringCount,
    values: simulation.stringPool.valuesFrom(sentStringCount),
  };
  sentStringCount = simulation.stringPool.size;
  return delta;
}

// Backpressure configuration (can be changed at runtime)
let maxFramesAhead = DEFAULT_MAX_FRAMES_AHEAD;
let batchSize = DEFAULT_BATCH_SIZE;

/**
 * Post a typed message to the main thread.
 */
function postTypedMessage(message: ToMainMessage): void {
  workerRuntime.postMessage(message);
}

/**
 * Main computation loop.
 * Computes frames in batches, yielding periodically to check for messages.
 */
async function computeLoop(): Promise<void> {
  while (isRunning && simulation) {
    // Backpressure: wait if no ack received yet or too far ahead
    const currentFrameNumber = simulation.currentFrameNumber;
    if (
      lastAckedFrame < 0 ||
      currentFrameNumber - lastAckedFrame >= maxFramesAhead
    ) {
      // Yield and wait for ack
      await workerRuntime.delay(10);
      continue;
    }

    // Compute a batch of frames
    const framesToSend: SimulationFramePayload[] = [];

    for (let i = 0; i < batchSize; i++) {
      try {
        const { simulation: updatedSimulation, completionReason } =
          computeNextFrame(simulation);

        simulation = updatedSimulation;
        const newFrame = simulation.frames[simulation.currentFrameNumber]!;
        framesToSend.push(
          framePayloadFromEngineFrame(
            newFrame,
            simulation.currentTime,
            takeNewStringsDelta(),
          ),
        );

        // Check if simulation completed
        if (completionReason !== null) {
          isRunning = false;
          simulationStatus = "complete";
          postTypedMessage({
            type: "complete",
            reason: completionReason,
            frameNumber: simulation.currentFrameNumber,
          });
          break;
        }
      } catch (error) {
        isRunning = false;
        simulationStatus = "error";
        postTypedMessage({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unknown error during computation",
          itemId: error instanceof SDCPNItemError ? error.itemId : null,
        });
        break;
      }
    }

    // Send computed frames
    if (framesToSend.length > 0) {
      if (framesToSend.length === 1) {
        postTypedMessage({
          type: "frame",
          frame: framesToSend[0]!,
        });
      } else {
        postTypedMessage({
          type: "frames",
          frames: framesToSend,
        });
      }
    }

    // Yield to allow message processing
    await workerRuntime.delay(0);
  }
}

/**
 * Handle incoming messages from main thread.
 */
workerRuntime.onMessage((message) => {
  switch (message.type) {
    case "init": {
      try {
        // Build simulation (compiles user code)
        simulation = buildSimulation({
          sdcpn: message.sdcpn,
          extensions: message.extensions,
          initialMarking: message.initialMarking,
          parameterValues: message.parameterValues,
          seed: message.seed,
          dt: message.dt,
          maxTime: message.maxTime,
        });

        // Configure backpressure from init message or use defaults
        maxFramesAhead = message.maxFramesAhead ?? DEFAULT_MAX_FRAMES_AHEAD;
        batchSize = message.batchSize ?? DEFAULT_BATCH_SIZE;

        // Reset to -1: blocks computation until first ack
        lastAckedFrame = -1;
        isRunning = false;
        simulationStatus = "ready";
        // Fresh pool per init: only the pre-seeded "" (id 0) is shared.
        sentStringCount = 1;

        // Send initial frame (with any strings interned from the initial
        // marking as its pool delta)
        const initialFrame = simulation.frames[0];
        if (initialFrame) {
          postTypedMessage({
            type: "frame",
            frame: framePayloadFromEngineFrame(
              initialFrame,
              simulation.currentTime,
              takeNewStringsDelta(),
            ),
          });
        }

        postTypedMessage({
          type: "ready",
          initialFrameCount: simulation.frames.length,
        });
      } catch (error) {
        simulationStatus = "error";
        postTypedMessage({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to initialize simulation",
          itemId: error instanceof SDCPNItemError ? error.itemId : null,
        });
      }
      break;
    }

    case "start": {
      if (!simulation || simulationStatus === null) {
        postTypedMessage({
          type: "error",
          message: "Cannot start: simulation not initialized",
          itemId: null,
        });
        return;
      }

      // Can't restart from terminal states
      if (simulationStatus === "complete" || simulationStatus === "error") {
        return;
      }

      // Already running - no-op
      if (isRunning) {
        return;
      }

      isRunning = true;
      simulationStatus = "running";
      // Start compute loop (async, runs in background)
      void computeLoop();
      break;
    }

    case "pause": {
      isRunning = false;
      // Only transition to ready if we were running (not if already complete/error)
      if (simulationStatus === "running") {
        simulationStatus = "ready";
      }
      if (simulation) {
        postTypedMessage({
          type: "paused",
          frameNumber: simulation.currentFrameNumber,
        });
      }
      break;
    }

    case "stop": {
      isRunning = false;
      simulation = null;
      simulationStatus = null;
      lastAckedFrame = -1;
      sentStringCount = 1;
      break;
    }

    case "setBackpressure": {
      if (message.maxFramesAhead !== undefined) {
        maxFramesAhead = message.maxFramesAhead;
      }
      if (message.batchSize !== undefined) {
        batchSize = message.batchSize;
      }
      break;
    }

    case "ack": {
      lastAckedFrame = Math.max(lastAckedFrame, message.frameNumber);
      break;
    }
  }
});
