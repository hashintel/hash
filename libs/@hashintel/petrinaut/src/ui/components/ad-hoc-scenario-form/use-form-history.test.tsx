/**
 * @vitest-environment jsdom
 *
 * The history's external-change handling: a parent that rematerializes the
 * same content every render (run-mode hosts do) must not grow the history,
 * while a real external change records one step.
 */

import { act, renderHook } from "@testing-library/react";
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
  it("keeps a host's derived state out of the undo stack", () => {
    // Run mode: the host owns part of the state and recomputes it from the
    // form's edits. Recording those arrivals made one edit land twice, and
    // undo could never get back past the derived half.
    const { result, rerender } = renderHook(
      ({ state }) =>
        useAdHocFormHistory(state, context, () => {}, /* hostDerives */ true),
      { initialProps: { state: stateWith("1") } },
    );
    expect(result.current.history).toHaveLength(1);

    rerender({ state: stateWith("2") });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);

    // An edit made through the form is still one step, and still undoable.
    act(() => {
      result.current.dispatch({
        type: "setExpression",
        target: { kind: "variable", placeId: null, index: 0 },
        expression: "3",
      });
    });
    expect(result.current.history).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);
  });

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
