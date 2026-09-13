/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ObjectiveSection } from "./objective-section";
import { EMPTY_SWEEP_OBJECTIVE } from "./sweep-objective";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const stubs = await import("../../shared/ds-control-stubs");
  return { ...actual, ...stubs };
});

afterEach(cleanup);

const metrics = [
  { id: "peak", label: "Infected peak" },
  { id: "cost", label: "Total cost" },
];

const metricSelect = () =>
  screen.getByLabelText("Metric to optimize") as HTMLSelectElement;
const stepsInput = () =>
  screen.getByLabelText("Optimization steps") as HTMLInputElement;
const directionButton = (label: string) =>
  screen.getByRole("button", { name: label });

describe("ObjectiveSection", () => {
  it("shows the resolved metric, the direction and the steps over the description line", () => {
    render(
      <ObjectiveSection
        draft={EMPTY_SWEEP_OBJECTIVE}
        metricId="peak"
        metrics={metrics}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Objective")).toBeTruthy();
    expect(metricSelect().value).toBe("peak");
    expect(metricSelect().selectedOptions[0]?.text).toBe("Infected peak");
    expect(directionButton("Maximize").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(directionButton("Minimize").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(stepsInput().value).toBe("30");
    expect(
      screen
        .getByText(
          "30 steps · 8 runs each — the best point then refines to your run budget",
        )
        .getAttribute("data-tone"),
    ).toBeNull();
  });

  it("puts the error on the reserved line in place of the description", () => {
    render(
      <ObjectiveSection
        draft={{ ...EMPTY_SWEEP_OBJECTIVE, steps: 1_001 }}
        metricId="peak"
        metrics={metrics}
        error="Ask for 1 to 1,000 steps"
        onChange={() => {}}
      />,
    );

    const line = screen.getByText("Ask for 1 to 1,000 steps");
    expect(line.getAttribute("data-tone")).toBe("error");
    expect(screen.queryByText(/runs each/)).toBeNull();
  });

  it("disables the metric select and asks for a metric while there are no drafts", () => {
    render(
      <ObjectiveSection
        draft={EMPTY_SWEEP_OBJECTIVE}
        metricId={null}
        metrics={[]}
        error="Add a metric to optimize"
        onChange={() => {}}
      />,
    );

    expect(metricSelect().disabled).toBe(true);
    expect(metricSelect().selectedOptions[0]?.text).toBe("Add a metric below");
    expect(screen.getByText("Add a metric to optimize")).toBeTruthy();
    expect(stepsInput().disabled).toBe(false);
  });

  it("edits the draft one field at a time", () => {
    const onChange = vi.fn();
    render(
      <ObjectiveSection
        draft={EMPTY_SWEEP_OBJECTIVE}
        metricId="peak"
        metrics={metrics}
        error={null}
        onChange={onChange}
      />,
    );

    fireEvent.change(metricSelect(), { target: { value: "cost" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_SWEEP_OBJECTIVE,
      metricId: "cost",
    });

    fireEvent.click(directionButton("Minimize"));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_SWEEP_OBJECTIVE,
      direction: "minimize",
    });

    fireEvent.change(stepsInput(), { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_SWEEP_OBJECTIVE,
      steps: 12,
    });
  });

  it("disables every control while the drawer submits", () => {
    render(
      <ObjectiveSection
        draft={EMPTY_SWEEP_OBJECTIVE}
        metricId="peak"
        metrics={metrics}
        error={null}
        onChange={() => {}}
        disabled
      />,
    );

    expect(metricSelect().disabled).toBe(true);
    expect((directionButton("Minimize") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(stepsInput().disabled).toBe(true);
  });
});
