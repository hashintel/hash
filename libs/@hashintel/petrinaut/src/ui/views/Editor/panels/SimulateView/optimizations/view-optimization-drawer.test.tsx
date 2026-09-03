/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "../../../../../../react/optimizations/context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  makeOptimizationInput,
  makeOptimizationRecord,
  makeSelectionStream,
  makeTrials,
  navigationAtTrial,
  optimizedBindingSets,
} from "./optimizations-story-fixtures";
import { ViewOptimizationDrawer } from "./view-optimization-drawer";

import type { ReactNode } from "react";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: ({ title }: { title: ReactNode }) => <header>{title}</header>,
      Body: ({ children }: { children: ReactNode }) => <main>{children}</main>,
      Footer: ({ actions }: { actions: ReactNode }) => (
        <footer>{actions}</footer>
      ),
    },
  );
  const Slider = ({
    value,
    onChange,
  }: {
    value: number;
    onChange?: (value: number) => void;
  }) => (
    <input
      type="range"
      value={value}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );
  const Tooltip = ({ children }: { children: ReactNode }) => <>{children}</>;

  return { ...actual, Drawer, Slider, Tooltip };
});

vi.mock("./optimization-surface", () => ({
  OptimizationSurface: () => <div data-testid="remote-surface" />,
  NavigatedOptimizationSurface: ({
    navigation,
  }: {
    navigation: { positions: Record<string, number> };
  }) => (
    <div
      data-testid="navigated-surface"
      data-positions={JSON.stringify(navigation.positions)}
    />
  ),
}));

vi.mock("../shared/metric-tiles", () => ({
  MetricTiles: ({
    tiles,
    contentEpoch,
  }: {
    tiles: readonly { label: string; frames: readonly unknown[] }[];
    contentEpoch: string;
  }) => (
    <div data-testid="metric-tiles" data-epoch={contentEpoch}>
      {tiles.map((tile) => (
        <span key={tile.label}>
          {tile.label}: {tile.frames.length} frames
        </span>
      ))}
    </div>
  ),
}));

afterEach(cleanup);

const SurfaceSetting = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...value, enableOptimizationSurface: enabled }}
    >
      {children}
    </UserSettingsContext>
  );
};

const renderDrawer = (
  optimization: OptimizationRecord,
  options: {
    enableOptimizationSurface?: boolean;
    setOptimizationNavigation?: OptimizationsContextValue["setOptimizationNavigation"];
  } = {},
) => {
  const value: OptimizationsContextValue = {
    optimizations: [optimization],
    selectedOptimizationId: optimization.id,
    selectedOptimization: optimization,
    setSelectedOptimizationId: () => {},
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: () => {},
    removeOptimization: () => {},
    setOptimizationNavigation: options.setOptimizationNavigation ?? (() => {}),
    retryOptimization: () => Promise.resolve(null),
  };
  return render(
    <OptimizationsContext value={value}>
      <SurfaceSetting enabled={options.enableOptimizationSurface ?? false}>
        <ViewOptimizationDrawer
          open
          onClose={() => {}}
          optimization={optimization}
        />
      </SurfaceSetting>
    </OptimizationsContext>,
  );
};

const input = makeOptimizationInput(optimizedBindingSets.base);
const { trials, best } = makeTrials(input, 5);

describe("ViewOptimizationDrawer for a remote study", () => {
  const remote = makeOptimizationRecord({
    input,
    trials,
    best,
    status: "complete",
  });

  it("shows results without navigation, backend or metrics", () => {
    renderDrawer(remote);

    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByText("Metrics")).toBeNull();
    expect(screen.queryByText("CPU")).toBeNull();
    expect(screen.queryByTestId("remote-surface")).toBeNull();
  });

  it("shows the self-navigating surface behind the setting", () => {
    renderDrawer(remote, { enableOptimizationSurface: true });

    expect(screen.getByTestId("remote-surface")).toBeTruthy();
    expect(screen.queryByTestId("navigated-surface")).toBeNull();
  });
});

describe("ViewOptimizationDrawer for a connected study", () => {
  const navigation = navigationAtTrial(input, trials[2]!, true);
  const selection = makeSelectionStream({
    input,
    navigation,
    followedTrial: 2,
    runsCompleted: 1,
    computing: true,
    frameCount: 4,
  });
  const connected = makeOptimizationRecord({
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
    status: "running",
    navigation,
    selection,
  });

  it("adds the backend badge, the navigator, the surface and the objective chart", () => {
    renderDrawer(connected);

    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(screen.getByText("Following step 3")).toBeTruthy();
    expect(screen.getByLabelText("Follow steps")).toBeTruthy();
    // Local compute is inherent to a connected study: no setting needed.
    expect(screen.getByTestId("navigated-surface").dataset.positions).toBe(
      JSON.stringify(navigation.positions),
    );
    expect(screen.getByText("Metrics")).toBeTruthy();
    const tiles = screen.getByTestId("metric-tiles");
    expect(tiles.dataset.epoch).toBe("trial:2");
    expect(tiles.textContent).toContain(
      `${input.model.definition.metrics![0]!.name}: 5 frames`,
    );
  });

  it("says why the navigated point could not compute and empties the chart", () => {
    const stopped = { ...navigation, followTrials: false };
    renderDrawer(
      makeOptimizationRecord({
        input,
        trials: trials.slice(0, 3),
        best: trials[2]!.best,
        status: "complete",
        navigation: stopped,
        selection: makeSelectionStream({
          input,
          navigation: stopped,
          runsCompleted: 0,
          error: "metric__profit: Unexpected token ')'",
        }),
      }),
    );

    const status = screen.getByText(
      "Could not compute: metric__profit: Unexpected token ')'",
    );
    expect(status.dataset.tone).toBe("error");
    expect(screen.getByTestId("metric-tiles").textContent).toContain(
      `${input.model.definition.metrics![0]!.name}: 0 frames`,
    );
  });

  it("moves the navigation through the provider when a slider changes", () => {
    const setOptimizationNavigation = vi.fn();
    renderDrawer(connected, { setOptimizationNavigation });

    const [productionRate] = screen.getAllByRole("slider");
    fireEvent.change(productionRate!, { target: { value: "7" } });

    expect(setOptimizationNavigation).toHaveBeenCalledWith(connected.id, {
      positions: { ...navigation.positions, production_rate: 7 },
      followTrials: false,
    });
  });

  it("badges the backend the trials ran on and notes why the requested one fell back", () => {
    // The provider records the backend the first trial ran on alongside the
    // reason, so a study that asked for the GPU and fell back reads `cpu`.
    renderDrawer({
      ...connected,
      computeBackend: "cpu",
      computeBackendFallbackReason: "the GPU cannot compute expression metrics",
    });

    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.queryByText("GPU")).toBeNull();
    expect(
      screen.getByText(
        "Ran on the CPU: the GPU cannot compute expression metrics",
      ),
    ).toBeTruthy();
  });

  it("badges a study that ran on the GPU", () => {
    renderDrawer({ ...connected, computeBackend: "webgpu" });

    expect(screen.getByText("GPU")).toBeTruthy();
    expect(screen.queryByText("CPU")).toBeNull();
  });

  it("hides the follow switch once the study is over", () => {
    renderDrawer({
      ...connected,
      status: "complete",
      selection: makeSelectionStream({
        input,
        navigation,
        runsCompleted: 100,
      }),
    });

    expect(screen.queryByLabelText("Follow steps")).toBeNull();
    expect(screen.getByText("100 runs")).toBeTruthy();
  });
});
