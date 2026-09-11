/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { cloneElement, use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ConnectedStudyState,
  type OptimizationRecord,
  OptimizationsContext,
  type OptimizationsContextValue,
} from "../../../../../../react/optimizations/context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import {
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  frameLayoutSignature,
} from "../shared/drawer-frame";
import {
  frameHeader,
  scrollFrameBody,
} from "../shared/drawer-frame/frame-test-helpers";
import {
  fakeConstrainedStudyInput,
  fakeConstrainedStudyTrials,
  fakeLongStudyInput,
  fakeLongStudyTrials,
  makeConnectedStudyState,
  makeImportance,
  makeOptimizationInput,
  makeOptimizationRecord,
  makeOptimizationsContextValue,
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
  const { Drawer } = await import("../shared/ds-drawer-stub");
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
  // The Ark tooltip opens on hover; this one keeps its content in a tooltip
  // element in the document body, out of the trigger's text, so the badge's
  // reason can be read.
  const { createPortal } = await import("react-dom");
  const Tooltip = ({
    children,
    content,
  }: {
    children: ReactNode;
    content: ReactNode;
  }) => (
    <>
      {children}
      {createPortal(<span role="tooltip">{content}</span>, document.body)}
    </>
  );
  // The Ark menu positions itself with a ResizeObserver jsdom lacks; this one
  // lists the items as buttons once the trigger is clicked.
  type FlatItem = {
    id?: string;
    text?: ReactNode;
    onClick?: (id: string) => void;
  };
  type MenuEntry = FlatItem & { items?: MenuEntry[] };
  const flatten = (entries: MenuEntry[]): FlatItem[] =>
    entries.flatMap((entry) => (entry.items ? flatten(entry.items) : [entry]));
  const Menu = ({
    items,
    trigger,
  }: {
    items: MenuEntry[];
    trigger: React.ReactElement<{ onClick?: () => void }>;
  }) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        {cloneElement(trigger, { onClick: () => setOpen(true) })}
        {open ? (
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
        ) : null}
      </>
    );
  };

  // The Ark popover positions itself against a trigger jsdom cannot lay out;
  // this one renders its panel in place.
  const Popover = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Container: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
      ),
    },
  );

  return { ...actual, Drawer, Menu, Popover, Slider, Tooltip };
});

vi.mock("./optimization-surface", () => ({
  OptimizationSurface: () => <div data-testid="remote-surface" />,
  NavigatedOptimizationSurface: ({
    connected,
    onNavigationChange,
  }: {
    connected: ConnectedStudyState;
    onNavigationChange: (patch: {
      positions: Record<string, number>;
      followTrials: boolean;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="navigated-surface"
      data-positions={JSON.stringify(connected.navigation.positions)}
      onClick={() =>
        onNavigationChange({
          positions: { ...connected.navigation.positions, production_rate: 3 },
          followTrials: false,
        })
      }
    />
  ),
}));

// uPlot cannot mount in jsdom; the card around the objective history is real.
vi.mock("./study-view/objective-history-chart", () =>
  import("../shared/metric-timeline-test-stubs").then((stubs) =>
    stubs.mockObjectiveHistoryCardModule(),
  ),
);

// The timeline module pulls in uPlot, which jsdom cannot host; the card
// chrome around the chart is real, so the menu and the subtitle are too.
vi.mock("../experiments/experiment-metric-timeline", () =>
  import("../shared/metric-timeline-test-stubs").then((stubs) =>
    stubs.mockExperimentMetricTimelineModule(),
  ),
);

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
  } & Partial<
    Pick<
      OptimizationsContextValue,
      | "setOptimizationNavigation"
      | "cancelOptimization"
      | "extendOptimization"
      | "pauseOptimization"
      | "resumeOptimization"
      | "refineOptimizationBest"
      | "removeOptimization"
    >
  > = {},
) => {
  const { enableOptimizationSurface = false, ...actions } = options;
  return render(
    <OptimizationsContext
      value={makeOptimizationsContextValue(optimization, actions)}
    >
      <SurfaceSetting enabled={enableOptimizationSurface}>
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

  it("shows the summary strip and the results without navigation, backend or metrics", () => {
    renderDrawer(remote);

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("5 / 30")).toBeTruthy();
    expect(
      screen
        .getByText("Best step so far")
        .nextElementSibling?.querySelector("[data-frame-stat-value]")
        ?.textContent,
    ).toBe(formatObjective(best!.objective));
    expect(screen.getByText("Best parameters")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByTestId("metric-timeline")).toBeNull();
    expect(screen.queryByText("CPU")).toBeNull();
    expect(screen.queryByTestId("remote-surface")).toBeNull();
    expect(screen.queryByTitle("Best step")).toBeNull();
  });

  it("names the scenario and the objective in the one-line title", () => {
    renderDrawer(remote);

    const metric = input.model.definition.metrics![0]!;
    const scenario = input.model.definition.scenarios!.find(
      (candidate) => candidate.id === input.scenario.id,
    )!;
    expect(
      screen.getByText(
        `${input.name} · ${scenario.name} · Maximize ${metric.name}`,
      ),
    ).toBeTruthy();
  });

  it("shows the self-navigating surface behind the setting", () => {
    renderDrawer(remote, { enableOptimizationSurface: true });

    expect(screen.getByTestId("remote-surface")).toBeTruthy();
    expect(screen.queryByTestId("navigated-surface")).toBeNull();
  });

  it("lists the latest 200 steps and says how many were left out", () => {
    const long = makeTrials(input, 201);
    renderDrawer(
      makeOptimizationRecord({
        input,
        trials: long.trials,
        best: long.best,
        status: "complete",
      }),
    );

    expect(
      screen.getByText("Showing the latest 200 of 201 received steps."),
    ).toBeTruthy();
    // The header row is row 1; the newest step comes first.
    expect(screen.getAllByRole("row")).toHaveLength(201);
    expect(screen.getAllByRole("row")[1]?.textContent).toContain("201");
  });

  it("keeps Cancel and Cancelled, and offers no continuation", () => {
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
});

describe("ViewOptimizationDrawer for a connected study", () => {
  const navigation = navigationAtTrial(input, trials[2]!, true);
  const following = makeConnectedStudyState(input, {
    navigation,
    selection: makeSelectionStream({
      input,
      navigation,
      followedTrial: 2,
      runsCompleted: 1,
      computing: true,
      frameCount: 4,
    }),
  });
  const connected = makeOptimizationRecord({
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
    status: "running",
    connected: following,
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
    expect(timeline.textContent).toContain("5 frames");
    // The chart sits in a card that says which point it describes, the
    // metric named in the subtitle and the view menu in the card header.
    const card = timeline.closest<HTMLElement>("[data-chart-card]")!;
    expect(card.textContent).toContain("Objective at the step in flight");
    expect(card.textContent).toContain(
      input.model.definition.metrics![0]!.name,
    );
    expect(screen.getByRole("button", { name: "Chart options" })).toBeTruthy();
    // The objective by step sits in its own card, and the header line names
    // the best step so far.
    expect(screen.getByText("Objective by step")).toBeTruthy();
    expect(screen.getByText(/^Step 4 of 30 · best step so far/u)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Open full view/u }),
    ).toBeTruthy();
  });

  it("summarizes the study in one strip and stars the best step in the table", () => {
    renderDrawer(connected);

    expect(screen.queryByText("Best parameters")).toBeNull();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("3 / 30")).toBeTruthy();
    expect(
      screen
        .getByText("Best step so far")
        .nextElementSibling?.querySelector("[data-frame-stat-value]")
        ?.textContent,
    ).toBe(formatObjective(trials[2]!.best!.objective));
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
        connected: makeConnectedStudyState(input, {
          navigation: stopped,
          selection: makeSelectionStream({
            input,
            navigation: stopped,
            runsCompleted: 0,
            error: "metric__profit: Unexpected token ')'",
          }),
          resumable: true,
        }),
      }),
    );

    const status = screen.getByText(
      "Could not compute: metric__profit: Unexpected token ')'",
    );
    expect(status.dataset.tone).toBe("error");
    expect(screen.getByTestId("metric-timeline").textContent).toContain(
      "0 frames",
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
    const settled: OptimizationRecord = {
      ...connected,
      status: "complete",
      connected: {
        ...following,
        resumable: true,
        selection: makeSelectionStream({
          input,
          navigation,
          runsCompleted: 100,
        }),
      },
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
    const takenOver: OptimizationRecord = {
      ...connected,
      connected: {
        ...following,
        navigation: { ...navigation, followTrials: false },
      },
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
      connected: {
        ...following,
        computeBackendFallbackReason:
          "the GPU cannot compute expression metrics",
      },
    });

    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.queryByText("GPU")).toBeNull();
    // The header may draw the badge more than once; every copy carries the reason.
    expect(
      screen.getAllByRole("tooltip", { name: /could not run this net/ }).length,
    ).toBeGreaterThan(0);
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
      connected: makeConnectedStudyState(input, {
        navigation: { ...navigation, followTrials: false },
        selection: makeSelectionStream({ input, navigation, runsCompleted: 8 }),
        resumable: true,
      }),
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

  it("condenses the header once the body scrolls, also after the focused computing chip went idle", () => {
    const view = renderDrawer(connected);

    scrollFrameBody(80);
    expect(frameHeader().style.height).toBe(
      `${FRAME_HEADER_CONDENSED_HEIGHT}px`,
    );
    scrollFrameBody(0);

    // Focus lands on the chip while a batch computes, then the batch ends and
    // the chip is disabled under the focus without a blur.
    const computing = {
      ...connected,
      connected: {
        ...following,
        activity: [
          {
            id: 3,
            kind: "trial" as const,
            trial: 2,
            runCount: 1,
            completedRuns: 0,
          },
        ],
      },
    };
    view.rerender(
      <OptimizationsContext
        value={makeOptimizationsContextValue(computing, {})}
      >
        <SurfaceSetting enabled={false}>
          <ViewOptimizationDrawer
            open
            onClose={() => {}}
            optimization={computing}
          />
        </SurfaceSetting>
      </OptimizationsContext>,
    );
    act(() => screen.getByRole("button", { name: /1 computing/ }).focus());
    view.rerender(
      <OptimizationsContext
        value={makeOptimizationsContextValue(connected, {})}
      >
        <SurfaceSetting enabled={false}>
          <ViewOptimizationDrawer
            open
            onClose={() => {}}
            optimization={connected}
          />
        </SurfaceSetting>
      </OptimizationsContext>,
    );
    scrollFrameBody(80);
    expect(frameHeader().style.height).toBe(
      `${FRAME_HEADER_CONDENSED_HEIGHT}px`,
    );
  });

  it("lists the batches computing from the computing chip", () => {
    renderDrawer({
      ...connected,
      connected: {
        ...following,
        activity: [
          { id: 3, kind: "trial", trial: 2, runCount: 1, completedRuns: 0 },
          {
            id: 4,
            kind: "refine",
            values: { production_rate: 125, selling_price: 42.5 },
            runCount: 8,
            completedRuns: 2,
          },
        ],
      },
    });

    expect(screen.getByText("3 / 30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /2 computing/ }));
    expect(screen.getByText("Step 3")).toBeTruthy();
    expect(screen.getByText("0 / 1 runs")).toBeTruthy();
    expect(
      screen.getByText("Refining production_rate=125, selling_price=42.5000"),
    ).toBeTruthy();
    expect(screen.getByText("2 / 8 runs")).toBeTruthy();
  });

  it("hides the follow switch once the study is over", () => {
    renderDrawer({
      ...connected,
      status: "complete",
      connected: {
        ...following,
        resumable: true,
        selection: makeSelectionStream({
          input,
          navigation,
          runsCompleted: 100,
        }),
      },
    });

    expect(screen.queryByLabelText("Follow steps")).toBeNull();
    expect(screen.getByText("100 runs")).toBeTruthy();
  });
});

describe("ViewOptimizationDrawer for a paused connected study", () => {
  const navigation = navigationAtTrial(input, trials[2]!, true);
  const running = makeOptimizationRecord({
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
    status: "running",
    connected: makeConnectedStudyState(input, {
      navigation,
      selection: makeSelectionStream({
        input,
        navigation,
        followedTrial: 2,
        runsCompleted: 1,
        computing: true,
        frameCount: 4,
      }),
    }),
  });
  const paused = makeOptimizationRecord({
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
    status: "paused",
    connected: makeConnectedStudyState(input, {
      navigation: navigationAtTrial(input, trials[2]!, false),
      selection: null,
      resumable: true,
    }),
  });

  it("offers Pause as the first action while running, beside Stop, and drains through the provider", () => {
    const pauseOptimization = vi.fn();
    const cancelOptimization = vi.fn();
    renderDrawer(running, { pauseOptimization, cancelOptimization });

    fireEvent.click(screen.getByRole("button", { name: /Pause/u }));
    expect(pauseOptimization).toHaveBeenCalledWith(running.id);
    expect(cancelOptimization).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Stop/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resume/u })).toBeNull();
  });

  it("keeps the running layout with every card in the paused tone, a Paused chip and the resume note", () => {
    renderDrawer(paused);

    expect(document.querySelector("[data-paused-chip]")?.textContent).toContain(
      "Paused",
    );
    expect(screen.getByText(/^Paused at 3 of 30 steps/u)).toBeTruthy();
    expect(
      screen.getByText(/Resuming continues the study's history/u),
    ).toBeTruthy();
    const cards = document.querySelectorAll<HTMLElement>("[data-chart-card]");
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect([...cards].every((card) => card.dataset.tone === "paused")).toBe(
      true,
    );
    expect(screen.getByText("Objective at the selected point")).toBeTruthy();
    expect(screen.getByText("Objective by step")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("nothing computed at this point")).toBeTruthy();
    expect(screen.queryByText("Follow steps")).toBeNull();
  });

  it("offers Resume and Run at the best configuration, no Restart, and Remove only in the overflow menu", async () => {
    const resumeOptimization = vi.fn(() => Promise.resolve());
    const refineOptimizationBest = vi.fn();
    const removeOptimization = vi.fn();
    renderDrawer(paused, {
      resumeOptimization,
      refineOptimizationBest,
      removeOptimization,
    });

    fireEvent.click(screen.getByRole("button", { name: /Resume/u }));
    expect(resumeOptimization).toHaveBeenCalledWith(paused.id);
    fireEvent.click(
      screen.getByRole("button", { name: /Run at the best configuration/u }),
    );
    expect(refineOptimizationBest).toHaveBeenCalledWith(paused.id);
    expect(screen.queryByRole("button", { name: /Restart/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /Stop/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove$/u })).toBeNull();
    expect(screen.queryByLabelText("Steps to continue with")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(removeOptimization).toHaveBeenCalledWith(paused.id);
  });

  it("holds Resume until the segment has drained and the study is resumable", () => {
    const draining = makeOptimizationRecord({
      ...paused,
      input,
      status: "paused",
      trials: trials.slice(0, 3),
      best: trials[2]!.best,
      connected: makeConnectedStudyState(input, {
        navigation,
        resumable: false,
        inFlight: [{ trial: 3, parameters: {}, objective: null }],
      }),
    });
    renderDrawer(draining);

    expect(screen.getByText(/1 step finishing/u)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Resume/u }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("ViewOptimizationDrawer for a connected study with constraints", () => {
  const constrainedInput = fakeConstrainedStudyInput;
  const constrainedTrials = fakeConstrainedStudyTrials.trials;
  const navigation = navigationAtTrial(
    constrainedInput,
    constrainedTrials.at(-1)!,
    false,
  );
  const settled = makeOptimizationRecord({
    input: constrainedInput,
    trials: constrainedTrials,
    best: fakeConstrainedStudyTrials.best,
    status: "complete",
    connected: makeConnectedStudyState(constrainedInput, {
      navigation,
      resumable: true,
      selection: makeSelectionStream({
        input: constrainedInput,
        navigation,
        runsCompleted: 100,
      }),
    }),
  });

  it("adds the Constraints card with the steps clear, the latest step's verdict and one bar per state constraint", () => {
    renderDrawer(settled);

    const card = screen
      .getByText("Constraints")
      .closest<HTMLElement>("[data-chart-card]")!;
    expect(card.textContent).toContain("pass threshold 95% (alpha 0.05)");
    expect(card.textContent).toMatch(
      /\d+ \/ \d+ · \d+%steps clear across the study/u,
    );
    expect(card.textContent).toMatch(/infeasible draws?/u);
    expect(card.textContent).toMatch(/Step 30: (clear|limited|infeasible)/u);
    expect(card.querySelectorAll("[data-constraint-row]")).toHaveLength(1);
    expect(card.textContent).toContain("Finished goods under 500");
    expect(card.textContent).toContain(
      "1 parameter constraint is checked before each step runs.",
    );
  });

  it("puts the steps clear in the strip and a Runs passed column in the table, greying the infeasible draws", () => {
    renderDrawer(settled);

    expect(screen.getByText("Steps clear")).toBeTruthy();
    expect(screen.getByText("Runs passed")).toBeTruthy();
    expect(screen.getAllByText(/^\d+ \/ 60 · \d+%$/u).length).toBeGreaterThan(
      0,
    );
    const infeasible = screen.getAllByTitle(/^Infeasible: /u);
    expect(infeasible.length).toBeGreaterThan(0);
    expect(infeasible[0]?.getAttribute("data-state")).toBe("infeasible");
    expect(infeasible[0]?.getAttribute("title")).toBe(
      "Infeasible: Production rate under 320",
    );
  });

  it("ends the step line at the verdict for a parameter-only study whose step completed", () => {
    const parameterOnlyInput = {
      ...constrainedInput,
      constraints: constrainedInput.constraints?.filter(
        (constraint) => constraint.space === "parameters",
      ),
    };
    const parameterOnlyTrials = constrainedTrials.map((trial) => ({
      ...trial,
      state: "complete" as const,
      objective: trial.objective ?? 1,
      constraints: {
        parameters: [{ constraintId: "rate-cap", margin: 1 }],
        state: [],
      },
    }));
    renderDrawer(
      makeOptimizationRecord({
        input: parameterOnlyInput,
        trials: parameterOnlyTrials,
        best: fakeConstrainedStudyTrials.best,
        status: "complete",
        connected: makeConnectedStudyState(parameterOnlyInput, {
          navigation,
          resumable: true,
        }),
      }),
    );

    const card = screen
      .getByText("Constraints")
      .closest<HTMLElement>("[data-chart-card]")!;
    expect(card.textContent).toContain("Step 30: clear");
    expect(card.textContent).not.toContain("clearr");
    expect(card.querySelectorAll("[data-constraint-row]")).toHaveLength(0);
  });

  it("shows none of it for a study without constraints", () => {
    renderDrawer(
      makeOptimizationRecord({
        input,
        trials,
        best,
        status: "complete",
        connected: makeConnectedStudyState(input, { resumable: true }),
      }),
    );

    expect(screen.queryByText("Constraints")).toBeNull();
    expect(screen.queryByText("Steps clear")).toBeNull();
    expect(screen.queryByText("Runs passed")).toBeNull();
  });
});

describe("ViewOptimizationDrawer's Sensitivity analysis card", () => {
  const settledLong = makeOptimizationRecord({
    input: fakeLongStudyInput,
    trials: fakeLongStudyTrials.trials,
    best: fakeLongStudyTrials.best,
    status: "complete",
    importance: makeImportance(fakeLongStudyInput, fakeLongStudyTrials.trials),
    connected: makeConnectedStudyState(fakeLongStudyInput, {
      resumable: true,
    }),
  });

  const importanceCard = () =>
    screen
      .getByText("Sensitivity analysis")
      .closest<HTMLElement>("[data-chart-card]")!;

  it("ranks the optimized parameters with a bar each above the floor, the count in the subtitle and a Correlation column", () => {
    renderDrawer(settledLong);

    const card = importanceCard();
    expect(card.getAttribute("data-tone")).toBe("default");
    expect(
      card.querySelector("[data-chart-card-subtitle]")?.textContent,
    ).toMatch(
      /^PED-ANOVA importance estimated from \d+ completed steps · how much each parameter matters for reaching the best steps$/u,
    );
    expect(card.textContent).not.toContain("floor");
    const rows = card.querySelectorAll<HTMLElement>("[data-importance-row]");
    expect([...rows].map((row) => row.dataset.importanceRow)).toEqual([
      "production_rate",
      "selling_price",
      "marketing_spend",
    ]);
    const widths = [
      ...card.querySelectorAll<HTMLElement>("[data-importance-bar]"),
    ].map((bar) => Number.parseFloat(bar.style.width));
    expect(widths[0]).toBe(100);
    expect(widths.every((width) => width > 0)).toBe(true);
    expect(card.textContent).toContain("Correlation");
    expect(card.textContent).toMatch(/[+−]\d\.\d\d/u);
  });

  it("mutes the card and fades the bars below the floor, and says so in the subtitle", () => {
    renderDrawer(
      makeOptimizationRecord({
        input,
        trials,
        best,
        status: "complete",
        importance: makeImportance(input, trials),
        connected: makeConnectedStudyState(input, { resumable: true }),
      }),
    );

    const card = importanceCard();
    expect(card.getAttribute("data-tone")).toBe("muted");
    expect(
      card.querySelector("[data-chart-card-subtitle]")?.textContent,
    ).toContain("below the 50-step floor, treat as a hint");
    expect(
      card
        .querySelector("[data-importance-panel]")
        ?.getAttribute("data-below-floor"),
    ).toBe("true");
    // Faded bars do not set the scale: the largest bar is its raw share, not full width.
    const widths = [
      ...card.querySelectorAll<HTMLElement>("[data-importance-bar]"),
    ].map((bar) => Number.parseFloat(bar.style.width));
    expect(Math.max(...widths)).toBeLessThan(100);
  });

  it("shows dashed rows and the correlations while no estimate has arrived, and nothing for a remote study", () => {
    renderDrawer(
      makeOptimizationRecord({
        input,
        trials,
        best,
        status: "running",
        connected: makeConnectedStudyState(input),
      }),
    );

    const card = importanceCard();
    const rows = card.querySelectorAll<HTMLElement>("[data-importance-row]");
    expect(rows).toHaveLength(2);
    expect([...rows].every((row) => row.dataset.estimated === "false")).toBe(
      true,
    );
    expect(card.textContent).toMatch(/[+−]\d\.\d\d/u);
    cleanup();

    renderDrawer(
      makeOptimizationRecord({ input, trials, best, status: "complete" }),
    );
    expect(screen.queryByText("Sensitivity analysis")).toBeNull();
  });

  it("tells a one-parameter study that PED-ANOVA ranks two or more parameters, unmuted, with the correlation column", () => {
    const singleParameterInput = makeOptimizationInput({
      production_rate: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 50,
          maximum: 400,
          scale: "linear",
        },
      },
    });
    const singleParameter = makeTrials(singleParameterInput, 30);
    renderDrawer(
      makeOptimizationRecord({
        input: singleParameterInput,
        trials: singleParameter.trials,
        best: singleParameter.best,
        status: "complete",
        connected: makeConnectedStudyState(singleParameterInput, {
          resumable: true,
        }),
      }),
    );

    const card = importanceCard();
    expect(card.getAttribute("data-tone")).toBe("default");
    expect(
      card.querySelector("[data-chart-card-subtitle]")?.textContent,
    ).toMatch(
      /^PED-ANOVA ranks two or more parameters · \d+ completed steps · correlation only$/u,
    );
    expect(card.textContent).not.toContain("floor");
    expect(card.querySelectorAll("[data-importance-row]")).toHaveLength(1);
    expect(card.textContent).toMatch(/[+−]\d\.\d\d/u);
  });
});

describe("ViewOptimizationDrawer holds every box still across states", () => {
  const navigation = navigationAtTrial(input, trials[2]!, true);
  const base = {
    input,
    trials: trials.slice(0, 3),
    best: trials[2]!.best,
  };
  const states: OptimizationRecord[] = [
    makeOptimizationRecord({
      ...base,
      status: "running",
      connected: makeConnectedStudyState(input, {
        navigation,
        selection: makeSelectionStream({
          input,
          navigation,
          followedTrial: 2,
          runsCompleted: 1,
          computing: true,
          frameCount: 4,
        }),
      }),
    }),
    makeOptimizationRecord({
      ...base,
      status: "paused",
      connected: makeConnectedStudyState(input, {
        navigation: navigationAtTrial(input, trials[2]!, false),
        selection: null,
        resumable: true,
      }),
    }),
    makeOptimizationRecord({
      ...base,
      status: "cancelled",
      connected: makeConnectedStudyState(input, {
        navigation: navigationAtTrial(input, trials[2]!, false),
        resumable: true,
      }),
    }),
    makeOptimizationRecord({
      ...base,
      status: "complete",
      connected: makeConnectedStudyState(input, {
        navigation: navigationAtTrial(input, trials[2]!, false),
        resumable: true,
      }),
    }),
  ];

  it("gives the header, the note row, every card and the steps table one height in running, paused, stopped and complete", () => {
    const signatures = states.map((state) => {
      const view = renderDrawer(state);
      const signature = frameLayoutSignature(view.container);
      view.unmount();
      return signature;
    });

    expect(signatures[0]!.header).toBe(`${FRAME_HEADER_HEIGHT}px`);
    expect(signatures[0]!.note).toBe("20px");
    expect(signatures[0]!.steps).toBe("320px");
    expect(signatures[0]!.cards.map(([title]) => title)).toEqual([
      "Objective at the step in flight",
      "Objective by step",
      "Sensitivity analysis",
    ]);
    for (const signature of signatures.slice(1)) {
      // A settled study titles the objective card for the point it shows;
      // the boxes are the same.
      expect({
        ...signature,
        cards: signature.cards.map(([, height]) => height),
      }).toEqual({
        ...signatures[0],
        cards: signatures[0]!.cards.map(([, height]) => height),
      });
    }
  });

  it("puts the resume note in the reserved row while paused", () => {
    renderDrawer(states[1]!);

    const note = document.querySelector<HTMLElement>("[data-frame-note]")!;
    expect(note.style.height).toBe("20px");
    expect(note.querySelector("[data-resume-note]")).toBeTruthy();
  });

  it("leaves the objective card's height alone when its aggregation changes", () => {
    const view = renderDrawer(states[0]!);
    const before = frameLayoutSignature(view.container);

    fireEvent.click(screen.getByRole("button", { name: "Chart options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Median" }));

    expect(frameLayoutSignature(view.container)).toEqual(before);
  });
});
