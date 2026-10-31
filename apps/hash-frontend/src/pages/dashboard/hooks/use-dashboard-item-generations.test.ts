import { describe, expect, it } from "vitest";

import {
  dashboardItemGenerationPhaseLabel,
  getDashboardItemGenerationOutputs,
  getDashboardItemGenerationPhase,
} from "./use-dashboard-item-generations";

import type { FlowRunEvent } from "@local/hash-isomorphic-utils/flows/run-events";
import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";

const stepStarted = (stepId: string, occurredAt: string): FlowRunEvent => ({
  kind: "stepStarted",
  position: `${occurredAt}.0`,
  occurredAt,
  stepRun: { stepId, itemPath: [] },
  stepType: "generateStructuralQuery",
  inputs: [],
});

const attemptSucceeded = (
  stepId: string,
  occurredAt: string,
  outputs: StepOutput[] = [],
): FlowRunEvent => ({
  kind: "attemptSucceeded",
  position: `${occurredAt}.0`,
  occurredAt,
  stepRun: { stepId, itemPath: [] },
  attempt: 1,
  outputs,
});

describe("dashboard item generation progress", () => {
  it("maps flow step transitions to dashboard-specific phases", () => {
    expect(getDashboardItemGenerationPhase([])).toBe("building-query");
    expect(
      getDashboardItemGenerationPhase([
        stepStarted("1", "2026-07-16T10:00"),
        attemptSucceeded("1", "2026-07-16T10:01"),
      ]),
    ).toBe("analyzing-data");
    expect(
      getDashboardItemGenerationPhase([
        stepStarted("1", "2026-07-16T10:00"),
        attemptSucceeded("1", "2026-07-16T10:01"),
        stepStarted("2", "2026-07-16T10:02"),
        attemptSucceeded("2", "2026-07-16T10:03"),
      ]),
    ).toBe("creating-chart-configuration");
  });

  it("provides the card and modal labels", () => {
    expect(dashboardItemGenerationPhaseLabel("building-query")).toBe(
      "Building data query…",
    );
    expect(dashboardItemGenerationPhaseLabel("saving-configuration")).toBe(
      "Saving configuration…",
    );
  });

  it("exposes completed step outputs before the flow finishes", () => {
    const events = [
      stepStarted("1", "2026-07-16T10:00"),
      attemptSucceeded("1", "2026-07-16T10:01", [
        {
          outputName: "structuralQuery",
          payload: {
            kind: "Text",
            value: JSON.stringify({ filter: { all: [] }, traversalPaths: [] }),
          },
        },
      ]),
      stepStarted("2", "2026-07-16T10:02"),
    ];

    expect(getDashboardItemGenerationOutputs(events)).toMatchObject({
      structuralQuery: { filter: { all: [] }, traversalPaths: [] },
    });
    expect(getDashboardItemGenerationPhase(events)).toBe("analyzing-data");
  });
});
