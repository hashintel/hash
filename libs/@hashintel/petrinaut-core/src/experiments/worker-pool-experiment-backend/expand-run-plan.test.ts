import { describe, expect, it } from "vitest";

import { expandRunPlan } from "./expand-run-plan";

import type { Parameter } from "../../types/sdcpn";

const parameter = (
  variableName: string,
  type: Parameter["type"],
): Parameter => ({
  id: `id_${variableName}`,
  name: variableName,
  variableName,
  type,
  defaultValue: type === "boolean" ? "false" : "0",
});

const parameters = [
  parameter("rate", "real"),
  parameter("count", "integer"),
  parameter("enabled", "boolean"),
];

describe("expandRunPlan", () => {
  it("lays each run's values out under its ids, run-major", () => {
    const runs = expandRunPlan(
      { ids: ["count", "rate"], values: Float64Array.of(1, 0.25, 2, 0.5) },
      2,
      parameters,
    );

    expect(runs).toEqual([
      { parameterValues: { count: "1", rate: "0.25" } },
      { parameterValues: { count: "2", rate: "0.5" } },
    ]);
  });

  it("expands a boolean parameter's 1/0 to the engine's true/false strings", () => {
    const runs = expandRunPlan(
      { ids: ["enabled"], values: Float64Array.of(1, 0) },
      2,
      parameters,
    );

    expect(runs.map((run) => run.parameterValues?.enabled)).toEqual([
      "true",
      "false",
    ]);
  });

  it("pins each run's seed when the plan carries seeds", () => {
    const runs = expandRunPlan(
      {
        ids: ["rate"],
        values: Float64Array.of(0.25, 0.5),
        seeds: [11, 12],
      },
      2,
      parameters,
    );

    expect(runs).toEqual([
      { seed: 11, parameterValues: { rate: "0.25" } },
      { seed: 12, parameterValues: { rate: "0.5" } },
    ]);
  });

  it("expands a plan with seeds and no ids to seed-only configs", () => {
    const runs = expandRunPlan(
      { ids: [], values: new Float64Array(0), seeds: [11, 12] },
      2,
      parameters,
    );

    expect(runs).toEqual([{ seed: 11 }, { seed: 12 }]);
  });

  it("leaves a boolean value other than 1/0 for the engine's parser to reject", () => {
    const [run] = expandRunPlan(
      { ids: ["enabled"], values: Float64Array.of(0.5) },
      1,
      parameters,
    );

    expect(run?.parameterValues?.enabled).toBe("0.5");
  });

  it("stringifies an id the net has no parameter for", () => {
    const [run] = expandRunPlan(
      { ids: ["unknown"], values: Float64Array.of(1) },
      1,
      parameters,
    );

    expect(run?.parameterValues?.unknown).toBe("1");
  });

  it("writes user-authored ids into prototype-free records", () => {
    const [run] = expandRunPlan(
      { ids: ["__proto__"], values: Float64Array.of(3) },
      1,
      parameters,
    );

    expect(Object.getPrototypeOf(run?.parameterValues)).toBeNull();
    expect(Object.hasOwn(run?.parameterValues ?? {}, "__proto__")).toBe(true);
  });
});
