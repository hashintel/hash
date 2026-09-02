import { describe, expect, it } from "vitest";

import { translateRangeDraws } from "./sweep-run-overrides";

/** Overrides: net `rate` = scenario `speed` × 2; net `size` is untouched. */
const compileRunNumbers = (swept: Readonly<Record<string, number>>) => ({
  parameters: { rate: (swept.speed ?? 1) * 2, size: 7 },
});
const baseParameters = compileRunNumbers({ speed: 1.5 }).parameters;

describe("translateRangeDraws", () => {
  it("produces a run-major plan with one uniform id set", async () => {
    const plan = await translateRangeDraws({
      draws: { identifiers: ["speed"], values: new Float64Array([3, 1.5]) },
      midValues: { speed: 1.5 },
      baseParameters,
      compileRunNumbers,
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(plan?.ids).toEqual(["rate"]);
    // The second run drew the midpoint; it still carries the shared id with
    // the base value — backends lay per-run values out in one uniform buffer.
    expect([...plan!.values]).toEqual([6, 3]);
  });

  it("gives a midpoint-drawing FIRST run the full id set too", async () => {
    const plan = await translateRangeDraws({
      draws: { identifiers: ["speed"], values: new Float64Array([1.5, 3]) },
      midValues: { speed: 1.5 },
      baseParameters,
      compileRunNumbers,
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(plan?.ids).toEqual(["rate"]);
    expect([...plan!.values]).toEqual([3, 6]);
  });

  it("passes a draw through directly when it names a net parameter", async () => {
    const plan = await translateRangeDraws({
      draws: { identifiers: ["size"], values: new Float64Array([9]) },
      midValues: {},
      baseParameters,
      compileRunNumbers: () => ({ parameters: { ...baseParameters } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(plan?.ids).toEqual(["size"]);
    expect([...plan!.values]).toEqual([9]);
  });

  it("returns undefined when no run changes anything", async () => {
    const plan = await translateRangeDraws({
      draws: { identifiers: ["irrelevant"], values: new Float64Array([5]) },
      midValues: {},
      baseParameters,
      compileRunNumbers: () => ({ parameters: { ...baseParameters } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(plan).toBeUndefined();
  });

  it("carries a boolean override as 1/0", async () => {
    const plan = await translateRangeDraws({
      draws: { identifiers: ["speed"], values: new Float64Array([3, 1]) },
      midValues: { speed: 1.5 },
      baseParameters: { rate: 3, armed: false },
      compileRunNumbers: (swept) => ({
        parameters: { rate: 3, armed: (swept.speed ?? 0) > 2 },
      }),
      netParameterVariableNames: new Set(["rate", "armed"]),
    });

    expect(plan?.ids).toEqual(["armed"]);
    expect([...plan!.values]).toEqual([1, 0]);
  });

  it("carries a direct draw onto a boolean parameter as drawn", async () => {
    // A numeric scenario parameter sharing a boolean net parameter's name:
    // the plan carries the raw draw for the engine to refuse rather than
    // sweeping an axis with no effect.
    const plan = await translateRangeDraws({
      draws: { identifiers: ["armed"], values: new Float64Array([0.73]) },
      midValues: {},
      baseParameters: { rate: 3, armed: false },
      compileRunNumbers: () => ({ parameters: { rate: 3, armed: false } }),
      netParameterVariableNames: new Set(["rate", "armed"]),
    });

    expect(plan?.ids).toEqual(["armed"]);
    expect([...plan!.values]).toEqual([0.73]);
  });

  it("lays several swept ids out run-major, base values filling the unchanged cells", async () => {
    const compileNumbers = (swept: Readonly<Record<string, number>>) => ({
      parameters: { rate: (swept.speed ?? 1) * 2, size: swept.size ?? 7 },
    });
    const plan = await translateRangeDraws({
      // Run 0 changes only the rate; run 1 draws the midpoint speed and a new size.
      draws: {
        identifiers: ["speed", "size"],
        values: new Float64Array([3, 7, 1.5, 9]),
      },
      midValues: { speed: 1.5 },
      baseParameters: compileNumbers({ speed: 1.5 }).parameters,
      compileRunNumbers: compileNumbers,
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(plan?.ids).toEqual(["rate", "size"]);
    expect([...plan!.values]).toEqual([6, 7, 3, 9]);
  });
});
