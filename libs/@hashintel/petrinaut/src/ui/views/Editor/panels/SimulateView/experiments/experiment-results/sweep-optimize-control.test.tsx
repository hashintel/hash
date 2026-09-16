/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeParameterSweepExperiment } from "../experiments-story-fixtures";
import { SweepOptimizeControl } from "./sweep-optimize-control";

import type { SweepObjective } from "../sweep-optimizer";

vi.mock("@hashintel/ds-components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hashintel/ds-components")>()),
  ...(await import("../../shared/ds-control-stubs")),
}));

afterEach(cleanup);

const experiment = makeParameterSweepExperiment();
const open = () =>
  fireEvent.click(screen.getByRole("button", { name: /Optimize/ }));
const startButton = () =>
  screen.getByRole("button", { name: "Start" }) as HTMLButtonElement;

describe("SweepOptimizeControl", () => {
  it("starts only on confirmation with the selected metric, direction and steps", async () => {
    const onStart = vi.fn<(objective: SweepObjective) => Promise<void>>(() =>
      Promise.resolve(),
    );
    render(
      <SweepOptimizeControl
        experiment={{
          ...experiment,
          metricSpecs: [
            ...experiment.metricSpecs,
            {
              kind: "expression",
              id: "peak",
              label: "Peak",
              code: "return 1;",
            },
          ],
        }}
        onStart={onStart}
      />,
    );
    open();
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Metric to optimize"), {
      target: { value: "peak" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.change(screen.getByLabelText("Optimization steps"), {
      target: { value: "12" },
    });
    fireEvent.click(startButton());
    await waitFor(() =>
      expect(onStart).toHaveBeenCalledWith({
        metricId: "peak",
        direction: "minimize",
        steps: 12,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Optimize this sweep")).toBeNull(),
    );
  });

  it("rejects invalid steps and the total execution budget before starting", () => {
    const onStart = vi.fn(() => Promise.resolve());
    render(
      <SweepOptimizeControl
        experiment={{ ...experiment, dt: 0.1 }}
        onStart={onStart}
      />,
    );
    open();
    fireEvent.change(screen.getByLabelText("Optimization steps"), {
      target: { value: "1001" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(/1 to 1,000 steps/);
    expect(startButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Optimization steps"), {
      target: { value: "1000" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(
      /over the optimizer's/,
    );
    expect(startButton().disabled).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("retains the prompt and chosen values after a failed start", async () => {
    const onStart = vi.fn(() =>
      Promise.reject(new Error("Optimizer disconnected")),
    );
    render(<SweepOptimizeControl experiment={experiment} onStart={onStart} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(startButton());
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Optimizer disconnected",
    );
    expect(
      screen
        .getByRole("button", { name: "Minimize" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(startButton().disabled).toBe(false);
  });
});
