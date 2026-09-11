/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import {
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { frameLayoutSignature } from "../shared/drawer-frame.test-helpers";
import {
  makeExperiment,
  makeParameterSweepExperiment,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";
import {
  fakeStudyInput,
  fakeStudyTrials,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
} from "./study-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { SweepOptimizer } from "./sweep-optimizer";
import type { PetrinautConnectedOptimization } from "@hashintel/petrinaut-core/optimization";
import type { ReactNode } from "react";

/** The optimizer the drawer's Parameters card reads; idle unless a test sets it. */
const optimizer = vi.hoisted<{ current: SweepOptimizer | null }>(() => ({
  current: null,
}));

const idleOptimizer: SweepOptimizer = {
  available: false,
  studies: [],
  study: null,
  driving: null,
  start: () => Promise.resolve(),
  stop: () => {},
  discard: () => {},
};

// A test that exercises the control alone sets a fake; otherwise the real
// hook reads the host's optimizer through its contexts.
vi.mock("./sweep-optimizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sweep-optimizer")>();
  return {
    ...actual,
    useSweepOptimizer: (experiment: ExperimentRecord) =>
      optimizer.current ?? actual.useSweepOptimizer(experiment),
  };
});

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const { Drawer } = await import("../shared/ds-drawer-stub");
  const stubs = await import("../shared/ds-control-stubs");
  return { ...actual, ...stubs, Drawer };
});

// The contour surface draws on a canvas jsdom cannot host; the card around
// it is real so its box counts.
vi.mock("./sweep-surface", async () => {
  const chartCard = await vi.importActual<
    typeof import("../shared/chart-card")
  >("../shared/chart-card");
  return {
    SweepSurface: () => (
      <chartCard.ChartCard
        title="Surface"
        bodyHeight={280}
        footer={<span>X · Y</span>}
        footerHeight={24}
      >
        <div data-testid="sweep-surface" />
      </chartCard.ChartCard>
    ),
  };
});

// uPlot cannot mount in jsdom; the strip's row and fold around the chart are
// real, and so is the history the row describes. The axis edge and the
// dividers the chart would draw sit on the stub as data attributes.
vi.mock("../shared/objective-history-chart", () => ({
  ObjectiveHistoryChart: ({
    plotHeight,
    xMax,
    dividers,
    emptyLabel,
  }: {
    plotHeight: number;
    xMax: number | undefined;
    dividers: readonly number[];
    emptyLabel: string;
  }) => (
    <div
      data-testid="objective-history"
      style={{ height: plotHeight }}
      data-x-max={xMax}
      data-dividers={dividers.join(" ")}
      data-empty-label={emptyLabel}
    />
  ),
}));

// uPlot cannot mount in jsdom; the menu and the subtitle are real.
vi.mock("./experiment-metric-timeline", () =>
  import("../shared/metric-timeline-test-stubs").then((stubs) =>
    stubs.mockExperimentMetricTimelineModule(),
  ),
);

// The navigator's Ark sliders measure themselves with a ResizeObserver jsdom
// lacks; nothing here depends on a measurement.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  optimizer.current = null;
});

const drawerElement = (experiment: ExperimentRecord) => (
  <ViewExperimentDrawer open onClose={() => {}} experiment={experiment} />
);

const renderDrawer = (experiment: ExperimentRecord) =>
  render(drawerElement(experiment));

const sweep = makeParameterSweepExperiment();

/** A connected optimizer the fake optimizations context never connects. */
const connectedOptimizer: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: () => {
    throw new Error("The test's optimizer is never connected");
  },
};

const WithInBrowserOptimizer = ({ children }: { children: ReactNode }) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...value, enableInBrowserOptimization: true }}
    >
      {children}
    </UserSettingsContext>
  );
};

/** A study started from the sweep, driving or settled: four steps, one of them pruned. */
const sweepStudy = (
  experiment: ExperimentRecord,
  status: "running" | "cancelled",
  overrides: Partial<OptimizationRecord> = {},
): OptimizationRecord => ({
  ...makeOptimizationRecord({
    input: fakeStudyInput,
    status,
    trials: fakeStudyTrials.trials.slice(0, 4),
    best: { trial: 2, parameters: {}, objective: 650.5 },
  }),
  origin: { kind: "sweep" as const, experimentId: experiment.id },
  completedTrials: 3,
  prunedTrials: 1,
  ...overrides,
});

/** The sweep's drawer over the host's studies, in the order the provider lists them. */
const renderDrawerWithStudies = (
  experiment: ExperimentRecord,
  [first, ...rest]: readonly [OptimizationRecord, ...OptimizationRecord[]],
  overrides: Partial<OptimizationsContextValue> = {},
) =>
  render(
    <WithInBrowserOptimizer>
      <PetrinautOptimizationContext value={connectedOptimizer}>
        <SDCPNContext value={sirSdcpnContextValue}>
          <OptimizationsContext
            value={makeOptimizationsContextValue(first, {
              optimizations: [first, ...rest],
              selectedOptimization: null,
              selectedOptimizationId: null,
              ...overrides,
            })}
          >
            <ViewExperimentDrawer
              open
              onClose={() => {}}
              experiment={experiment}
            />
          </OptimizationsContext>
        </SDCPNContext>
      </PetrinautOptimizationContext>
    </WithInBrowserOptimizer>,
  );

/** The sweep's drawer with a study started from it, driving or settled. */
const renderDrawerWithStudy = (
  experiment: ExperimentRecord,
  status: "running" | "cancelled",
) => renderDrawerWithStudies(experiment, [sweepStudy(experiment, status)]);

/** The sweep in each state a drawer can show it. */
const sweepIn = (status: ExperimentRecord["status"]): ExperimentRecord => ({
  ...sweep,
  status,
  finishedAt: status === "running" ? null : Date.now(),
  error: status === "error" ? "worker crashed" : null,
  progress:
    status === "running"
      ? sweep.progress
      : { ...sweep.progress!, activeRuns: 0, allFinished: true },
});

describe("ViewExperimentDrawer in the frame", () => {
  it("titles the drawer in one line and puts the stats and the badge in the header", () => {
    renderDrawer(sweep);

    expect(
      screen.getByText(/^SIR transmission sweep · Seasonal Flu · 100 runs$/u),
    ).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    // A sweep's strip carries its selection's sampling, not a run budget.
    expect(screen.queryByText("Runs")).toBeNull();
    expect(
      screen
        .getByText("Selection")
        .nextElementSibling?.querySelector("[data-frame-stat-value]")
        ?.textContent,
    ).toMatch(/^\d+ \/ 100 runs$/u);
    expect(screen.queryByText("Elapsed")).toBeNull();
    expect(screen.getByText("CPU")).toBeTruthy();
  });

  it("names the dialog after its one-line title", () => {
    renderDrawer(sweep);

    expect(
      screen.getByRole("dialog", {
        name: "SIR transmission sweep · Seasonal Flu · 100 runs",
      }),
    ).toBeTruthy();
  });

  it("keeps the header, the note row and every card at one height across running, complete, cancelled and error", () => {
    const signatures = (
      ["running", "complete", "cancelled", "error"] as const
    ).map((status) => {
      const view = renderDrawer(sweepIn(status));
      const signature = frameLayoutSignature(view.container);
      view.unmount();
      return signature;
    });

    expect(signatures[0]!.header).toBe("false");
    expect(signatures[0]!.note).toBe("20px");
    expect(signatures[0]!.cards.length).toBeGreaterThan(1);
    for (const signature of signatures.slice(1)) {
      expect(signature).toEqual(signatures[0]);
    }
  });

  it("shows the error in the reserved note row without adding a row", () => {
    renderDrawer(sweepIn("error"));

    const note = document.querySelector<HTMLElement>("[data-frame-note]")!;
    expect(note.textContent).toBe("worker crashed");
    expect(note.dataset.tone).toBe("error");
    expect(note.style.height).toBe("20px");
  });

  it("leaves a metric card's height alone when its aggregation changes", () => {
    const view = renderDrawer(sweep);
    const before = frameLayoutSignature(view.container);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Chart options" })[0]!,
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Runs mode" })).getByRole(
        "button",
        { name: "Aggregate" },
      ),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Runs" }), {
      target: { value: "median" },
    });

    expect(screen.getAllByText(/^median over runs/u).length).toBeGreaterThan(0);
    expect(frameLayoutSignature(view.container)).toEqual(before);
  });

  it("enlarges one metric card to the full row at twice the height and leaves the others alone", () => {
    const view = renderDrawer(sweep);
    const before = frameLayoutSignature(view.container);
    const metricCards = before.cards.filter(([, height]) => height === "220px");
    expect(metricCards.length).toBeGreaterThan(0);
    expect(before.cards.length).toBeGreaterThan(metricCards.length);

    const enlarge = screen.getAllByRole("button", { name: "Enlarge" })[0]!;
    expect(enlarge.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(enlarge);

    // Two 307px rows and the 16px gap between them, less the card's chrome.
    const after = frameLayoutSignature(view.container);
    const [enlarged, ...rest] = after.cards.filter(
      ([title]) => title === metricCards[0]![0],
    );
    expect(enlarged![1]).toBe("543px");
    expect(rest).toEqual([]);
    expect(
      screen.getAllByTestId("metric-timeline")[0]!.dataset.plotHeight,
    ).toBe("543");
    expect(
      screen.getByRole("button", { name: "Shrink", pressed: true }),
    ).toBeTruthy();
    expect(after.cards.filter(([title]) => title !== enlarged![0])).toEqual(
      before.cards.filter(([title]) => title !== enlarged![0]),
    );
    expect(after.gridRows).toEqual(before.gridRows);

    fireEvent.click(screen.getByRole("button", { name: "Shrink" }));

    expect(frameLayoutSignature(view.container)).toEqual(before);
    expect(screen.queryByRole("button", { name: "Shrink" })).toBeNull();
  });

  it("reads Optimizing from the study driving the sweep, with Stop on the Parameters card and Cancel in the footer", () => {
    renderDrawerWithStudy({ ...sweep, status: "idle" }, "running");

    expect(screen.getByText("Optimizing")).toBeTruthy();
    expect(screen.queryByText("Idle")).toBeNull();
    // The ds Button seats a zero-width space before its icon's label.
    expect(
      screen.getByRole("button", { name: /Stop$/u }).dataset.sweepOptimizing,
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Optimize$/u })).toBeNull();
    expect(screen.getByRole("button", { name: /Cancel$/u })).toBeTruthy();
    expect(screen.getByText(/^Following step 5 of 30/u)).toBeTruthy();
  });

  it("offers Optimize again once the study settles and keeps its outcome on the status line", () => {
    renderDrawerWithStudy({ ...sweep, status: "idle" }, "cancelled");

    expect(screen.getByText("Idle")).toBeTruthy();
    expect(document.querySelector("[data-sweep-optimizing]")).toBeNull();
    expect(screen.getByRole("button", { name: /Optimize$/u })).toBeTruthy();
    expect(screen.getByText(/^Cancelled after 4 of 30 steps/u)).toBeTruthy();
  });

  it("shows no objective strip before any study", () => {
    renderDrawer(sweep);

    expect(document.querySelector("[data-sweep-objective]")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Objective by step/u }),
    ).toBeNull();
  });

  it("reads the strip's row as 0 steps, without a metric, when the sweep's only study failed before its first step", () => {
    renderDrawerWithStudies({ ...sweep, status: "idle" }, [
      sweepStudy(sweep, "cancelled", {
        status: "error",
        error: "worker crashed",
        trials: [],
        best: null,
        completedTrials: 0,
        prunedTrials: 0,
      }),
    ]);

    const row = screen.getByRole("button", { name: /^Objective by step/u });
    expect(row.textContent).toMatch(/step0 steps$/u);
    // Nothing is coming: the fold says so instead of waiting for a step.
    expect(screen.getByTestId("objective-history").dataset.emptyLabel).toBe(
      "No steps run",
    );
  });

  it("waits for the first step in the strip's fold while the driving study has drawn none yet", () => {
    renderDrawerWithStudies({ ...sweep, status: "idle" }, [
      sweepStudy(sweep, "running", {
        trials: [],
        best: null,
        completedTrials: 0,
        prunedTrials: 0,
      }),
    ]);

    expect(screen.getByTestId("objective-history").dataset.emptyLabel).toBe(
      "Waiting for the first step",
    );
  });

  it("draws the study's objective under the sliders while it drives the sweep and once it settles, at one layout", () => {
    const signatures = (["running", "cancelled"] as const).map((status) => {
      const view = renderDrawerWithStudy({ ...sweep, status: "idle" }, status);
      const row = screen.getByRole("button", { name: /^Objective by step/u });
      expect(row.textContent).toMatch(/ · 4 steps · best 650\.500$/u);
      expect(row.getAttribute("aria-expanded")).toBe("true");
      expect(document.querySelector("[data-sweep-objective]")).toBeTruthy();
      expect(screen.getByTestId("objective-history").style.height).toBe(
        "120px",
      );
      // The dot is there either way; it only breathes while driving.
      expect(
        row.querySelector("[data-driving]")?.getAttribute("data-driving"),
      ).toBe(String(status === "running"));
      const signature = frameLayoutSignature(view.container);
      view.unmount();
      return signature;
    });

    expect(signatures[1]).toEqual(signatures[0]);
  });

  it("folds the objective chart away from its row and brings it back, the chart staying mounted", () => {
    renderDrawerWithStudy({ ...sweep, status: "idle" }, "cancelled");
    const row = screen.getByRole("button", { name: /^Objective by step/u });
    const clip = document.querySelector<HTMLElement>("[data-sweep-objective]")!;
    expect(row.getAttribute("aria-controls")).toBe(clip.id);
    expect(clip.hasAttribute("inert")).toBe(false);

    fireEvent.click(row);

    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(clip.hasAttribute("inert")).toBe(true);
    expect(screen.getByTestId("objective-history")).toBeTruthy();

    fireEvent.click(row);

    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(clip.hasAttribute("inert")).toBe(false);
  });

  it("shows a plain experiment's metric cards alone, with no parameters and no surface", () => {
    renderDrawer(
      makeExperiment(1, {
        metricSpecs: sweep.metricSpecs,
        metricFrames: sweep.metricFrames,
      }),
    );

    expect(screen.queryByText("Parameters")).toBeNull();
    expect(screen.queryByTestId("sweep-surface")).toBeNull();
    expect(screen.queryByText("Selection")).toBeNull();
    expect(screen.getByText("Runs")).toBeTruthy();
    expect(screen.getByText("Elapsed")).toBeTruthy();
    expect(screen.getAllByTestId("metric-timeline").length).toBe(
      sweep.metricSpecs.length,
    );
  });
});

describe("the Optimize control", () => {
  /** A study driving the sweep, three steps landed and one pruned. */
  const drivingStudy = {
    id: "study",
    status: "running",
    requestedTrials: 30,
    completedTrials: 3,
    prunedTrials: 1,
    failedTrials: 0,
  } as NonNullable<SweepOptimizer["study"]>;

  const openPrompt = () => {
    fireEvent.click(screen.getByRole("button", { name: /Optimize$/u }));
    return screen.getByRole("button", { name: /Start$/u });
  };

  it("starts a study with the chosen metric, direction and steps, then closes the prompt", async () => {
    const start = vi.fn<SweepOptimizer["start"]>(() => Promise.resolve());
    optimizer.current = { ...idleOptimizer, available: true, start };
    renderDrawer(sweep);

    fireEvent.click(openPrompt());

    expect(start).toHaveBeenCalledWith({
      metricId: "infected",
      direction: "maximize",
      steps: 30,
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Start$/u })).toBeNull();
    });
  });

  it("seeds the prompt from the experiment the drawer swapped to", () => {
    const start = vi.fn<SweepOptimizer["start"]>(() => Promise.resolve());
    optimizer.current = { ...idleOptimizer, available: true, start };
    const view = renderDrawer(sweep);
    openPrompt();

    // The drawer swaps records in place; the open prompt, its metric and
    // its steps belong to the previous experiment.
    const recovered = {
      ...sweep.metricSpecs[0]!,
      id: "recovered",
      label: "Recovered",
    };
    view.rerender(
      drawerElement({ ...sweep, id: "other", metricSpecs: [recovered] }),
    );

    expect(screen.queryByRole("button", { name: /Start$/u })).toBeNull();
    fireEvent.click(openPrompt());
    expect(start).toHaveBeenCalledWith({
      metricId: "recovered",
      direction: "maximize",
      steps: 30,
    });
  });

  it("shows a refused start's reason in the prompt", async () => {
    optimizer.current = {
      ...idleOptimizer,
      available: true,
      start: () => Promise.reject(new Error("Pick a metric to optimize")),
    };
    renderDrawer(sweep);

    fireEvent.click(openPrompt());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Pick a metric to optimize",
    );
    expect(screen.getByRole("button", { name: /Start$/u })).toBeTruthy();
  });

  it("stops the driving study from the Parameters card", () => {
    const stop = vi.fn();
    optimizer.current = {
      ...idleOptimizer,
      available: true,
      study: drivingStudy,
      driving: { step: 5, total: 30 },
      stop,
    };
    renderDrawer(sweep);

    expect(screen.queryByRole("button", { name: /Optimize$/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Stop$/u }));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("orders the host's studies by creation, summarises the strip from the later one and stops it", () => {
    const cancelOptimization = vi.fn();
    const experiment = { ...sweep, status: "idle" as const };
    const earlier = sweepStudy(experiment, "cancelled", {
      id: "study-1",
      createdAt: Date.now() - 200_000,
    });
    const later = sweepStudy(experiment, "running", {
      id: "study-2",
      trials: fakeStudyTrials.trials.slice(0, 3),
      completedTrials: 3,
      prunedTrials: 0,
      best: { trial: 1, parameters: {}, objective: 700.25 },
    });
    // The provider prepends, so the later study comes first.
    renderDrawerWithStudies(experiment, [later, earlier], {
      cancelOptimization,
    });

    const row = screen.getByRole("button", { name: /^Objective by step/u });
    expect(row.textContent).toMatch(
      / · 7 steps in 2 optimizations · best 700\.250$/u,
    );
    // The divider sits at the later study's first step; the axis reaches its
    // requested steps past the earlier study's four.
    const chart = screen.getByTestId("objective-history");
    expect(chart.dataset.dividers).toBe("5");
    expect(chart.dataset.xMax).toBe(String(4 + 30));
    expect(screen.getByText(/^Following step 4 of 30/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Stop$/u }));

    expect(cancelOptimization).toHaveBeenCalledTimes(1);
    expect(cancelOptimization).toHaveBeenCalledWith("study-2");
  });
});
