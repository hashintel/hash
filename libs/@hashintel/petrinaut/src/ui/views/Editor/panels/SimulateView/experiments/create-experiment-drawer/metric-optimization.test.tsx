/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MetricObjectiveControl,
  OptimizationBudget,
} from "./metric-optimization";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const stubs = await import("../../shared/ds-control-stubs");
  return { ...actual, ...stubs };
});

afterEach(cleanup);

const stepsInput = () =>
  screen.getByLabelText("Optimization steps") as HTMLInputElement;

describe("OptimizationBudget", () => {
  it("shows the steps and search description", () => {
    render(<OptimizationBudget steps={30} error={null} onChange={() => {}} />);

    expect(stepsInput().value).toBe("30");
    expect(
      screen
        .getByText(
          "30 steps · 8 runs each — the best point then refines to your run budget",
        )
        .getAttribute("data-tone"),
    ).toBeNull();
  });

  it("shows the budget error in place of the description", () => {
    render(
      <OptimizationBudget
        steps={1_001}
        error="Ask for 1 to 1,000 steps"
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByText("Ask for 1 to 1,000 steps").getAttribute("data-tone"),
    ).toBe("error");
    expect(screen.queryByText(/runs each/)).toBeNull();
  });

  it("edits the step count and disables it during submission", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OptimizationBudget steps={30} error={null} onChange={onChange} />,
    );

    fireEvent.change(stepsInput(), { target: { value: "12" } });
    expect(onChange.mock.lastCall?.[0]).toBe(12);

    rerender(
      <OptimizationBudget
        steps={12}
        error={null}
        onChange={onChange}
        disabled
      />,
    );
    expect(stepsInput().disabled).toBe(true);
  });
});

describe("MetricObjectiveControl", () => {
  it("selects a metric and offers direction controls only for the objective", () => {
    const onSelect = vi.fn();
    const onDirectionChange = vi.fn();
    const props = {
      metricId: "peak",
      metricLabel: "Infected peak",
      groupName: "objective",
      onSelect,
      onDirectionChange,
    };
    const { rerender } = render(
      <MetricObjectiveControl {...props} direction={null} />,
    );

    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Use as objective" }));
    expect(onSelect).toHaveBeenCalledOnce();

    rerender(<MetricObjectiveControl {...props} direction="maximize" />);
    expect((screen.getByRole("radio") as HTMLInputElement).checked).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Maximize" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    expect(onDirectionChange).toHaveBeenCalledWith("minimize");

    rerender(
      <MetricObjectiveControl {...props} direction="minimize" disabled />,
    );
    expect((screen.getByRole("radio") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Minimize" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
