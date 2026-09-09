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
import { afterEach, describe, expect, it } from "vitest";

import {
  DrawerFrame,
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  FrameStat,
  FrameStatusPill,
} from "./drawer-frame";
import {
  frameHeader as header,
  scrollFrameBody as scrollBodyTo,
} from "./drawer-frame/frame-test-helpers";

import type { ReactNode } from "react";

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
    title="SIR transmission sweep · Seasonal Flu · 100 runs · dt 1"
    headline={<span>Step 3 of 30</span>}
    stats={
      <>
        <FrameStatusPill tone="active" minChars={14}>
          Running
        </FrameStatusPill>
        <FrameStat label="Runs" minChars={12}>
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
  it("renders the title, the stats with their labels, the badge, the bar and the footer at rest", () => {
    renderFrame();

    expect(header().style.height).toBe(`${FRAME_HEADER_HEIGHT}px`);
    expect(header().dataset.condensed).toBe("false");
    expect(
      screen.getByText(
        "SIR transmission sweep · Seasonal Flu · 100 runs · dt 1",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Step 3 of 30")).toBeTruthy();
    expect(screen.getByText("Runs").nextElementSibling?.textContent).toBe(
      "100 complete",
    );
    expect(screen.getByText("Runs").nextElementSibling).toHaveProperty(
      "style.minWidth",
      "12ch",
    );
    expect(screen.getByText("CPU")).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>("[data-frame-progress] > div")?.style
        .width,
    ).toBe("40%");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("condenses once the body has scrolled, folding the stats into the title line, and grows back under the pointer", () => {
    renderFrame();

    scrollBodyTo(48);
    expect(header().style.height).toBe(`${FRAME_HEADER_CONDENSED_HEIGHT}px`);
    expect(header().dataset.condensed).toBe("true");
    // The compact copy sits in the title line; the stats line is folded away.
    const compact = document.querySelector("[data-frame-compact-stats]")!;
    expect(compact.textContent).toContain("Running");
    expect(compact.textContent).toContain("CPU");
    expect(
      compact.querySelector("[data-frame-stat]")?.getAttribute("title"),
    ).toBe("Runs");
    expect(
      document.querySelector("[data-frame-stats]")?.getAttribute("aria-hidden"),
    ).toBe("true");

    fireEvent.pointerEnter(header());
    expect(header().style.height).toBe(`${FRAME_HEADER_HEIGHT}px`);
    expect(document.querySelector("[data-frame-compact-stats]")).toBeNull();

    fireEvent.pointerLeave(header());
    expect(header().style.height).toBe(`${FRAME_HEADER_CONDENSED_HEIGHT}px`);

    scrollBodyTo(0);
    expect(header().style.height).toBe(`${FRAME_HEADER_HEIGHT}px`);
  });

  it("holds its height while a control inside it has the focus, and condenses once that control lost it without a blur", () => {
    const view = render(frame({ stats: computingChip(true) }));
    const chip = screen.getByRole("button", { name: "1 computing" });
    act(() => chip.focus());

    // Keyboard focus on a header control holds the header open.
    scrollBodyTo(48);
    expect(header().style.height).toBe(`${FRAME_HEADER_HEIGHT}px`);

    // The chip goes idle under the focus: disabled, so it fires no blur.
    view.rerender(frame({ stats: computingChip(false) }));
    scrollBodyTo(60);
    expect(header().style.height).toBe(`${FRAME_HEADER_CONDENSED_HEIGHT}px`);
    expect(header().dataset.condensed).toBe("true");
    view.unmount();

    // The same when the focused control is unmounted.
    const removed = render(frame({ stats: computingChip(true) }));
    act(() => screen.getByRole("button", { name: "1 computing" }).focus());
    removed.rerender(frame());
    scrollBodyTo(60);
    expect(header().style.height).toBe(`${FRAME_HEADER_CONDENSED_HEIGHT}px`);
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
});
