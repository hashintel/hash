/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../../react/optimization-context";
import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  fakeStudyInput,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
} from "../optimizations/optimizations-story-fixtures";
import {
  frameHeader,
  frameLayoutSignature,
  scrollFrameBody,
} from "../shared/drawer-frame-test-helpers";
import { describeExperiment } from "./experiment-results";
import {
  makeExperiment,
  makeParameterSweepExperiment,
  sirSdcpnContextValue,
} from "./experiments-story-fixtures";
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
  const Tooltip = ({ children }: { children: ReactNode }) => <>{children}</>;
  type FlatItem = {
    id?: string;
    text?: ReactNode;
    onClick?: (id: string) => void;
  };
  type MenuEntry = FlatItem & { items?: MenuEntry[] };
  const flatten = (entries: MenuEntry[]): FlatItem[] =>
    entries.flatMap((entry) => (entry.items ? flatten(entry.items) : [entry]));
  // The Ark menu positions itself with a ResizeObserver jsdom lacks; this one
  // lists the items as buttons.
  const Menu = ({
    items,
    trigger,
  }: {
    items: MenuEntry[];
    trigger: ReactNode;
  }) => (
    <>
      {trigger}
      <div role="menu">
        {flatten(items).map((item, index) => (
          <button
            key={item.id ?? index}
            type="button"
            role="menuitem"
            onClick={() => item.onClick?.(item.id ?? "")}
          >
            {item.text}
          </button>
        ))}
      </div>
    </>
  );
  // The Ark popover positions itself against a trigger jsdom cannot lay out;
  // this one renders its panel in place.
  const Popover = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Container: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
      ),
      Header: ({ title }: { title: ReactNode }) => <div>{title}</div>,
      Footer: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
    },
  );
  return { ...actual, Drawer, Menu, Popover, Tooltip };
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

/** The sweep's drawer with a study started from it, driving or settled. */
const renderDrawerWithStudy = (
  experiment: ExperimentRecord,
  status: "running" | "cancelled",
) => {
  const study = {
    ...makeOptimizationRecord({ input: fakeStudyInput, status }),
    origin: { kind: "sweep" as const, experimentId: experiment.id },
    completedTrials: 3,
    prunedTrials: 1,
  };
  return render(
    <WithInBrowserOptimizer>
      <PetrinautOptimizationContext value={connectedOptimizer}>
        <SDCPNContext value={sirSdcpnContextValue}>
          <OptimizationsContext
            value={makeOptimizationsContextValue(study, {
              selectedOptimization: null,
              selectedOptimizationId: null,
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
};

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
      screen.getByRole("dialog", { name: describeExperiment(sweep) }),
    ).toBeTruthy();
  });

  it("condenses the header once the body scrolls, with nothing else involved", () => {
    renderDrawer(sweep);

    scrollFrameBody(80);
    expect(frameHeader().dataset.condensed).toBe("true");
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
    fireEvent.click(screen.getAllByRole("menuitem", { name: "Median" })[0]!);

    expect(screen.getAllByText(/^median over runs/u).length).toBeGreaterThan(0);
    expect(frameLayoutSignature(view.container)).toEqual(before);
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
});
