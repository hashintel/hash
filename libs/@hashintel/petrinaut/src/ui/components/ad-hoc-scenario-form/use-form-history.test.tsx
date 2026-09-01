/**
 * @vitest-environment jsdom
 *
 * The history's external-change handling: a parent that rematerializes the
 * same content every render (run-mode hosts do) must not grow the history,
 * while a real external change records one step.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAdHocFormHistory } from "./use-form-history";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const context: AdHocSynthesisContext = {
  netParameters: [],
  places: [],
  types: [],
};

const stateWith = (expression: string): AdHocScenarioState => ({
  variables: [{ name: "load", type: "real", expression, optimize: null }],
  netParameters: [],
  places: {},
});

describe("useAdHocFormHistory", () => {
  it("adopts a same-content rematerialization without a history step", () => {
    const { result, rerender } = renderHook(
      ({ state }) => useAdHocFormHistory(state, context, () => {}),
      { initialProps: { state: stateWith("1") } },
    );
    expect(result.current.history).toHaveLength(1);

    // A fresh object with identical content: no new step, no undo.
    rerender({ state: stateWith("1") });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);

    // A real external change records one step.
    rerender({ state: stateWith("2") });
    expect(result.current.history).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);
  });
});
