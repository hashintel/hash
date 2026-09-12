import { describe, expect, it, vi } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  type ConstraintDraftsState,
  EMPTY_CONSTRAINT_DRAFTS,
} from "./constraint-drafts";
import {
  constraintPolicyFor,
  lowerConstraintDrafts,
  stateConstraintGateSpecs,
} from "./lower-constraint-drafts";

import type { LanguageClientContextValue } from "../../../../../../../react/lsp/context";
import type {
  ConstraintSource,
  LowerConstraintResult,
} from "@hashintel/petrinaut-core";

const drafts: ConstraintDraftsState = {
  rows: [
    { id: "p1", space: "parameters", code: "scenario.a < 1" },
    { id: "s1", space: "state", code: "   " },
    { id: "s2", space: "state", code: "return state.places.I.count < 9;" },
  ],
  passThresholdPercent: 95,
};

const context = {
  netParameters: [],
  scenarioParameters: [],
  sdcpn: sirModel.petriNetDefinition,
};

const hir = {
  hirVersion: 1 as const,
  params: [],
  span: { start: 0, length: 0 },
  body: {
    kind: "boolLit" as const,
    id: 0,
    span: { start: 0, length: 0 },
    value: true,
  },
};

/** Lowers every source to a trivially true condition, keeping its name. */
const acceptingClient = (): LanguageClientContextValue["requestConstraint"] =>
  vi.fn((source: ConstraintSource) =>
    Promise.resolve({
      ok: true,
      constraint:
        source.space === "parameters"
          ? {
              ...source,
              space: "parameters",
              hir: { ...hir, surface: "scenario-expression" },
            }
          : { ...source, space: "state", hir: { ...hir, surface: "metric" } },
    } as LowerConstraintResult),
  );

describe("constraintPolicyFor", () => {
  it("writes no policy at the default threshold or while the field is blank", () => {
    expect(constraintPolicyFor(95)).toBeUndefined();
    expect(constraintPolicyFor(null)).toBeUndefined();
  });

  it("turns another threshold into the alpha it leaves, rounded to 1e-5", () => {
    expect(constraintPolicyFor(90)).toEqual({ alpha: 0.1 });
    expect(constraintPolicyFor(99.9)).toEqual({ alpha: 0.001 });
    expect(constraintPolicyFor(66.7)).toEqual({ alpha: 0.333 });
  });
});

describe("lowerConstraintDrafts", () => {
  it("lowers the non-blank rows in order, each named after its row", async () => {
    const requestConstraint = acceptingClient();
    const constraints = await lowerConstraintDrafts({
      drafts,
      requestConstraint,
      context,
    });

    expect(
      vi.mocked(requestConstraint).mock.calls.map(([source]) => source),
    ).toEqual([
      {
        space: "parameters",
        id: "p1",
        name: "Parameter constraint 1",
        code: "scenario.a < 1",
      },
      {
        space: "state",
        id: "s2",
        name: "State constraint 2",
        code: "return state.places.I.count < 9;",
      },
    ]);
    expect(vi.mocked(requestConstraint).mock.calls[0]?.[1]).toBe(context);
    expect(constraints.map((constraint) => constraint.name)).toEqual([
      "Parameter constraint 1",
      "State constraint 2",
    ]);
    expect(constraints[0]).toMatchObject({
      space: "parameters",
      hir: { surface: "scenario-expression" },
    });
  });

  it("rejects with the first failing row's label and diagnostic, in list order", async () => {
    const requestConstraint: LanguageClientContextValue["requestConstraint"] =
      vi.fn((source: ConstraintSource) =>
        Promise.resolve(
          source.id === "p1"
            ? ({
                ok: false,
                diagnostics: [
                  {
                    code: "hir:type",
                    message:
                      "Type 'number' is not assignable to type 'boolean'.",
                    severity: "error",
                    span: { start: 0, length: 1 },
                  },
                ],
              } as LowerConstraintResult)
            : ({
                ok: false,
                diagnostics: [],
              } as LowerConstraintResult),
        ),
      );

    await expect(
      lowerConstraintDrafts({ drafts, requestConstraint, context }),
    ).rejects.toThrow(
      "Parameter constraint 1: Type 'number' is not assignable to type 'boolean'.",
    );
  });

  it("falls back to a generic message when a failure carries no diagnostic", async () => {
    const requestConstraint: LanguageClientContextValue["requestConstraint"] =
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          diagnostics: [],
        } as LowerConstraintResult),
      );
    await expect(
      lowerConstraintDrafts({ drafts, requestConstraint, context }),
    ).rejects.toThrow("Parameter constraint 1: does not compile");
  });

  it("lowers nothing for an empty section", async () => {
    const requestConstraint = acceptingClient();
    expect(
      await lowerConstraintDrafts({
        drafts: EMPTY_CONSTRAINT_DRAFTS,
        requestConstraint,
        context,
      }),
    ).toEqual([]);
    expect(requestConstraint).not.toHaveBeenCalled();
  });
});

describe("stateConstraintGateSpecs", () => {
  it("emits one min-aggregated place count per non-blank state row, under the row's label", () => {
    expect(stateConstraintGateSpecs(drafts, "place__infected")).toEqual([
      {
        kind: "placeTokenCountMean",
        id: "s2",
        label: "State constraint 2",
        placeId: "place__infected",
        aggregateTime: "min",
      },
    ]);
  });

  it("emits nothing without a place to count", () => {
    expect(stateConstraintGateSpecs(drafts, undefined)).toEqual([]);
  });
});
