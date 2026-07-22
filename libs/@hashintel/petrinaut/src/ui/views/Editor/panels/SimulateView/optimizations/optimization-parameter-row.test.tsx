/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOptimizationParameterDraft,
  OptimizationParameterRow,
} from "./optimization-parameter-row";

import type { ScenarioParameter } from "@hashintel/petrinaut-core";

vi.mock("../../../../../components/segment-group", () => ({
  SegmentGroup: ({
    onChange,
    options,
  }: {
    onChange: (value: string) => void;
    options: readonly { value: string; label: string }[];
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

afterEach(cleanup);

describe("OptimizationParameterRow", () => {
  it("starts fixed and exposes continuous range controls only when enabled", () => {
    const parameter = {
      type: "real",
      identifier: "rate",
      default: 0.5,
    } satisfies ScenarioParameter;
    const draft = createOptimizationParameterDraft(parameter);
    const view = render(
      <OptimizationParameterRow
        parameter={parameter}
        draft={draft}
        onChange={vi.fn()}
      />,
    );

    const optimize = screen.getByRole("checkbox", { name: "Optimize rate" });
    expect((optimize as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Value")).toBeTruthy();

    view.rerender(
      <OptimizationParameterRow
        parameter={parameter}
        draft={{ ...draft, mode: "optimize" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Minimum")).toBeTruthy();
    expect(screen.getByText("Maximum")).toBeTruthy();
    expect(screen.getByText("Scale")).toBeTruthy();
    expect(
      screen.getByText("Value").closest("[aria-hidden='true']"),
    ).toBeTruthy();
  });

  it("uses integer step and scale controls, and boolean categorical controls", () => {
    const integerParameter = {
      type: "integer",
      identifier: "count",
      default: 10,
    } satisfies ScenarioParameter;
    const integerDraft = createOptimizationParameterDraft(integerParameter);
    const onChange = vi.fn();
    const view = render(
      <OptimizationParameterRow
        parameter={integerParameter}
        draft={{ ...integerDraft, mode: "optimize", step: 2 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Step")).toBeTruthy();
    expect(screen.getByText("Scale")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...integerDraft,
      mode: "optimize",
      step: 1,
      scale: "log",
    });

    const booleanParameter = {
      type: "boolean",
      identifier: "enabled",
      default: 0,
    } satisfies ScenarioParameter;
    const booleanDraft = createOptimizationParameterDraft(booleanParameter);
    view.rerender(
      <OptimizationParameterRow
        parameter={booleanParameter}
        draft={{ ...booleanDraft, mode: "optimize" }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("The optimizer will try both false and true."),
    ).toBeTruthy();
  });
});
