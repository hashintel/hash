import { describe, expect, it } from "vitest";

import { translateRangeDraws, translateRangeRuns } from "./sweep-run-overrides";

/** Overrides: net `rate` = scenario `speed` × 2; net `size` is untouched. */
const compileForValues = (swept: Readonly<Record<string, number>>) => ({
  result: {
    parameterValues: {
      rate: String((swept.speed ?? 1) * 2),
      size: "7",
    },
  },
});

const base = compileForValues({ speed: 1.5 }).result.parameterValues;

describe("translateRangeRuns", () => {
  it("re-evaluates overrides at each run's draws with one uniform key set", () => {
    const translated = translateRangeRuns({
      runs: [
        { parameterValues: { speed: "3" } },
        { parameterValues: { speed: "1.5" } },
      ],
      midValues: { speed: 1.5 },
      baseParameterValues: base,
      compileForValues,
      netParameterVariableNames: new Set(["rate", "size"]),
    })!;

    expect(translated[0]!.parameterValues).toEqual({ rate: "6" });
    // The second run drew the midpoint; it still carries the shared key —
    // backends lay per-run values out in one uniform buffer, and a run
    // with a different key set would poison or fail the whole batch.
    expect(translated[1]!.parameterValues).toEqual({ rate: "3" });
  });

  it("gives a midpoint-drawing FIRST run the full key set too", () => {
    const translated = translateRangeRuns({
      runs: [
        { parameterValues: { speed: "1.5" } },
        { parameterValues: { speed: "3" } },
      ],
      midValues: { speed: 1.5 },
      baseParameterValues: base,
      compileForValues,
      netParameterVariableNames: new Set(["rate", "size"]),
    })!;

    expect(translated[0]!.parameterValues).toEqual({ rate: "3" });
    expect(translated[1]!.parameterValues).toEqual({ rate: "6" });
  });

  it("passes a draw through directly when it names a net parameter", () => {
    const translated = translateRangeRuns({
      runs: [{ parameterValues: { size: "9" } }],
      midValues: {},
      baseParameterValues: base,
      compileForValues: () => ({ result: { parameterValues: { ...base } } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    })!;

    expect(translated[0]!.parameterValues).toEqual({ size: "9" });
  });

  it("returns undefined when no run overrides anything", () => {
    const translated = translateRangeRuns({
      runs: [{ parameterValues: { irrelevant: "5" } }],
      midValues: {},
      baseParameterValues: base,
      compileForValues: () => ({ result: { parameterValues: { ...base } } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(translated).toBeUndefined();
  });
});

/** Numeric mirror of `compileForValues` above. */
const compileRunNumbers = (swept: Readonly<Record<string, number>>) => ({
  parameters: { rate: (swept.speed ?? 1) * 2, size: 7 },
});
const baseParameters = compileRunNumbers({ speed: 1.5 }).parameters;

describe("translateRangeDraws", () => {
  it("produces a run-major plan with one uniform id set", async () => {
    const translated = await translateRangeDraws({
      draws: { identifiers: ["speed"], values: new Float64Array([3, 1.5]) },
      midValues: { speed: 1.5 },
      baseParameters,
      compileRunNumbers,
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    if (translated?.kind !== "plan") {
      throw new Error("expected a plan");
    }
    expect(translated.plan.ids).toEqual(["rate"]);
    // The second run drew the midpoint; it still carries the shared id with
    // the base value — backends lay per-run values out in one uniform buffer.
    expect([...translated.plan.values]).toEqual([6, 3]);
  });

  it("passes a draw through directly when it names a net parameter", async () => {
    const translated = await translateRangeDraws({
      draws: { identifiers: ["size"], values: new Float64Array([9]) },
      midValues: {},
      baseParameters,
      compileRunNumbers: () => ({ parameters: { ...baseParameters } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    if (translated?.kind !== "plan") {
      throw new Error("expected a plan");
    }
    expect(translated.plan.ids).toEqual(["size"]);
    expect([...translated.plan.values]).toEqual([9]);
  });

  it("returns undefined when no run changes anything", async () => {
    const translated = await translateRangeDraws({
      draws: { identifiers: ["irrelevant"], values: new Float64Array([5]) },
      midValues: {},
      baseParameters,
      compileRunNumbers: () => ({ parameters: { ...baseParameters } }),
      netParameterVariableNames: new Set(["rate", "size"]),
    });

    expect(translated).toBeUndefined();
  });

  it("falls back to run records when a changed value is not a number", async () => {
    const booleanBase = { rate: 3, armed: false };
    const translated = await translateRangeDraws({
      draws: { identifiers: ["speed"], values: new Float64Array([3]) },
      midValues: { speed: 1.5 },
      baseParameters: booleanBase,
      compileRunNumbers: (swept) => ({
        parameters: { rate: 3, armed: (swept.speed ?? 0) > 2 },
      }),
      netParameterVariableNames: new Set(["rate", "armed"]),
    });

    if (translated?.kind !== "runs") {
      throw new Error("expected the record fallback");
    }
    expect(translated.runs[0]!.parameterValues).toEqual({ armed: "true" });
  });

  it("falls back to run records for a direct draw onto a boolean parameter", async () => {
    // A numeric scenario parameter sharing a boolean net parameter's name:
    // the plan cannot carry it, and dropping it would sweep an axis with no
    // effect. The record form carries the raw draw for the engine to refuse.
    const translated = await translateRangeDraws({
      draws: { identifiers: ["armed"], values: new Float64Array([0.73]) },
      midValues: {},
      baseParameters: { rate: 3, armed: false },
      compileRunNumbers: () => ({ parameters: { rate: 3, armed: false } }),
      netParameterVariableNames: new Set(["rate", "armed"]),
    });

    if (translated?.kind !== "runs") {
      throw new Error("expected the record fallback");
    }
    expect(translated.runs[0]!.parameterValues).toEqual({ armed: "0.73" });
  });

  it("matches translateRangeRuns exactly across random draw batches", async () => {
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
    const numericBase = numbers({ speed: 1.5 }).parameters;
    const strings = (swept: Readonly<Record<string, number>>) => {
      const parameterValues: Record<string, string> = {};
      for (const [name, value] of Object.entries(numbers(swept).parameters)) {
        parameterValues[name] = String(value);
      }
      return { result: { parameterValues } };
    };
    const baseStrings = strings({ speed: 1.5 }).result.parameterValues;

    for (let batch = 0; batch < 20; batch++) {
      const runCount = 1 + Math.floor(next() * 6);
      const values = new Float64Array(runCount * 2);
      for (let index = 0; index < values.length; index++) {
        // Draws sometimes exactly at the midpoint, sometimes off it.
        values[index] = next() < 0.4 ? 1.5 : Number(next().toPrecision(12));
      }
      const identifiers = ["speed", "size"];
      const viaDraws = await translateRangeDraws({
        draws: { identifiers, values },
        midValues: { speed: 1.5 },
        baseParameters: numericBase,
        compileRunNumbers: numbers,
        netParameterVariableNames: new Set(["rate", "size", "floor"]),
      });
      const viaRuns = translateRangeRuns({
        runs: Array.from({ length: runCount }, (_, run) => ({
          parameterValues: {
            speed: String(values[run * 2]),
            size: String(values[run * 2 + 1]),
          },
        })),
        midValues: { speed: 1.5 },
        baseParameterValues: baseStrings,
        compileForValues: strings,
        netParameterVariableNames: new Set(["rate", "size", "floor"]),
      });

      if (viaRuns === undefined) {
        expect(viaDraws).toBeUndefined();
        continue;
      }
      if (viaDraws?.kind !== "plan") {
        throw new Error("expected a plan");
      }
      const ids = viaDraws.plan.ids;
      expect(ids).toEqual(Object.keys(viaRuns[0]!.parameterValues!).sort());
      for (let run = 0; run < runCount; run++) {
        for (const [index, id] of ids.entries()) {
          expect(String(viaDraws.plan.values[run * ids.length + index])).toBe(
            viaRuns[run]!.parameterValues![id],
          );
        }
      }
    }
  });
});
