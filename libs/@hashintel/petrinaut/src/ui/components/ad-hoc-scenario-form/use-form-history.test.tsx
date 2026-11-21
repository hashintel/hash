/**
 * @vitest-environment jsdom
 *
 * The history's external-change handling: a parent that rematerializes the
 * same content every render (run-mode hosts do) must not grow the history,
 * while a real external change records one step.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

/** One control that carries the form's undo keys and makes one edit. */
const Harness = ({
  state,
  onChange,
  hostDerivesState,
}: {
  state: AdHocScenarioState;
  onChange: (state: AdHocScenarioState) => void;
  hostDerivesState?: boolean;
}) => {
  const { dispatch, handleKeyDown } = useAdHocFormHistory(
    state,
    context,
    onChange,
    hostDerivesState,
  );
  return (
    <button
      type="button"
      onKeyDown={handleKeyDown}
      onClick={() =>
        dispatch({
          type: "setExpression",
          target: { kind: "variable", placeId: null, index: 0 },
          expression: "3",
        })
      }
    >
      Edit
    </button>
  );
};

const editButton = () => screen.getByRole("button", { name: "Edit" });

const pressUndo = () =>
  fireEvent.keyDown(editButton(), { key: "z", metaKey: true });

afterEach(cleanup);

describe("useAdHocFormHistory", () => {
  it("keeps a host's derived state out of the undo stack", () => {
    // Run mode: the host owns part of the state and recomputes it from the
    // form's edits. Recording those arrivals made one edit land twice, and
    // undo could never get back past the derived half.
    const onChange = vi.fn<(state: AdHocScenarioState) => void>();
    const derived = stateWith("2");
    const { rerender } = render(
      <Harness state={stateWith("1")} onChange={onChange} hostDerivesState />,
    );
    rerender(<Harness state={derived} onChange={onChange} hostDerivesState />);
    pressUndo();
    expect(onChange).not.toHaveBeenCalled();

    // An edit made through the form is still one step, and still undoable.
    fireEvent.click(editButton());
    expect(onChange).toHaveBeenCalledTimes(1);
    const edited = onChange.mock.lastCall![0];
    rerender(<Harness state={edited} onChange={onChange} hostDerivesState />);
    pressUndo();
    expect(onChange.mock.lastCall![0]).toBe(derived);
  });

  it("adopts a same-content rematerialization without a history step", () => {
    const onChange = vi.fn<(state: AdHocScenarioState) => void>();
    const { rerender } = render(
      <Harness state={stateWith("1")} onChange={onChange} />,
    );

    // A fresh object with identical content: no new step, no undo.
    const sameContent = stateWith("1");
    rerender(<Harness state={sameContent} onChange={onChange} />);
    pressUndo();
    expect(onChange).not.toHaveBeenCalled();

    // A real external change records one step.
    rerender(<Harness state={stateWith("2")} onChange={onChange} />);
    pressUndo();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall![0]).toBe(sameContent);
  });
});
