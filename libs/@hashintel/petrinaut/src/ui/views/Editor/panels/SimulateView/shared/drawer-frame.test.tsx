/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DrawerFrame } from "./drawer-frame";
import {
  frameHeader as header,
  frameStats,
  scrollFrameBody as scrollBodyTo,
} from "./drawer-frame.test-helpers";
import { ComputeBatchesChip } from "./drawer-frame/compute-batches-chip";
import { FrameCard } from "./drawer-frame/frame-card";
import { FrameColumns } from "./drawer-frame/frame-columns";
import { FrameStat, FrameStatusPill } from "./drawer-frame/frame-header";

import type { ReactNode } from "react";

// The computing list's popover positions itself on the next frame through a
// ResizeObserver jsdom lacks; nothing here depends on a measurement.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;

afterEach(cleanup);

/** The computing chip's shape: a button in the stats line, disabled once nothing computes. */
const computingChip = (computing: boolean) => (
  <button type="button" disabled={!computing}>
    {computing ? "1 computing" : "0 computing"}
  </button>
);

const frame = ({
  note = null,
  stats,
}: {
  note?: { content: string; tone: "error" } | null;
  stats?: ReactNode;
} = {}) => (
  <DrawerFrame
    title="SIR transmission sweep · Seasonal Flu · 100 runs"
    headline={<span>Step 3 of 30</span>}
    stats={
      <>
        <FrameStat label="Status" widest="" align="start">
          <FrameStatusPill tone="active" widest="Initializing">
            Running
          </FrameStatusPill>
        </FrameStat>
        <FrameStat label="Runs" widest="1,000 complete">
          100 complete
        </FrameStat>
        {stats}
      </>
    }
    badge={<span>CPU</span>}
    progress={40}
    note={note}
    footer={<button type="button">Close</button>}
  >
    <div style={{ height: 2000 }} />
  </DrawerFrame>
);

const renderFrame = (note: { content: string; tone: "error" } | null = null) =>
  render(frame({ note }));

describe("DrawerFrame", () => {
  it("renders the title, the stat columns sized by their widest value, the badge column, the bar and the footer at rest", () => {
    renderFrame();

    expect(header().dataset.condensed).toBe("false");
    expect(
      screen.getByText("SIR transmission sweep · Seasonal Flu · 100 runs"),
    ).toBeTruthy();
    expect(screen.getByText("Step 3 of 30")).toBeTruthy();
    // The strip holds the labelled columns; the compact echo repeats them.
    const strip = within(frameStats());
    const runs = strip.getByText("Runs").nextElementSibling!;
    expect(runs.querySelector("[data-frame-stat-value]")?.textContent).toBe(
      "100 complete",
    );
    expect(runs.querySelector("[data-frame-stat-sizer]")?.textContent).toBe(
      "1,000 complete",
    );
    // The stats are labelled columns; the badge is the last of them.
    const columns = [
      ...document.querySelectorAll("[data-frame-stats] [data-frame-stat]"),
    ];
    expect(
      columns.map((column) => column.querySelector("span")?.textContent),
    ).toEqual(["Status", "Runs", "Compute"]);
    expect(columns.at(-1)?.getAttribute("data-trailing")).toBe("true");
    expect(strip.getByText("CPU")).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>("[data-frame-progress] > div")?.style
        .width,
    ).toBe("40%");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("condenses once the body has scrolled, folding the stats into the title line, and grows back under the pointer", () => {
    renderFrame();

    scrollBodyTo(48);
    expect(header().dataset.condensed).toBe("true");
    // The compact copy sits in the title line, an inert echo of the strip,
    // which is folded away; the headline steps aside for it.
    const compact = document.querySelector("[data-frame-compact-stats]")!;
    expect(compact.textContent).toContain("Running");
    expect(compact.textContent).toContain("CPU");
    expect(
      [...compact.querySelectorAll("[data-frame-stat]")].map((stat) =>
        stat.getAttribute("title"),
      ),
    ).toEqual(["Status", "Runs", "Compute"]);
    expect(compact.hasAttribute("inert")).toBe(true);
    expect(compact.getAttribute("aria-hidden")).toBe("true");
    // The folded strip stays the one copy a reader or the keyboard reaches.
    const strip = frameStats();
    expect(strip.getAttribute("aria-hidden")).toBeNull();
    expect(strip.hasAttribute("inert")).toBe(false);
    const headline = document.querySelector("[data-frame-headline]")!;
    expect(headline.getAttribute("aria-hidden")).toBe("true");
    expect(headline.hasAttribute("inert")).toBe(true);

    fireEvent.pointerEnter(header());
    expect(header().dataset.condensed).toBe("false");
    // Both copies stay mounted so the flip can crossfade: the strip is
    // still live, the compact echo stays inert and the headline reads.
    expect(strip.getAttribute("aria-hidden")).toBeNull();
    expect(strip.hasAttribute("inert")).toBe(false);
    expect(compact.isConnected).toBe(true);
    expect(compact.hasAttribute("inert")).toBe(true);
    expect(compact.getAttribute("aria-hidden")).toBe("true");
    expect(headline.hasAttribute("inert")).toBe(false);

    fireEvent.pointerLeave(header());
    expect(header().dataset.condensed).toBe("true");

    scrollBodyTo(0);
    expect(header().dataset.condensed).toBe("false");
  });

  it("stays expanded while the body overflows by less than the header gives back, and stays condensed once the clamp shrinks the overflow", () => {
    renderFrame();

    // 30px of overflow: condensing would hand the body 38px, the content
    // would fit and the offset clamp to zero, so the header does not move.
    scrollBodyTo(30, { overflow: 30 });
    expect(header().dataset.condensed).toBe("false");

    // 50px of overflow condenses; the clamp that follows reports 12px of
    // overflow at a 12px offset, which keeps it condensed.
    scrollBodyTo(50, { overflow: 50 });
    expect(header().dataset.condensed).toBe("true");
    scrollBodyTo(12, { overflow: 12 });
    expect(header().dataset.condensed).toBe("true");

    scrollBodyTo(0, { overflow: 12 });
    expect(header().dataset.condensed).toBe("false");
  });

  it("grows back when the keyboard reaches a control in the folded strip, and condenses again when it leaves", () => {
    render(frame({ stats: computingChip(true) }));
    const chip = screen.getByRole("button", { name: "1 computing" });

    scrollBodyTo(48);
    expect(header().dataset.condensed).toBe("true");
    // Folded, not inert: a Tab still lands on the chip.
    expect(frameStats().hasAttribute("inert")).toBe(false);

    act(() => chip.focus());
    expect(header().dataset.condensed).toBe("false");
    expect(document.activeElement).toBe(chip);

    act(() => chip.blur());
    expect(header().dataset.condensed).toBe("true");
  });

  it("holds its height while a control inside it has the focus, and condenses once that control lost it without a blur", () => {
    const view = render(frame({ stats: computingChip(true) }));
    const chip = screen.getByRole("button", { name: "1 computing" });
    act(() => chip.focus());

    // Keyboard focus on a header control holds the header open.
    scrollBodyTo(48);
    expect(header().dataset.condensed).toBe("false");

    // The chip goes idle under the focus: disabled, so it fires no blur.
    view.rerender(frame({ stats: computingChip(false) }));
    scrollBodyTo(60);
    expect(header().dataset.condensed).toBe("true");
    view.unmount();

    // The same when the focused control is unmounted.
    const removed = render(frame({ stats: computingChip(true) }));
    act(() => screen.getByRole("button", { name: "1 computing" }).focus());
    removed.rerender(frame());
    scrollBodyTo(60);
    expect(header().dataset.condensed).toBe("true");
  });

  it("lays a stat's short form beside the whole one, so the header's width picks which shows", () => {
    render(
      <FrameStat
        label="Steps"
        widest="30 / 30 · 3 runs each"
        short={{ text: "4 / 30", widest: "30 / 30" }}
      >
        4 / 30 · 3 runs each
      </FrameStat>,
    );

    const stat = document.querySelector<HTMLElement>("[data-frame-stat]")!;
    expect(stat.dataset.short).toBe("true");
    expect(stat.getAttribute("title")).toBe("Steps");
    expect(stat.querySelector("[data-frame-stat-value]")?.textContent).toBe(
      "4 / 30 · 3 runs each",
    );
    expect(stat.querySelector("[data-frame-stat-short]")?.textContent).toBe(
      "4 / 30",
    );
    expect(
      [...stat.querySelectorAll("[aria-hidden]")].map(
        (sizer) => sizer.textContent,
      ),
    ).toEqual(["30 / 30 · 3 runs each", "30 / 30"]);
  });

  it("makes the stats line a labelled tab stop only while it overflows, so the keyboard can scroll it", () => {
    const view = render(frame());
    const line = document.querySelector<HTMLElement>(
      "[data-frame-stats-line]",
    )!;

    expect(line.hasAttribute("tabindex")).toBe(false);
    expect(line.getAttribute("aria-label")).toBe("Header statistics");

    // jsdom lays nothing out: give the line more content than width.
    Object.defineProperty(line, "scrollWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(line, "clientWidth", {
      configurable: true,
      value: 400,
    });
    view.rerender(frame());

    expect(line.getAttribute("tabindex")).toBe("0");
  });

  it("keeps the note row mounted at one height whether or not there is a note", () => {
    const empty = renderFrame();
    const emptyRow = document.querySelector<HTMLElement>("[data-frame-note]")!;
    expect(emptyRow.style.height).toBe("20px");
    expect(emptyRow.textContent).toBe("");
    empty.unmount();

    renderFrame({ content: "metric__profit: Unexpected token", tone: "error" });
    const row = document.querySelector<HTMLElement>("[data-frame-note]")!;
    expect(row.style.height).toBe("20px");
    expect(row.dataset.tone).toBe("error");
    expect(row.textContent).toBe("metric__profit: Unexpected token");
  });

  it("draws the computing chip at zero, disabled, with room for a three-digit count", () => {
    render(<ComputeBatchesChip batches={[]} />);

    const chip = screen.getByRole("button", { name: "0 computing" });
    expect(chip).toHaveProperty("disabled", true);
    expect(
      chip.closest("[data-compute-batches]")?.getAttribute("data-idle"),
    ).toBe("true");
    expect(chip.textContent).toContain("000 computing");
  });

  it("closes the computing list with the last batch and leaves it closed for the next one", async () => {
    const batch = {
      id: "selection",
      label: "Selection",
      tone: "priority" as const,
      runCount: 100,
      completedRuns: 10,
    };
    const view = render(<ComputeBatchesChip batches={[batch]} />);
    fireEvent.click(screen.getByRole("button", { name: "1 computing" }));
    expect(
      screen
        .getByRole("button", { name: "1 computing" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    // The popover opens on the next frame.
    await waitFor(() =>
      expect(
        document.querySelector("[data-compute-batches-list]"),
      ).toBeTruthy(),
    );

    view.rerender(<ComputeBatchesChip batches={[]} />);
    expect(document.querySelector("[data-compute-batches-list]")).toBeNull();

    view.rerender(<ComputeBatchesChip batches={[batch]} />);
    expect(document.querySelector("[data-compute-batches-list]")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "1 computing" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps a card's fixed part folded until its footer button opens it, mounted throughout", () => {
    render(
      <FrameCard
        title="Parameters"
        subtitle="1 optimized · 1 fixed"
        more={{
          show: "Show 1 fixed parameter",
          hide: "Hide fixed parameters",
          content: <input aria-label="population" defaultValue="1000" />,
        }}
      >
        <input aria-label="infection_rate" defaultValue="0.3" />
      </FrameCard>,
    );

    expect(screen.getByText("1 optimized · 1 fixed")).toBeTruthy();
    const more = document.querySelector<HTMLElement>("[data-frame-card-more]")!;
    expect(more.hasAttribute("inert")).toBe(true);
    expect(more.getAttribute("aria-hidden")).toBe("true");
    expect(more.querySelector("input")?.value).toBe("1000");
    expect(
      screen.getByRole("textbox", { name: "infection_rate" }),
    ).toBeTruthy();

    // The button's name ends in the icon's zero-width joiner.
    const toggle = screen.getByRole("button", {
      name: /^Show 1 fixed parameter/u,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(more.hasAttribute("inert")).toBe(false);
    expect(more.getAttribute("aria-hidden")).toBeNull();
    expect(screen.getByRole("textbox", { name: "population" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /^Hide fixed parameters/u })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("gives the secondary column the whole width when there is no primary", () => {
    const view = render(<FrameColumns secondary={<div>cards</div>} />);
    expect(
      view.container
        .querySelector("[data-frame-columns]")
        ?.getAttribute("data-primary"),
    ).toBe("false");
    view.unmount();

    render(
      <FrameColumns
        primary={<div>surface</div>}
        secondary={<div>cards</div>}
      />,
    );
    expect(
      document
        .querySelector("[data-frame-columns]")
        ?.getAttribute("data-primary"),
    ).toBe("true");
  });
});
