/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeEditorProvider } from "./experiments/experiments-story-fixtures";
import { SimulateView, SimulateViewTabs } from "./simulate-view";

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
vi.mock("./scenarios/scenarios-view", () => ({
  ScenariosView: () => <div>Scenarios view</div>,
}));

afterEach(cleanup);

describe("SimulateView tabs", () => {
  it("are Experiments and Scenarios", () => {
    const { container } = render(
      <FakeEditorProvider>
        <SimulateViewTabs />
      </FakeEditorProvider>,
    );
    expect(
      [...container.querySelectorAll("span")].map((tab) => tab.textContent),
    ).toEqual(["Experiments", "Scenarios"]);
  });

  it("show the experiments in the Metrics mode, which has no tab", () => {
    render(
      <FakeEditorProvider initialSimulateViewMode="metrics">
        <SimulateView />
      </FakeEditorProvider>,
    );
    expect(screen.getByText("Experiments view")).toBeTruthy();
  });
});
