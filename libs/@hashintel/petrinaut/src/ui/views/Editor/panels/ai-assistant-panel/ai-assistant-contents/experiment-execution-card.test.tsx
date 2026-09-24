/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ExperimentExecutionCard } from "./experiment-execution-card";

import type {
  PetrinautExperimentProgress,
  PetrinautExperimentRequest,
  PetrinautExperimentResult,
} from "@hashintel/petrinaut-core";

afterEach(cleanup);

const request: PetrinautExperimentRequest = {
  name: "Staffing",
  scenarioId: "peak",
  scenarioParameterValues: { agents: { mode: "fixed", value: 4 } },
  runCount: 12,
  seed: 7,
  dt: 1,
  maxTime: 120,
  metricIds: ["wait"],
  execution: { mode: "simulate" },
};
const result: PetrinautExperimentResult = {
  name: "Staffing",
  experimentId: "experiment",
  status: "complete",
  runsCompleted: 12,
  metrics: [
    { id: "wait", label: "Waiting time", value: 2.375 },
    { id: "missing", label: "Unavailable metric", value: null },
  ],
};

it.each(["simulate", "optimize"] as const)(
  "renders %s phases and terminal results without any editor context",
  (mode) => {
    const execution: PetrinautExperimentRequest["execution"] =
      mode === "simulate"
        ? { mode }
        : {
            mode,
            objectiveMetricId: "wait",
            direction: "minimize",
            steps: 4,
            runsPerStep: 6,
          };
    const onCancel = vi.fn();
    const onViewExperiment = vi.fn();
    const props = {
      request: {
        ...request,
        execution,
        scenarioParameterValues:
          mode === "optimize"
            ? { agents: { mode: "range" as const, min: 2, max: 8 } }
            : request.scenarioParameterValues,
      },
      active: true,
      onCancel,
      onViewExperiment,
    };
    const view = render(<ExperimentExecutionCard {...props} />);
    const card = screen.getByRole("region", { name: "Experiment: Staffing" });
    expect(card.getAttribute("data-tone")).toBe(
      mode === "simulate" ? "simulation" : "optimization",
    );
    expect(screen.getByRole("status").textContent).toBe("Validating");
    expect(onViewExperiment).not.toHaveBeenCalled();

    const progress: PetrinautExperimentProgress = {
      name: "Staffing",
      experimentId: "experiment",
      phase: mode === "simulate" ? "running" : "optimizing",
      runsCompleted: 2,
      runsTarget: 6,
      step: 3,
      steps: 4,
    };
    view.rerender(<ExperimentExecutionCard {...props} progress={progress} />);
    expect(screen.getByRole("status").textContent).toBe(
      mode === "simulate" ? "Running" : "Optimizing",
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "2",
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe(
      "6",
    );
    expect(screen.getByRole("progressbar").className).toContain("h_[3px]");
    expect(card.className).toContain("bg-c_neutral.s00");
    expect(card.className).toContain("bd-c_purple.a30");
    if (mode === "optimize") {
      expect(screen.getByText("Step 3 of 4")).toBeTruthy();
      view.rerender(
        <ExperimentExecutionCard
          {...props}
          progress={{
            ...progress,
            phase: "refining",
            runsCompleted: 7,
            runsTarget: 12,
          }}
        />,
      );
      expect(screen.getByRole("status").textContent).toBe("Refining");
      expect(screen.getByText("Refining the best result")).toBeTruthy();
      expect(screen.queryByText("Step 3 of 4")).toBeNull();
      expect(
        screen.getByRole("progressbar").getAttribute("aria-valuenow"),
      ).toBe("7");
    }
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /View experiment/u }));
    expect(onViewExperiment).toHaveBeenCalledTimes(1);

    // A terminal result wins over an outdated active/progress snapshot.
    view.rerender(
      <ExperimentExecutionCard
        {...props}
        progress={progress}
        result={result}
      />,
    );
    expect(card.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe("Finished");
    expect(screen.getByText("2.375")).toBeTruthy();
    expect(screen.getByText("No value")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    view.rerender(
      <ExperimentExecutionCard
        {...props}
        active={false}
        result={{ ...result, status: "cancelled" }}
        onViewExperiment={undefined}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Cancelled");
    expect(
      screen.queryByRole("button", { name: /View experiment/u }),
    ).toBeNull();
    expect(screen.getByText(/experiment is no longer open/)).toBeTruthy();
    expect(card.getAttribute("data-tone")).toBe(
      mode === "simulate" ? "simulation" : "optimization",
    );

    view.rerender(
      <ExperimentExecutionCard
        {...props}
        result={{ ...result, status: "error", message: "Worker failed" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Failed");
    expect(screen.getByText("Worker failed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  },
);

it("distinguishes an execution error from an unavailable result", () => {
  const onRetry = vi.fn();
  const view = render(
    <ExperimentExecutionCard
      request={request}
      active
      error="Compilation failed"
      onRetry={onRetry}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("Failed");
  expect(screen.getByText("Compilation failed")).toBeTruthy();
  expect(screen.queryByText(/No result is available/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry run" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  view.rerender(<ExperimentExecutionCard request={request} active={false} />);
  expect(screen.getByRole("status").textContent).toBe("Not running");
  expect(screen.getByText(/No result is available/)).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
