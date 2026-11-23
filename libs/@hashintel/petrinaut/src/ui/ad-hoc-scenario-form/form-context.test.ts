import { describe, expect, it } from "vitest";

import { EMPTY_AD_HOC_STATE } from "@hashintel/petrinaut-core";

import { adHocVariableKey } from "./dependency-highlight";
import {
  sameParts,
  variableHighlights,
  variableNameErrors,
  variablesOf,
} from "./form-context";

import type { AdHocFormFacts } from "./form-context";
import type {
  AdHocPlaceTotal,
  AdHocScenarioState,
  AdHocVariable,
} from "@hashintel/petrinaut-core";

describe("sameParts", () => {
  it("compares two lists item by item", () => {
    expect(sameParts([true, false], [true, false])).toBe(true);
    expect(sameParts([true, false], [true, true])).toBe(false);
    expect(sameParts([true], [true, false])).toBe(false);
    expect(sameParts(["late", undefined], ["late"])).toBe(false);
  });

  it("compares two records field by field", () => {
    expect(
      sameParts(
        { label: "x", error: undefined },
        { label: "x", error: undefined },
      ),
    ).toBe(true);
    expect(
      sameParts({ label: "x", error: undefined }, { label: "x", error: "bad" }),
    ).toBe(false);
  });

  it("tells a resolved place total from an unresolved one", () => {
    const resolved: AdHocPlaceTotal = { resolved: true, total: 3 };
    const unresolved: AdHocPlaceTotal = { resolved: false, text: "n + 3" };
    expect(sameParts(resolved, { resolved: true, total: 3 })).toBe(true);
    expect(sameParts(resolved, { resolved: true, total: 4 })).toBe(false);
    expect(sameParts<AdHocPlaceTotal>(resolved, unresolved)).toBe(false);
  });

  it("compares the values by identity", () => {
    const row = { name: "rate" };
    expect(sameParts([row], [row])).toBe(true);
    expect(sameParts([row], [{ name: "rate" }])).toBe(false);
  });
});

describe("the facts of a Variables table", () => {
  const variable = (name: string): AdHocVariable => ({
    name,
    type: "real",
    expression: "1",
    optimize: null,
    exposed: false,
  });
  const state: AdHocScenarioState = {
    ...EMPTY_AD_HOC_STATE,
    variables: [variable("rate"), variable("boost")],
    places: {
      queue: {
        kind: "coloured",
        variables: [variable("weight")],
        rows: [],
        sharedColumns: {},
      },
      pool: { kind: "uncoloured", count: { expression: "0", optimize: null } },
    },
  };
  const facts: AdHocFormFacts = {
    state,
    errorFor: ({ target, part }) =>
      target.kind === "variable" && target.index === 1 && part === "name"
        ? "Taken"
        : undefined,
    labelFor: () => "",
    placeTotal: () => ({ resolved: true, total: 0 }),
    highlight: {
      variableKeys: new Set([
        adHocVariableKey(null, "boost"),
        adHocVariableKey("queue", "weight"),
      ]),
      parameterIds: new Set(),
      slotKeys: new Set(),
    },
    expressionFor: () => undefined,
  };

  it("reads the form's own Variables, or a coloured place's", () => {
    expect(variablesOf(facts, null)).toBe(state.variables);
    expect(variablesOf(facts, "queue").map(({ name }) => name)).toEqual([
      "weight",
    ]);
  });

  it("gives a place without Variables one empty list", () => {
    expect(variablesOf(facts, "pool")).toEqual([]);
    expect(variablesOf(facts, "pool")).toBe(variablesOf(facts, "untouched"));
  });

  it("marks the Variables the focused value reads", () => {
    expect(variableHighlights(facts, null)).toEqual([false, true]);
    expect(variableHighlights(facts, "queue")).toEqual([true]);
  });

  it("lists the error of each name", () => {
    expect(variableNameErrors(facts, null)).toEqual([undefined, "Taken"]);
  });
});
