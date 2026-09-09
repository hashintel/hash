/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DrawerFrame,
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  FrameStat,
  FrameStatusPill,
} from "./drawer-frame";

afterEach(cleanup);

const renderFrame = (note: { content: string; tone: "error" } | null = null) =>
  render(
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
        </>
      }
      badge={<span>CPU</span>}
      progress={40}
      note={note}
      footer={<button type="button">Close</button>}
    >
      <div style={{ height: 2000 }} />
    </DrawerFrame>,
  );

const header = () =>
  document.querySelector<HTMLElement>("[data-frame-header]")!;
const body = () => document.querySelector<HTMLElement>("[data-frame-body]")!;

const scrollBodyTo = (top: number) => {
  Object.defineProperty(body(), "scrollTop", {
    configurable: true,
    value: top,
  });
  fireEvent.scroll(body());
};

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
