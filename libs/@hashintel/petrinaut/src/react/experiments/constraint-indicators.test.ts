import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import { lowerConstraint } from "@hashintel/petrinaut-core/hir";

import { sirOptimizationConstraints } from "../optimizations/sir-optimization-input.fixtures";
import {
  constraintIndicatorMetricId,
  constraintIndicatorSpecs,
  sweepCellPassCount,
} from "./constraint-indicators";

import type { Constraint, SDCPN } from "@hashintel/petrinaut-core";

const sdcpn = sirModel.petriNetDefinition;

/** A state constraint over a place the SIR model does not have. */
const foreignStateConstraint = (): Constraint => {
  const queueNet: SDCPN = {
    ...sdcpn,
    places: [
      {
        id: "place-queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ],
  };
  const lowered = lowerConstraint(
    {
      space: "state",
      id: "queue-cap",
      name: "State constraint 1",
      code: "return state.places.Queue.count <= 10;",
    },
    { netParameters: [], scenarioParameters: [], sdcpn: queueNet },
  );
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics[0]?.message ?? "constraint");
  }
  return lowered.constraint;
};

describe("constraintIndicatorSpecs", () => {
  it("emits one always-indicator per state constraint, sampling every run, and skips parameter constraints", () => {
    const specs = constraintIndicatorSpecs(
      sirOptimizationConstraints,
      sdcpn,
      DEFAULT_PETRINAUT_EXTENSIONS,
    );

    expect(specs).toEqual([
      {
        kind: "expression",
        id: "constraint:infected-cap",
        label: "Infected under 900",
        code: "return state.places.Infected.count <= 900;",
        artifact: {
          source: expect.any(String) as string,
          placeNames: ["Infected"],
        },
        sampleRuns: "all",
        runOutput: { type: "distribution" },
        aggregateTime: "min",
      },
    ]);
  });

  it("keeps the indicator's id apart from any user metric id", () => {
    const userMetricIds = ["infected-cap", "constraint", "metric__infected"];
    for (const metricId of userMetricIds) {
      expect(userMetricIds).not.toContain(
        constraintIndicatorMetricId(metricId),
      );
    }
    expect(constraintIndicatorMetricId("infected-cap")).toBe(
      "constraint:infected-cap",
    );
  });

  it("throws naming the constraint when the emitter declines its body", () => {
    expect(() =>
      constraintIndicatorSpecs(
        [foreignStateConstraint()],
        sdcpn,
        DEFAULT_PETRINAUT_EXTENSIONS,
      ),
    ).toThrow(
      'State constraint "State constraint 1" cannot be compiled as a metric',
    );
  });
});

describe("sweepCellPassCount", () => {
  it("reads 6 of 8 runs passed from a mean of 0.75 over the 8 runs that reported", () => {
    expect(
      sweepCellPassCount(
        {
          means: { "constraint:infected-cap": 0.75 },
          sampleCounts: { "constraint:infected-cap": 8 },
        },
        "infected-cap",
      ),
    ).toEqual({ runsPassed: 6, runsTotal: 8 });
  });

  it("counts over the runs that reported, not the runs the cell completed", () => {
    // 8 runs completed, one errored: 5 of the 7 that reported passed.
    expect(
      sweepCellPassCount(
        {
          means: { "constraint:infected-cap": 5 / 7 },
          sampleCounts: { "constraint:infected-cap": 7 },
        },
        "infected-cap",
      ),
    ).toEqual({ runsPassed: 5, runsTotal: 7 });
  });

  it("is null for a cell whose indicator no run reported, or that carries no mean for it", () => {
    expect(
      sweepCellPassCount(
        {
          means: { "constraint:infected-cap": 1 },
          sampleCounts: { "constraint:infected-cap": 0 },
        },
        "infected-cap",
      ),
    ).toBeNull();
    expect(
      sweepCellPassCount(
        {
          means: { "infected-cap": 0.75 },
          sampleCounts: { "infected-cap": 8 },
        },
        "infected-cap",
      ),
    ).toBeNull();
  });
});
