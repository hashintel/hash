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
      Header: ({
        title,
        description,
      }: {
        title: ReactNode;
        description?: ReactNode;
      }) => (
        <header>
          {title}
          <p>{description}</p>
        </header>
      ),
      Body: ({ children }: { children: ReactNode }) => <main>{children}</main>,
      Footer: ({ actions }: { actions: ReactNode }) => (
        <footer>{actions}</footer>
      ),
    },
  );
  const Slider = ({
    value,
    disabled,
    onChange,
  }: {
    value: number;
    disabled?: boolean;
    onChange?: (value: number) => void;
  }) => (
    <input
      type="range"
      value={value}
      disabled={disabled}
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
    onNavigationChange,
  }: {
    navigation: { positions: Record<string, number> };
    onNavigationChange: (patch: {
      positions: Record<string, number>;
      followTrials: boolean;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="navigated-surface"
      data-positions={JSON.stringify(navigation.positions)}
      onClick={() =>
        onNavigationChange({
          positions: { ...navigation.positions, production_rate: 3 },
          followTrials: false,
        })
      }
    />
  ),
}));

vi.mock("../experiments/experiment-metric-timeline", () => ({
  ExperimentMetricTimeline: ({
    frames,
    label,
    contentEpoch,
    onDisplaySizeChange,
  }: {
    frames: readonly unknown[];
    label: string;
    contentEpoch: string;
    onDisplaySizeChange?: () => void;
  }) => (
    <div
      data-testid="metric-timeline"
      data-epoch={contentEpoch}
      data-resizable={onDisplaySizeChange !== undefined}
    >
      {label}: {frames.length} frames
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
    cancelOptimization?: OptimizationsContextValue["cancelOptimization"];
    extendOptimization?: OptimizationsContextValue["extendOptimization"];
  } = {},
) => {
  const value: OptimizationsContextValue = {
    optimizations: [optimization],
    selectedOptimizationId: optimization.id,
    selectedOptimization: optimization,
    setSelectedOptimizationId: () => {},
    createOptimization: () => Promise.resolve(optimization.id),
    cancelOptimization: options.cancelOptimization ?? (() => {}),
    removeOptimization: () => {},
    extendOptimization: options.extendOptimization ?? (() => Promise.resolve()),
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

/** The Best stat prints the objective as the table does. */
const formatObjective = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toPrecision(6);

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
    expect(screen.getByText("Best parameters")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByTestId("metric-timeline")).toBeNull();
    expect(screen.queryByText("CPU")).toBeNull();
    expect(screen.queryByTestId("remote-surface")).toBeNull();
    expect(screen.queryByTitle("Best step")).toBeNull();
  });

  it("names the scenario and the objective under the title", () => {
    renderDrawer(remote);

    const metric = input.model.definition.metrics![0]!;
    const scenario = input.model.definition.scenarios!.find(
      (candidate) => candidate.id === input.scenario.id,
    )!;
    expect(
      screen.getByText(`${scenario.name} · Maximize ${metric.name}`),
    ).toBeTruthy();
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
    const timeline = screen.getByTestId("metric-timeline");
    expect(timeline.dataset.epoch).toBe("trial:2");
    expect(timeline.dataset.resizable).toBe("false");
    expect(timeline.textContent).toContain(
      `${input.model.definition.metrics![0]!.name}: 5 frames`,
    );
  });

  it("summarizes the study in one strip and stars the best step in the table", () => {
    renderDrawer(connected);

    expect(screen.queryByText("Summary")).toBeNull();
    expect(screen.queryByText("Best parameters")).toBeNull();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("3 / 30")).toBeTruthy();
    expect(screen.getByText("Best").nextElementSibling?.textContent).toBe(
      formatObjective(trials[2]!.best!.objective),
    );
    // The table lists the newest step first; the header row is row 1.
    const bestTrial = trials[2]!.best!.trial;
    const rows = trials.slice(0, 3).toReversed();
    const starred = screen.getByTitle("Best step");
    expect(starred.textContent).toBe(String(bestTrial + 1));
    expect(starred.closest("[role='row']")?.getAttribute("aria-rowindex")).toBe(
      String(rows.findIndex((row) => row.trial === bestTrial) + 2),
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
    expect(screen.getByTestId("metric-timeline").textContent).toContain(
      `${input.model.definition.metrics![0]!.name}: 0 frames`,
    );
  });

  it("disables the sliders while following a running study", () => {
    renderDrawer(connected);

    for (const slider of screen.getAllByRole("slider")) {
      expect(slider).toHaveProperty("disabled", true);
    }
    expect(screen.getByLabelText("Follow steps")).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("frees the sliders once the study settles and moves the navigation through the provider", () => {
    const setOptimizationNavigation = vi.fn();
    const settled = {
      ...connected,
      status: "complete" as const,
      selection: makeSelectionStream({ input, navigation, runsCompleted: 100 }),
    };
    renderDrawer(settled, { setOptimizationNavigation });

    const [productionRate] = screen.getAllByRole("slider");
    expect(productionRate).toHaveProperty("disabled", false);
    fireEvent.change(productionRate!, { target: { value: "7" } });

    expect(setOptimizationNavigation).toHaveBeenCalledWith(settled.id, {
      positions: { ...navigation.positions, production_rate: 7 },
      followTrials: false,
    });
  });

  it("frees the sliders when Follow steps is turned off mid-run and commits a surface pick the same way", () => {
    const setOptimizationNavigation = vi.fn();
    const takenOver = {
      ...connected,
      navigation: { ...navigation, followTrials: false },
    };
    renderDrawer(takenOver, { setOptimizationNavigation });

    for (const slider of screen.getAllByRole("slider")) {
      expect(slider).toHaveProperty("disabled", false);
    }
    fireEvent.click(screen.getByTestId("navigated-surface"));

    expect(setOptimizationNavigation).toHaveBeenCalledWith(takenOver.id, {
      positions: { ...navigation.positions, production_rate: 3 },
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

  it("offers Stop while running, then Stopped with a Continue control that asks for more steps", () => {
    const cancelOptimization = vi.fn();
    const extendOptimization = vi.fn(() => Promise.resolve());
    const { unmount } = renderDrawer(connected, { cancelOptimization });

    expect(screen.queryByRole("button", { name: /Cancel/ })).toBeNull();
    expect(screen.getByText("Running")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    expect(cancelOptimization).toHaveBeenCalledWith(connected.id);
    expect(screen.queryByLabelText("Steps to continue with")).toBeNull();
    unmount();

    const stopped = makeOptimizationRecord({
      input,
      trials: trials.slice(0, 3),
      best: trials[2]!.best,
      status: "cancelled",
      navigation: { ...navigation, followTrials: false },
      selection: makeSelectionStream({ input, navigation, runsCompleted: 8 }),
    });
    renderDrawer(stopped, { extendOptimization });

    expect(screen.getByText("Stopped")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull();
    const steps = screen.getByLabelText("Steps to continue with");
    expect(steps).toHaveProperty("value", String(input.study.trials));
    fireEvent.change(steps, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(extendOptimization).toHaveBeenCalledWith(stopped.id, 4);
  });

  it("keeps Cancel and Cancelled for a remote study, which cannot be continued", () => {
    const { unmount } = renderDrawer(
      makeOptimizationRecord({ input, trials, best, status: "running" }),
    );
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeTruthy();
    unmount();

    renderDrawer(
      makeOptimizationRecord({ input, trials, best, status: "cancelled" }),
    );
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
  });

  it("shows the followed step's runs under the steps bar and lists the batches computing", () => {
    renderDrawer({
      ...connected,
      activity: [
        {
          id: "step-3",
          kind: "step",
          label: "Step 3",
          runCount: 1,
          completedRuns: 0,
        },
      ],
    });

    expect(screen.getByText("3 / 30")).toBeTruthy();
    expect(screen.getByText("Step 3 · 1 / 1 runs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /1 computing/ }));
    expect(screen.getByText("Step 3")).toBeTruthy();
    expect(screen.getByText("0 / 1 runs")).toBeTruthy();
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
