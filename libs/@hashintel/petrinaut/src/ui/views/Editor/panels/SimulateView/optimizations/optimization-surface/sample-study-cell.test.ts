import { describe, expect, it } from "vitest";

import {
  buildOptimizationSurfaceAxes,
  optimizationAxisValueAt,
} from "../../../../../../../react/optimizations/surface-grid";
import {
  makeOptimizationInput,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import { sampleStudyCell, type StudyCellCache } from "./sample-study-cell";

import type { ExperimentsContextValue } from "../../../../../../../react/experiments/context";

type SampleRequest = Parameters<
  ExperimentsContextValue["sampleDetachedObjective"]
>[0];

const input = makeOptimizationInput(optimizedBindingSets.base);
const axes = buildOptimizationSurfaceAxes(input);
const [xAxis, yAxis] = axes as [(typeof axes)[number], (typeof axes)[number]];

const setup = () => {
  const requests: SampleRequest[] = [];
  const cache: StudyCellCache = new Map();
  const sample = (view: {
    xAxisId: string;
    yAxisId: string;
    xPosition: number;
    yPosition: number;
  }) =>
    sampleStudyCell({
      sampleDetachedObjective: (request) => {
        requests.push(request);
        return Promise.resolve({
          runsCompleted: request.runCount,
          metricFrames: [],
        });
      },
      cache,
      optimization: { id: "study", input },
      axes,
      slice: "",
      minRuns: 8,
      ...view,
    });
  return { requests, cache, sample };
};

describe("sampleStudyCell", () => {
  it("keys the cache by the axes as well as the positions, so swapped axes sample the other parameters", async () => {
    const { requests, cache, sample } = setup();
    const corner = { xPosition: 0, yPosition: yAxis.stepCount };

    await sample({
      xAxisId: xAxis.identifier,
      yAxisId: yAxis.identifier,
      ...corner,
    });
    await sample({
      xAxisId: yAxis.identifier,
      yAxisId: xAxis.identifier,
      ...corner,
    });

    expect(cache.size).toBe(2);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.scenarioParameterValues).toMatchObject({
      [xAxis.identifier]: optimizationAxisValueAt(xAxis, 0),
      [yAxis.identifier]: optimizationAxisValueAt(yAxis, yAxis.stepCount),
    });
    expect(requests[1]!.scenarioParameterValues).toMatchObject({
      [yAxis.identifier]: optimizationAxisValueAt(yAxis, 0),
      [xAxis.identifier]: optimizationAxisValueAt(xAxis, yAxis.stepCount),
    });
  });

  it("serves a cell sampled deep enough from the cache", async () => {
    const { requests, sample } = setup();
    const view = {
      xAxisId: xAxis.identifier,
      yAxisId: yAxis.identifier,
      xPosition: 3,
      yPosition: 4,
    };

    const first = await sample(view);
    const again = await sample(view);

    expect(requests).toHaveLength(1);
    expect(again).toBe(first);
  });
});
