/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOptimizationParameterDraft,
  OptimizationParameterRow,
} from "./optimization-parameter-row";

import type { ScenarioParameter } from "@hashintel/petrinaut-core";

vi.mock("../../../../../components/segment-group", () => ({
  SegmentGroup: () => <div>Scale options</div>,
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
    expect(screen.getByText("Fixed value")).toBeTruthy();

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
    expect(screen.queryByText("Fixed value")).toBeNull();
  });

  it("uses integer step and boolean categorical controls", () => {
    const integerParameter = {
      type: "integer",
      identifier: "count",
      default: 10,
    } satisfies ScenarioParameter;
    const integerDraft = createOptimizationParameterDraft(integerParameter);
    const view = render(
      <OptimizationParameterRow
        parameter={integerParameter}
        draft={{ ...integerDraft, mode: "optimize" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Step")).toBeTruthy();

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
      screen.getByText("Optuna will try both false and true."),
    ).toBeTruthy();
  });
});
