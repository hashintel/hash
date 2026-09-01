// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  EditorContext,
  initialEditorState,
} from "../../../react/state/editor-context";
import { SimulationCreationDrawer } from "./simulation-creation-drawer";

import type {
  EditorContextValue,
  SimulateDrawerState,
} from "../../../react/state/editor-context";

vi.mock("./panels/SimulateView/experiments/create-experiment-drawer", () => ({
  CreateExperimentDrawer: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      experiment
    </button>
  ),
}));
vi.mock("./panels/SimulateView/metrics/create-metric-drawer", () => ({
  CreateMetricDrawer: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      metric
    </button>
  ),
}));
vi.mock(
  "./panels/SimulateView/optimizations/create-optimization-drawer",
  () => ({
    CreateOptimizationDrawer: ({ onClose }: { onClose: () => void }) => (
      <button type="button" onClick={onClose}>
        optimization
      </button>
    ),
  }),
);
vi.mock("./panels/SimulateView/scenarios/create-scenario-drawer", () => ({
  CreateScenarioDrawer: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      scenario
    </button>
  ),
}));

const drawerCases = [
  ["create-experiment", "experiment"],
  ["create-metric", "metric"],
  ["create-optimization", "optimization"],
  ["create-scenario", "scenario"],
] as const satisfies readonly [SimulateDrawerState["type"], string][];

describe("SimulationCreationDrawer", () => {
  it.each(drawerCases)(
    "renders and closes %s from app state",
    (type, label) => {
      const setSimulateDrawer = vi.fn();
      const value = {
        ...initialEditorState,
        simulateDrawer: { type },
        setSimulateDrawer,
      } as unknown as EditorContextValue;

      render(
        <EditorContext value={value}>
          <SimulationCreationDrawer />
        </EditorContext>,
      );

      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(setSimulateDrawer).toHaveBeenCalledOnce();
      expect(setSimulateDrawer).toHaveBeenCalledWith({ type: "closed" });
    },
  );
});
