import { describe, expect, it } from "vitest";

import {
  dashboardItemGenerationPhaseLabel,
  getDashboardItemGenerationOutputs,
  getDashboardItemGenerationPhase,
} from "./use-dashboard-item-generations";

import type { FlowRun } from "../../../graphql/api-types.gen";

const flowRunWithSteps = (steps: FlowRun["steps"]) => ({ steps }) as FlowRun;

describe("dashboard item generation progress", () => {
  it("maps flow step transitions to dashboard-specific phases", () => {
    expect(getDashboardItemGenerationPhase(flowRunWithSteps([]))).toBe(
      "building-query",
    );
    expect(
      getDashboardItemGenerationPhase(
        flowRunWithSteps([
          { stepId: "1", closedAt: "2026-07-16T10:00:00.000Z" },
        ] as FlowRun["steps"]),
      ),
    ).toBe("analyzing-data");
    expect(
      getDashboardItemGenerationPhase(
        flowRunWithSteps([
          { stepId: "2", closedAt: "2026-07-16T10:01:00.000Z" },
        ] as FlowRun["steps"]),
      ),
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
    const flowRun = flowRunWithSteps([
      {
        stepId: "1",
        outputs: [
          {
            contents: [
              {
                outputs: [
                  {
                    outputName: "structuralQuery",
                    payload: {
                      kind: "Text",
                      value: JSON.stringify({
                        filter: { all: [] },
                        traversalPaths: [],
                      }),
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as FlowRun["steps"]);

    expect(getDashboardItemGenerationOutputs(flowRun)).toMatchObject({
      structuralQuery: { filter: { all: [] }, traversalPaths: [] },
    });
    expect(getDashboardItemGenerationPhase(flowRun)).toBe("analyzing-data");
  });
});
