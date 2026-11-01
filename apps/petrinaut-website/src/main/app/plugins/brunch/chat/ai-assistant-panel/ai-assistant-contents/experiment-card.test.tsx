/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render as renderWithoutApi,
  screen,
} from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import {
  createTestEditorApi,
  TestEditorApi,
} from "../../testing/create-test-editor-api";
import { ExperimentCard } from "./experiment-card";

import type { ExperimentToolPart } from "./experiment-card";
import type { PetrinautExperimentResult } from "@hashintel/petrinaut-core";
import type { ExperimentRecord } from "@hashintel/petrinaut/react";

afterEach(cleanup);

// The card reads experiment records through the chat's plugin `api`.
const records = createReadableStore<readonly ExperimentRecord[]>([]);
const api = createTestEditorApi(undefined, { records });
const WithApi = ({ children }: { children: ReactNode }) => (
  <TestEditorApi api={api}>{children}</TestEditorApi>
);
const render = (ui: ReactNode) => {
  records.set([]);
  return renderWithoutApi(ui, { wrapper: WithApi });
};

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
  const view = render(
    <ExperimentCard part={part} state={{ active: true, progress }} />,
  );
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
      state={{ active: true, progress: { ...progress, runsCompleted: 5 } }}
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
  const view = render(
    <ExperimentCard part={optimizationPart} state={{ active: true }} />,
  );
  const card = screen.getByRole("region", { name: "Experiment: Population" });
  expect(card.getAttribute("data-tone")).toBe("optimization");
  expect(screen.getByRole("status").textContent).toBe("Validating");
  view.rerender(
    <ExperimentCard
      part={optimizationPart}
      state={{
        active: false,
        result: { ...result, status: "cancelled", metrics: [] },
      }}
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

it("only offers cancellation while this panel owns a running request", () => {
  const onCancel = vi.fn();
  const view = render(<ExperimentCard part={part} onCancel={onCancel} />);
  const card = screen.getByRole("region", { name: "Experiment: Population" });
  expect(card.getAttribute("aria-busy")).toBe("false");
  expect(screen.getByRole("status").textContent).toBe("Not running");
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  expect(
    screen.getByText(/Ask the assistant to run a new experiment/),
  ).not.toBeNull();

  view.rerender(
    <ExperimentCard part={part} state={{ active: true }} onCancel={onCancel} />,
  );
  expect(screen.getByRole("status").textContent).toBe("Validating");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledWith(part.toolCallId);

  view.rerender(
    <ExperimentCard
      part={part}
      state={{ active: false }}
      onCancel={onCancel}
    />,
  );
  expect(card.getAttribute("aria-busy")).toBe("false");
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
});

it("opens only the matching record on explicit request, preferring the tool result to stale progress", () => {
  const reveal = vi.fn();
  const record: ExperimentRecord = {
    id: "experiment",
    name: "Population",
    createdAt: 0,
    scenarioId: "scenario",
    scenarioName: "Scenario",
    runCount: 8,
    seed: 1,
    dt: 1,
    maxTime: 10,
    status: "complete",
    error: null,
    metricSpecs: [],
    computeBackend: "cpu",
    computeBackendFallbackReason: null,
    startedAt: 0,
    finishedAt: 1,
    progress: null,
    metricFrames: [],
    latestMetricFramesById: {},
    parameterAxes: [],
    sweep: null,
    sweepBatches: [],
    scenarioParameterValues: {},
    constraints: [],
    constraintPolicy: null,
    scenario: null,
  };
  const card = (
    <ExperimentCard
      part={{ ...part, state: "output-available", output: result }}
      state={{
        active: true,
        result: { ...result, experimentId: "stale", status: "error" },
      }}
      onSelectToolTarget={reveal}
    />
  );
  const view = render(card);
  act(() => records.set([record]));
  expect(screen.getByRole("status").textContent).toBe("Finished");
  expect(reveal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /View experiment/u }));
  expect(reveal).toHaveBeenCalledExactlyOnceWith({
    kind: "simulateView",
    mode: "experiments",
    itemId: "experiment",
  });
  act(() => records.set([]));
  view.rerender(card);
  expect(screen.queryByRole("button", { name: /View experiment/u })).toBeNull();
  expect(screen.getByText("12")).toBeTruthy();
});
