/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeEditorProvider } from "./experiments/experiments-story-provider";
import { SimulateView } from "./simulate-view";

vi.mock("./experiments/experiments-view", () => ({
  ExperimentsView: () => <div>Experiments view</div>,
}));
vi.mock("./scenarios/scenarios-view", () => ({
  ScenariosView: () => <div>Scenarios view</div>,
}));

afterEach(cleanup);

describe("SimulateView", () => {
  it("shows the experiments in the Metrics mode, which has no tab", () => {
    render(
      <FakeEditorProvider initialSimulateViewMode="metrics">
        <SimulateView />
      </FakeEditorProvider>,
    );
    expect(screen.getByText("Experiments view")).toBeTruthy();
  });
});
