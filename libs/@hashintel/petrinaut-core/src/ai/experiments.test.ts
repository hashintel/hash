import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  petrinautExperimentRequestSchema,
  petrinautExperimentResultSchema,
} from "../ai";

const simulation = {
  name: "Baseline",
  scenarioId: "baseline",
  scenarioParameterValues: { enabled: { mode: "fixed", value: true } },
  runCount: 10,
  seed: 42,
  dt: 0.1,
  maxTime: 10,
  metricIds: ["cost"],
  execution: { mode: "simulate" },
};

const optimization = {
  ...simulation,
  scenarioParameterValues: { capacity: { mode: "range", min: 1, max: 10 } },
  execution: {
    mode: "optimize",
    objectiveMetricId: "cost",
    direction: "minimize",
    steps: 5,
    runsPerStep: 5,
  },
};

describe("experiment tool schemas", () => {
  it("accepts typed fixed values and bounded optimization", () => {
    expect(petrinautExperimentRequestSchema.parse(simulation)).toEqual(
      simulation,
    );
    expect(petrinautExperimentRequestSchema.parse(optimization)).toEqual(
      optimization,
    );
  });

  it.each([
    {
      ...simulation,
      scenarioParameterValues: optimization.scenarioParameterValues,
    },
    { ...optimization, scenarioParameterValues: {} },
    {
      ...optimization,
      scenarioParameterValues: { capacity: { mode: "range", min: 10, max: 1 } },
    },
    {
      ...optimization,
      execution: { ...optimization.execution, runsPerStep: 11 },
    },
    {
      ...optimization,
      execution: { ...optimization.execution, objectiveMetricId: "missing" },
    },
    { ...simulation, metricIds: ["cost", "cost"] },
    { ...simulation, runCount: 0 },
    { ...simulation, runCount: 1001 },
    { ...simulation, dt: 1e-10 },
    { ...simulation, dt: 11 },
    {
      ...simulation,
      scenarioParameterValues: { enabled: { mode: "fixed", value: "false" } },
    },
  ])("rejects invalid bounds or ambiguous requests", (request) => {
    expect(petrinautExperimentRequestSchema.safeParse(request).success).toBe(
      false,
    );
  });

  it("exposes an object JSON schema for tool providers", () => {
    const schema = z.toJSONSchema(petrinautExperimentRequestSchema);
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("execution");
    expect(schema.additionalProperties).toBe(false);
  });

  it("rejects non-finite metric results", () => {
    expect(
      petrinautExperimentResultSchema.safeParse({
        status: "complete",
        experimentId: "experiment",
        name: "Baseline",
        runsCompleted: 10,
        metrics: [{ id: "cost", label: "Cost", value: NaN }],
      }).success,
    ).toBe(false);
  });
});
