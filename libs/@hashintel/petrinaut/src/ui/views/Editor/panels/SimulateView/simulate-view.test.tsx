/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { FakeEditorProvider } from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";

vi.mock("../../../../components/segment-group", () => ({
  SegmentGroup: ({
    options,
  }: {
    options: readonly { value: string; label: string }[];
  }) => (
    <div>
      {options.map((option) => (
        <span key={option.value}>{option.label}</span>
      ))}
    </div>
  ),
}));

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
  async *optimize() {
    yield { type: "started", requestedTrials: 1 };
  },
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
