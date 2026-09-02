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

  it("matches a per-run record translation across random draw batches", async () => {
    // A seeded LCG, so the property is reproducible.
    let state = 1234567;
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const numbers = (swept: Readonly<Record<string, number>>) => ({
      parameters: {
        rate: (swept.speed ?? 1) * 2,
        size: swept.size ?? 7,
        floor: 3,
      },
    });
    const base = numbers({ speed: 1.5 }).parameters;
    const netNames = new Set(["rate", "size", "floor"]);

    /** The record-per-run oracle: compile each run, union the changed names. */
    const viaRecords = (runs: readonly Record<string, number>[]) => {
      const compiled = runs.map(
        (run) => numbers({ speed: 1.5, ...run }).parameters,
      );
      const changed = new Set<string>();
      for (const [index, parameters] of compiled.entries()) {
        for (const [name, value] of Object.entries(parameters)) {
          if (base[name as keyof typeof base] !== value) {
            changed.add(name);
          }
        }
        for (const [name, draw] of Object.entries(runs[index]!)) {
          if (netNames.has(name) && base[name as keyof typeof base] !== draw) {
            changed.add(name);
          }
        }
      }
      const ids = [...changed].sort();
      return {
        ids,
        rows: compiled.map((parameters, index) =>
          ids.map((id) => {
            const value = parameters[id as keyof typeof parameters];
            const draw = runs[index]![id];
            return value !== base[id as keyof typeof base]
              ? value
              : (draw ?? value);
          }),
        ),
      };
    };

    for (let batch = 0; batch < 20; batch++) {
      const runCount = 1 + Math.floor(next() * 6);
      const values = new Float64Array(runCount * 2);
      for (let index = 0; index < values.length; index++) {
        // Draws sometimes exactly at the midpoint, sometimes off it.
        values[index] = next() < 0.4 ? 1.5 : Number(next().toPrecision(12));
      }
      const plan = await translateRangeDraws({
        draws: { identifiers: ["speed", "size"], values },
        midValues: { speed: 1.5 },
        baseParameters: base,
        compileRunNumbers: numbers,
        netParameterVariableNames: netNames,
      });
      const expected = viaRecords(
        Array.from({ length: runCount }, (_, run) => ({
          speed: values[run * 2]!,
          size: values[run * 2 + 1]!,
        })),
      );

      if (expected.ids.length === 0) {
        expect(plan).toBeUndefined();
        continue;
      }
      expect(plan?.ids).toEqual(expected.ids);
      for (const [run, row] of expected.rows.entries()) {
        expect([
          ...plan!.values.subarray(
            run * expected.ids.length,
            (run + 1) * expected.ids.length,
          ),
        ]).toEqual(row);
      }
    }
  });
});
