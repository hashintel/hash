/**
 * Simulation WebWorker
 *
 * Runs SDCPN simulation computation off the main thread.
 * Receives SDCPN definitions, compiles user code, and streams frames back.
 *
 * @see ./README.md for detailed documentation
 * @see ../ARCHITECTURE.md for system overview
 */

import { SDCPNItemError } from "../../core/errors";
import type { SimulationInstance } from "../context";
import { buildSimulation } from "../simulator/build-simulation";
import { checkTransitionEnablement } from "../simulator/check-transition-enablement";
import { computeNextFrame } from "../simulator/compute-next-frame";
import type { ToMainMessage, ToWorkerMessage } from "./messages";

//
// Configuration
//

/**
 * Maximum number of frames the worker can compute ahead of acknowledgment.
 * Provides backpressure to prevent unbounded memory growth.
 */
const MAX_FRAMES_AHEAD = 1000;

/**
 * Number of frames to compute in each batch before checking for messages.
 * Higher values improve throughput but reduce responsiveness to pause/stop.
 */
const BATCH_SIZE = 10;

//
// Worker State
//

let simulation: SimulationInstance | null = null;
let isRunning = false;
let maxTime: number | null = null;
let lastAckedFrame = 0;

/**
 * Post a typed message to the main thread.
 */
function postTypedMessage(message: ToMainMessage): void {
  self.postMessage(message);
}

/**
 * Main computation loop.
 * Computes frames in batches, yielding periodically to check for messages.
 */
async function computeLoop(): Promise<void> {
  while (isRunning && simulation) {
    // Backpressure: wait if we're too far ahead
    const currentFrameNumber = simulation.currentFrameNumber;
    if (currentFrameNumber - lastAckedFrame > MAX_FRAMES_AHEAD) {
      // Yield and wait for ack
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }

    // Compute a batch of frames
    const framesToSend: typeof simulation.frames = [];

    for (let i = 0; i < BATCH_SIZE && isRunning && simulation; i++) {
      try {
        const { simulation: updatedSimulation, transitionFired } =
          computeNextFrame(simulation);

        simulation = updatedSimulation;
        const newFrame = simulation.frames[simulation.currentFrameNumber]!;
        framesToSend.push(newFrame);

        // Check stopping conditions
        if (maxTime !== null && newFrame.time >= maxTime) {
          isRunning = false;
          postTypedMessage({
            type: "complete",
            reason: "maxTime",
            frameNumber: simulation.currentFrameNumber,
          });
          break;
        }

        if (!transitionFired) {
          const enablementResult = checkTransitionEnablement(newFrame);
          if (!enablementResult.hasEnabledTransition) {
            isRunning = false;
            postTypedMessage({
              type: "complete",
              reason: "deadlock",
              frameNumber: simulation.currentFrameNumber,
            });
            break;
          }
        }
      } catch (error) {
        isRunning = false;
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
        postTypedMessage({ type: "frame", frame: framesToSend[0]! });
      } else {
        postTypedMessage({ type: "frames", frames: framesToSend });
      }
    }

    // Yield to allow message processing
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Handle incoming messages from main thread.
 */
self.onmessage = (event: MessageEvent<ToWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init": {
      try {
        // Convert serialized initialMarking back to Map
        const initialMarking = new Map(message.initialMarking);

        // Build simulation (compiles user code)
        simulation = buildSimulation({
          sdcpn: message.sdcpn,
          initialMarking,
          parameterValues: message.parameterValues,
          seed: message.seed,
          dt: message.dt,
        });

        maxTime = null;
        lastAckedFrame = 0;
        isRunning = false;

        // Send initial frame
        const initialFrame = simulation.frames[0];
        if (initialFrame) {
          postTypedMessage({ type: "frame", frame: initialFrame });
        }

        postTypedMessage({
          type: "ready",
          initialFrameCount: simulation.frames.length,
        });
      } catch (error) {
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
      if (!simulation) {
        postTypedMessage({
          type: "error",
          message: "Cannot start: simulation not initialized",
          itemId: null,
        });
        return;
      }

      if (!isRunning) {
        isRunning = true;
        // Start compute loop (async, runs in background)
        void computeLoop();
      }
      break;
    }

    case "pause": {
      isRunning = false;
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
      maxTime = null;
      lastAckedFrame = 0;
      break;
    }

    case "updateParameters": {
      if (simulation) {
        // Hot-reload parameters without rebuilding
        simulation = {
          ...simulation,
          parameterValues: message.parameterValues,
        };
      }
      break;
    }

    case "setMaxTime": {
      maxTime = message.maxTime;
      break;
    }

    case "ack": {
      lastAckedFrame = message.frameNumber;
      break;
    }
  }
};

// Signal that worker is ready
postTypedMessage({
  type: "ready",
  initialFrameCount: 0,
});
