/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  frameLayoutSignature,
} from "../shared/drawer-frame";
import {
  frameHeader,
  scrollFrameBody,
} from "../shared/drawer-frame/frame-test-helpers";
import { describeExperiment } from "./experiment-results";
import {
  makeExperiment,
  makeParameterSweepExperiment,
} from "./experiments-story-fixtures";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";
import type { ReactNode } from "react";

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
  return { ...actual, Drawer, Menu, Tooltip };
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

afterEach(cleanup);

const renderDrawer = (experiment: ExperimentRecord) =>
  render(
    <ViewExperimentDrawer open onClose={() => {}} experiment={experiment} />,
  );

const sweep = makeParameterSweepExperiment();

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
      screen.getByText(
        /^SIR transmission sweep · Seasonal Flu · 100 runs · dt 1$/u,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(
      screen
        .getByText("Runs")
        .nextElementSibling?.querySelector("[data-frame-stat-value]")
        ?.textContent,
    ).toMatch(/^\d+ active, \d+ complete$/u);
    expect(screen.getByText("Selection")).toBeTruthy();
    expect(screen.getByText("CPU")).toBeTruthy();
  });

  it("names the dialog after its one-line title", () => {
    renderDrawer(sweep);

    expect(
      screen.getByRole("dialog", { name: describeExperiment(sweep) }),
    ).toBeTruthy();
  });

  it("opens the next experiment's Parameters unfolded when the drawer swaps records in place", () => {
    const view = renderDrawer(sweep);
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Parameters" }),
    );
    expect(
      document
        .querySelector("[data-frame-band]")
        ?.getAttribute("data-collapsed"),
    ).toBe("true");

    view.rerender(
      <ViewExperimentDrawer
        open
        onClose={() => {}}
        experiment={{ ...sweep, id: "experiment-5" }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Collapse Parameters" }),
    ).toBeTruthy();
    expect(
      document
        .querySelector("[data-frame-band]")
        ?.getAttribute("data-collapsed"),
    ).toBe("false");
    expect(screen.queryByText("Summary")).toBeNull();
    expect(document.querySelector("[data-frame-progress]")).toBeTruthy();
    expect(screen.getByText("Parameters")).toBeTruthy();
    expect(screen.getByTestId("sweep-surface")).toBeTruthy();
  });

  it("condenses the header once the body scrolls, with nothing else involved", () => {
    renderDrawer(sweep);

    scrollFrameBody(80);
    expect(frameHeader().style.height).toBe(
      `${FRAME_HEADER_CONDENSED_HEIGHT}px`,
    );
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

    expect(signatures[0]!.header).toBe(`${FRAME_HEADER_HEIGHT}px`);
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
    expect(screen.getAllByTestId("metric-timeline").length).toBe(
      sweep.metricSpecs.length,
    );
  });
});
