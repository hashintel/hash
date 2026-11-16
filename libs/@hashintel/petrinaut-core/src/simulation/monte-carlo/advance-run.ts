/* eslint-disable no-param-reassign -- Monte Carlo run state is mutable by design. */
import {
  applyTokenAdditions,
  applyTokenRemovals,
  hasStructurallyEnabledTransition,
  mergeTokenAdditions,
  updateTransitionTimers,
  writeFrameAfterDynamics,
} from "./frame-operations";
import { computeTransitionEffect } from "./transition-effect";

import type { SimulationCompletionReason } from "../engine/compute-next-frame";
import type { RandomStream } from "../engine/seeded-rng";
import type { MonteCarloRunState, PlaceID } from "./internal-types";

/**
 * Marks a run as complete and records why no more frames will be advanced.
 */
function completeRun(
  run: MonteCarloRunState,
  reason: SimulationCompletionReason,
): void {
  run.status = "complete";
  run.completionReason = reason;
}

/**
 * Marks a run as errored while preserving a serializable error message.
 */
function failRun(run: MonteCarloRunState, error: unknown): void {
  run.status = "error";
  run.error = error instanceof Error ? error.message : String(error);
}

/**
 * Advances one Monte Carlo run by one simulation step.
 *
 * The step applies continuous dynamics, evaluates transition effects, mutates
 * the reusable frame buffers, swaps current/next frame pointers, advances time,
 * and updates completion status. It returns `true` only when a new frame was
 * produced.
 */
export function advanceRun(run: MonteCarloRunState): boolean {
  if (run.status === "complete" || run.status === "error") {
    return false;
  }

  try {
    if (run.frameNumber >= run.maxFrameNumber) {
      completeRun(run, "maxTime");
      return false;
    }

    run.status = "running";
    let workingFrame = writeFrameAfterDynamics(run);
    const tokensToAdd = new Map<PlaceID, Uint8Array[]>();
    const firedTransitions = new Set<string>();
    // Output tokens are applied once at the end of the frame, so capacity
    // checks need to see what earlier transitions already committed this frame.
    // Only allocated for nets that actually declare capacities.
    const pendingOutputCounts = run.pendingOutputCounts;
    pendingOutputCounts?.fill(0);

    const { transitionIds } = run.simulation.frameLayout;
    const stream: RandomStream = { key: 0, counter: 0 };
    for (
      let transitionIndex = 0;
      transitionIndex < transitionIds.length;
      transitionIndex++
    ) {
      const transitionId = transitionIds[transitionIndex]!;
      const transition = run.simulation.compiledTransitions.get(transitionId);
      if (!transition) {
        throw new Error(`Compiled transition ${transitionId} not found`);
      }

      stream.key = workingFrame.transitionRngKeys[transitionIndex]!;
      stream.counter = workingFrame.transitionRngCounters[transitionIndex]!;
      const firing = computeTransitionEffect(
        run,
        workingFrame,
        transition,
        pendingOutputCounts,
        stream,
      );
      // Every evaluation's randomness is consumed, fired or not — reusing
      // the counter would re-test the same draw next frame.
      workingFrame.transitionRngCounters[transitionIndex] = stream.counter;
      if (!firing) {
        continue;
      }

      firedTransitions.add(transitionId);
      applyTokenRemovals(
        run.simulation.frameLayout,
        workingFrame,
        firing.remove,
      );
      mergeTokenAdditions(tokensToAdd, firing.add);

      if (pendingOutputCounts) {
        for (const [placeId, tokens] of Object.entries(firing.add)) {
          const placeIndex =
            run.simulation.frameLayout.placeIndexById.get(placeId);
          if (placeIndex !== undefined) {
            pendingOutputCounts[placeIndex] =
              (pendingOutputCounts[placeIndex] ?? 0) + tokens.length;
          }
        }
      }
    }

    workingFrame = applyTokenAdditions(run, workingFrame, tokensToAdd);
    updateTransitionTimers(workingFrame, firedTransitions, run.simulation);

    run.nextFrame = run.currentFrame;
    run.currentFrame = workingFrame;
    run.frameNumber++;

    if (run.frameNumber >= run.maxFrameNumber) {
      completeRun(run, "maxTime");
    } else if (
      firedTransitions.size === 0 &&
      !hasStructurallyEnabledTransition(run)
    ) {
      completeRun(run, "deadlock");
    }

    return true;
  } catch (error) {
    failRun(run, error);
    return false;
  }
}
