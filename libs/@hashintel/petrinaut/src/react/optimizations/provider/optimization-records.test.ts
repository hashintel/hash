import { describe, expect, it } from "vitest";

import { PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE } from "@hashintel/petrinaut-core";

import { sirOptimizationInput } from "../sir-optimization-input.fixtures";
import {
  createOptimizationRecord,
  foldOptimizationEvent,
} from "./optimization-records";

import type { PetrinautOptimizationEvent } from "@hashintel/petrinaut-core";

const record = createOptimizationRecord("study", sirOptimizationInput, {
  kind: "sweep",
  experimentId: "experiment-sweep",
});

const trial = {
  type: "trial",
  trial: 0,
  parameters: { infected_ratio: 0.1 },
  objective: 0.4,
  state: "complete",
  best: null,
} as const;

const fold = (events: readonly PetrinautOptimizationEvent[], from = record) =>
  events.reduce(
    (current, event, index) => foldOptimizationEvent(current, event, index + 1),
    from,
  );

describe("foldOptimizationEvent", () => {
  it("counts each trial by its state and keeps the best step of a minimized objective", () => {
    const folded = fold([
      { type: "started", requestedTrials: 3 },
      trial,
      { ...trial, trial: 1, objective: 0.2 },
      { ...trial, trial: 2, objective: null, state: "pruned" },
    ]);

    expect(folded).toMatchObject({
      status: "running",
      lastSeq: 4,
      requestedTrials: 3,
      completedTrials: 2,
      prunedTrials: 1,
      failedTrials: 0,
      best: { trial: 1, objective: 0.2 },
    });
    expect(folded.trials).toHaveLength(3);
  });

  it("does not revive a cancelled study when a late trial reports", () => {
    const folded = fold([trial], { ...record, status: "cancelled" });

    expect(folded.status).toBe("cancelled");
    expect(folded.completedTrials).toBe(1);
  });

  it("keeps its own counters and best step when the study completes", () => {
    const folded = fold([
      trial,
      {
        type: "complete",
        requestedTrials: 5,
        completedTrials: 0,
        prunedTrials: 0,
        failedTrials: 0,
        best: null,
        resumable: true,
      },
    ]);

    expect(folded).toMatchObject({
      status: "complete",
      requestedTrials: 5,
      completedTrials: 1,
      best: { trial: 0, objective: 0.4 },
    });
  });

  it("ends cancelled without an error on the cancellation event, and failed with the message on any other", () => {
    const error = {
      type: "error",
      message: "optimization cancelled",
      retryable: false,
      resumable: false,
    } as const;

    expect(
      fold([{ ...error, code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE }]),
    ).toMatchObject({ status: "cancelled", error: null });
    expect(
      fold([{ ...error, code: "worker_crashed", message: "The worker died" }]),
    ).toMatchObject({ status: "error", error: "The worker died" });
  });
});
