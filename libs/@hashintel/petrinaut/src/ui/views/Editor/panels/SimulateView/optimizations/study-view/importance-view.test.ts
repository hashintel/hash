import { describe, expect, it } from "vitest";

import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeTrials,
  optimizedBindingSets,
} from "../optimizations-story-fixtures";
import {
  describeImportance,
  formatCorrelation,
  formatImportance,
  importanceFloor,
  importanceRows,
  optimizedParameterIdentifiers,
  pearsonCorrelations,
} from "./importance-view";

import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

const trialAt = (
  trial: number,
  parameters: Record<string, number | boolean>,
  objective: number | null,
): PetrinautOptimizationTrialEvent => ({
  type: "trial",
  trial,
  parameters,
  objective,
  state: objective === null ? "pruned" : "complete",
  best: null,
});

describe("importanceFloor", () => {
  it("is 100 for a study of 100 steps or more, else 50", () => {
    expect(importanceFloor(30)).toBe(50);
    expect(importanceFloor(99)).toBe(50);
    expect(importanceFloor(100)).toBe(100);
    expect(importanceFloor(400)).toBe(100);
  });
});

describe("optimizedParameterIdentifiers", () => {
  it("lists numeric and boolean optimized parameters in binding order, never fixed ones", () => {
    const input = {
      scenario: {
        id: "scenario",
        parameterBindings: {
          batch_size: { kind: "fixed", value: 220 },
          ...optimizedBindingSets.base,
          express_shipping: { kind: "optimize", domain: { kind: "boolean" } },
        },
      },
    } satisfies Parameters<typeof optimizedParameterIdentifiers>[0];

    expect(optimizedParameterIdentifiers(input)).toEqual([
      "production_rate",
      "selling_price",
      "express_shipping",
    ]);
  });
});

describe("pearsonCorrelations", () => {
  it("is ±1 within 1e-9 on a linear objective, with booleans as 0 and 1", () => {
    const trials = [0.1, 0.4, 0.7, 0.9].map((rate, index) =>
      trialAt(
        index,
        { rate, enabled: index % 2 === 0, fixed: 3 },
        10 - 4 * rate,
      ),
    );

    const correlations = pearsonCorrelations(trials, [
      "rate",
      "enabled",
      "fixed",
    ]);

    expect(correlations.rate).toBeCloseTo(-1, 9);
    expect(correlations.enabled).not.toBeNull();
    expect(Math.abs(correlations.enabled!)).toBeLessThan(1);
    expect(correlations.fixed).toBeNull();
  });

  it("is null under three completed steps and leaves pruned steps out", () => {
    const two = [trialAt(0, { rate: 0.1 }, 1), trialAt(1, { rate: 0.2 }, 2)];
    expect(pearsonCorrelations(two, ["rate"]).rate).toBeNull();

    const withPruned = [...two, trialAt(2, { rate: 0.3 }, null)];
    expect(pearsonCorrelations(withPruned, ["rate"]).rate).toBeNull();

    const three = [...two, trialAt(2, { rate: 0.3 }, 3)];
    expect(pearsonCorrelations(three, ["rate"]).rate).toBeCloseTo(1, 9);
  });
});

describe("importanceRows", () => {
  const input = makeOptimizationInput(optimizedBindingSets.logScale);
  const { trials } = makeTrials(input, 30);

  it("sorts by importance then identifier and scales the bars to the largest share above the floor", () => {
    const view = importanceRows(
      makeOptimizationRecord({
        input: { ...input, study: { ...input.study, trials: 60 } },
        trials,
        importance: {
          values: {
            production_rate: 0.5,
            selling_price: 0.3,
            marketing_spend: 0.2,
          },
          completedTrials: 54,
        },
      }),
    );

    expect(view.rows.map((row) => row.identifier)).toEqual([
      "production_rate",
      "selling_price",
      "marketing_spend",
    ]);
    expect(view.rows.every((row) => row.correlation !== null)).toBe(true);
    expect(view).toMatchObject({
      effectiveCount: 54,
      floor: 50,
      belowFloor: false,
      barScale: 0.5,
    });
  });

  it("fades below the floor: the estimate's own count, the whole unit as the scale", () => {
    const view = importanceRows(
      makeOptimizationRecord({
        input,
        trials,
        importance: {
          values: {
            production_rate: 0.3,
            selling_price: 0.5,
            marketing_spend: 0.2,
          },
          completedTrials: 27,
        },
      }),
    );

    expect(view.rows[0]?.identifier).toBe("selling_price");
    expect(view).toMatchObject({
      effectiveCount: 27,
      floor: 50,
      belowFloor: true,
      barScale: 1,
    });
  });

  it("counts the completed steps itself while no estimate arrived, keeping identifier order and the correlations", () => {
    const view = importanceRows(makeOptimizationRecord({ input, trials }));

    expect(view.rows.map((row) => row.identifier)).toEqual([
      "marketing_spend",
      "production_rate",
      "selling_price",
    ]);
    expect(view.rows.every((row) => row.importance === null)).toBe(true);
    expect(view.rows.every((row) => row.correlation !== null)).toBe(true);
    expect(view.effectiveCount).toBe(
      trials.filter((trial) => trial.state === "complete").length,
    );
    expect(view.belowFloor).toBe(true);
  });

  it("gives an empty study dashed rows and no correlations", () => {
    const view = importanceRows(makeOptimizationRecord({ input }));

    expect(view.rows).toHaveLength(3);
    expect(
      view.rows.every(
        (row) => row.importance === null && row.correlation === null,
      ),
    ).toBe(true);
    expect(view.effectiveCount).toBe(0);
  });
});

describe("the card's copy", () => {
  it("leads with the count, names the floor only below it, and ends with PED-ANOVA's question", () => {
    const rows: never[] = [];
    expect(
      describeImportance({
        rows,
        effectiveCount: 54,
        floor: 50,
        belowFloor: false,
        barScale: 0.5,
      }),
    ).toBe(
      "estimated from 54 completed steps · PED-ANOVA: how much of the objective's variance each parameter explains",
    );
    expect(
      describeImportance({
        rows,
        effectiveCount: 27,
        floor: 50,
        belowFloor: true,
        barScale: 1,
      }),
    ).toBe(
      "estimated from 27 completed steps · below the 50-step floor, treat as a hint · PED-ANOVA: how much of the objective's variance each parameter explains",
    );
    expect(
      describeImportance({
        rows,
        effectiveCount: 1,
        floor: 50,
        belowFloor: true,
        barScale: 1,
      }),
    ).toContain("estimated from 1 completed step ·");
  });

  it("prints a share as a whole percentage and a correlation with its sign", () => {
    expect(formatImportance(0.5)).toBe("50%");
    expect(formatImportance(0.004)).toBe("0%");
    expect(formatCorrelation(0.834)).toBe("+0.83");
    expect(formatCorrelation(-0.125)).toBe("−0.13");
    expect(formatCorrelation(0)).toBe("+0.00");
  });
});
