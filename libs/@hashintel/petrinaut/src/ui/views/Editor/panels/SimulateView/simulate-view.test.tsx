/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { FakeEditorProvider } from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();

  return {
    ...actual,
    SegmentedControl: ({
      items,
    }: {
      items: readonly { value: string; label?: string; tooltip?: string }[];
    }) => (
      <div>
        {items.map((item) => (
          <span key={item.value}>{item.tooltip ?? item.label}</span>
        ))}
      </div>
    ),
  };
});

vi.mock("./experiments/experiments-view", () => ({
  ExperimentsView: () => <div>Experiments view</div>,
}));
vi.mock("./metrics/metrics-view", () => ({
  MetricsView: () => <div>Metrics view</div>,
}));
vi.mock("./optimizations/optimizations-view", () => ({
  OptimizationsView: () => <div>Optimizations view</div>,
}));
vi.mock("./scenarios/scenarios-view", () => ({
  ScenariosView: () => <div>Scenarios view</div>,
}));

const capability: PetrinautOptimization = {
  createOptimizationRun: () => Promise.resolve({ runId: "run-test" }),
  async *attachOptimizationRun() {
    yield { type: "started", requestedTrials: 1, seq: 1 };
  },
  cancelOptimizationRun: () => Promise.resolve(),
};

afterEach(cleanup);

describe("SimulateView optimization capability", () => {
  it("hides Optimizations without a host capability", () => {
    render(
      <FakeEditorProvider>
        <SimulateView />
      </FakeEditorProvider>,
    );

    expect(screen.queryByText("Optimizations")).toBeNull();
    expect(screen.getByText("Experiments")).toBeTruthy();
    expect(screen.getByText("Scenarios")).toBeTruthy();
  });

  it("shows Optimizations with a host capability", () => {
    render(
      <PetrinautOptimizationContext value={capability}>
        <FakeEditorProvider>
          <SimulateView />
        </FakeEditorProvider>
      </PetrinautOptimizationContext>,
    );

    expect(screen.getByText("Optimizations")).toBeTruthy();
  });
});
