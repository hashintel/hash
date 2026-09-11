/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ExperimentCard } from "./experiment-card";

import type { ExperimentToolPart } from "./experiment-card";
import type { PetrinautExperimentResult } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const part: ExperimentToolPart = {
  type: "tool-createExperiment",
  toolCallId: "tool",
  state: "input-available",
  input: {
    name: "Population",
    scenarioId: "scenario",
    scenarioParameterValues: {},
    runCount: 8,
    seed: 1,
    dt: 1,
    maxTime: 10,
    metricIds: ["count"],
    execution: { mode: "simulate" },
  },
};
const result: PetrinautExperimentResult = {
  status: "complete",
  experimentId: "experiment",
  name: "Population",
  runsCompleted: 8,
  metrics: [{ id: "count", label: "Count", value: 12 }],
};

it("reports actual run progress and removes active indicators when finished", () => {
  const progress = {
    experimentId: "experiment",
    name: "Population",
    phase: "running" as const,
    runsCompleted: 3,
    runsTarget: 8,
  };
  const view = render(<ExperimentCard part={part} state={{ progress }} />);
  const card = screen.getByRole("region", { name: "Experiment: Population" });
  expect(card.getAttribute("data-tone")).toBe("simulation");
  expect(card.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "3",
  );
  expect(screen.getByRole("progressbar").getAttribute("aria-valuemax")).toBe(
    "8",
  );
  view.rerender(
    <ExperimentCard
      part={part}
      state={{ progress: { ...progress, runsCompleted: 5 } }}
    />,
  );
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "5",
  );
  view.rerender(
    <ExperimentCard
      part={{ ...part, state: "output-available", output: result }}
    />,
  );
  expect(card.getAttribute("aria-busy")).toBe("false");
  expect(card.getAttribute("data-pending")).toBe("false");
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Finished");
});

it("keeps optimization identity while validating and after cancellation", () => {
  const optimizationPart: ExperimentToolPart = {
    ...part,
    input: {
      ...part.input,
      execution: {
        mode: "optimize",
        objectiveMetricId: "count",
        direction: "maximize",
        steps: 3,
        runsPerStep: 4,
      },
    },
  };
  const view = render(<ExperimentCard part={optimizationPart} />);
  const card = screen.getByRole("region", { name: "Experiment: Population" });
  expect(card.getAttribute("data-tone")).toBe("optimization");
  expect(screen.getByRole("status").textContent).toBe("Validating");
  view.rerender(
    <ExperimentCard
      part={optimizationPart}
      state={{ result: { ...result, status: "cancelled", metrics: [] } }}
    />,
  );
  expect(card.getAttribute("data-tone")).toBe("optimization");
  expect(card.getAttribute("data-pending")).toBe("false");
  expect(screen.getByRole("status").textContent).toBe("Cancelled");
});

it("shows a failed tool without a pending validation label or progress", () => {
  render(
    <ExperimentCard
      part={{
        ...part,
        state: "output-error",
        errorText: "The metric did not compile",
      }}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("Failed");
  expect(screen.queryByText("Checking the model")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
});
