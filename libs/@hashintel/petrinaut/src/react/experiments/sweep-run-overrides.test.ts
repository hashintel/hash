import { describe, expect, it } from "vitest";

import { translateRangeRuns } from "./sweep-run-overrides";

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
