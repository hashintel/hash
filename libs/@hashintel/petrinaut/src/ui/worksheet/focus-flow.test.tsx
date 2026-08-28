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
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { focusLands } from "./focus-flow";
import { FocusRoot, FocusStack } from "./focus-stack";
import { useFocusGrid } from "./use-focus-grid";
import { useFocusHeader } from "./use-focus-member";
import { useFocusStops } from "./use-focus-stops";

import type { FocusStop, FocusStopTarget } from "./use-focus-stops";

afterEach(cleanup);

/** A uniform grid of buttons wired through `useFocusGrid`. */
const GridHarness: React.FC<{
  label: string;
  rows: number;
  columns: number;
}> = ({ label, rows, columns }) => {
  // Destructured, not held as one object: the React Compiler rejects
  // `ref={grid.register(...)}` (member access into a hook result in ref
  // position reads as a ref access during render).
  const { register, onKeyDown, onFocusCell, tabIndexFor, attach } =
    useFocusGrid();
  return (
    <div role="grid" aria-label={label} ref={attach}>
      {Array.from({ length: rows }, (_row, row) => (
        <div key={row} role="row">
          {Array.from({ length: columns }, (_column, column) => (
            <button
              key={column}
              type="button"
              ref={register(row, column)}
              tabIndex={tabIndexFor(row, column)}
              onKeyDown={onKeyDown(row, column)}
              onFocus={() => onFocusCell(row, column)}
            >
              {`${label} ${row},${column}`}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

const targetKey = (target: FocusStopTarget) =>
  `${target.stopId}:${target.column}`;

/** A stops table of buttons wired through `useFocusStops`. */
const StopsHarness: React.FC<{
  label: string;
  stops: FocusStop[];
  columnCount: number;
}> = ({ label, stops, columnCount }) => {
  const parts = useRef(new Map<string, HTMLButtonElement>());
  const { onKeyDown, onFocusTarget, tabIndexFor, attach } = useFocusStops({
    stops,
    columnCount,
    focusTarget: (target) => focusLands(parts.current.get(targetKey(target))),
  });

  const partButton = (target: FocusStopTarget, text: string) => (
    <button
      key={targetKey(target)}
      type="button"
      ref={(element) => {
        if (element) {
          parts.current.set(targetKey(target), element);
        } else {
          parts.current.delete(targetKey(target));
        }
      }}
      tabIndex={tabIndexFor(target)}
      onKeyDown={onKeyDown(target)}
      onFocus={() => onFocusTarget(target)}
    >
      {text}
    </button>
  );

  return (
    <div role="grid" aria-label={label} ref={attach}>
      {stops.map((stop) => (
        <div key={stop.id} role="row">
          {stop.kind === "row" && stop.gutter
            ? partButton(
                { stopId: stop.id, column: "gutter" },
                `${label} ${stop.id} gutter`,
              )
            : null}
          {stop.kind === "full"
            ? partButton(
                { stopId: stop.id, column: 0 },
                `${label} ${stop.id} full`,
              )
            : (stop.kind === "sparse"
                ? stop.columns
                : Array.from({ length: columnCount }, (_, column) => column)
              ).map((column) =>
                partButton(
                  { stopId: stop.id, column },
                  `${label} ${stop.id} c${column}`,
                ),
              )}
        </div>
      ))}
    </div>
  );
};

/** A single collapsible-header button wired through `useFocusHeader`. */
const HeaderHarness: React.FC<{
  label: string;
  collapse?: () => void;
  expand?: () => void;
}> = ({ label, collapse, expand }) => {
  const { attach, onHeaderKeyDown } = useFocusHeader({ collapse, expand });
  return (
    <button type="button" ref={attach} onKeyDown={onHeaderKeyDown}>
      {label}
    </button>
  );
};

/** Focuses the button with the given text, asserting focus landed. */
const focusPart = (name: string): HTMLElement => {
  const target = screen.getByText(name);
  act(() => {
    target.focus();
  });
  expect(document.activeElement).toBe(target);
  return target;
};

/** Presses an arrow key on whatever currently holds focus. */
const arrow = (key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => {
  const active = document.activeElement;
  if (!active) {
    throw new Error("nothing holds focus");
  }
  fireEvent.keyDown(active, { key });
};

const expectFocused = (name: string) => {
  expect(document.activeElement).toBe(screen.getByText(name));
};

const VerticalChain: React.FC<{ middleRows: number }> = ({ middleRows }) => (
  <FocusRoot>
    <FocusStack axis="vertical">
      <GridHarness label="A" rows={2} columns={1} />
      <GridHarness label="B" rows={middleRows} columns={1} />
      <GridHarness label="C" rows={2} columns={1} />
    </FocusStack>
  </FocusRoot>
);

const ShrinkingPair: React.FC<{ bRows: number }> = ({ bRows }) => (
  <FocusRoot>
    <FocusStack axis="horizontal">
      <GridHarness label="A" rows={1} columns={1} />
      <GridHarness label="B" rows={bRows} columns={2} />
    </FocusStack>
  </FocusRoot>
);

describe("worksheet focus flow", () => {
  it("moves between grid cells with arrows and keeps focus in place on a refused edge move", () => {
    render(
      <FocusRoot>
        <GridHarness label="A" rows={2} columns={2} />
      </FocusRoot>,
    );

    focusPart("A 0,0");
    arrow("ArrowRight");
    expectFocused("A 0,1");
    arrow("ArrowDown");
    expectFocused("A 1,1");
    arrow("ArrowLeft");
    expectFocused("A 1,0");
    arrow("ArrowUp");
    expectFocused("A 0,0");

    arrow("ArrowLeft");
    expectFocused("A 0,0");
    arrow("ArrowUp");
    expectFocused("A 0,0");
  });

  it("carries focus between sibling columns' grids at a grid edge, and back", () => {
    render(
      <FocusRoot>
        <FocusStack axis="horizontal">
          <FocusStack axis="vertical">
            <GridHarness label="A" rows={2} columns={2} />
          </FocusStack>
          <FocusStack axis="vertical">
            <GridHarness label="B" rows={2} columns={2} />
          </FocusStack>
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("A 0,0");
    arrow("ArrowRight");
    expectFocused("A 0,1");

    arrow("ArrowRight");
    expectFocused("B 0,0");

    arrow("ArrowLeft");
    expectFocused("A 0,1");
  });

  it("re-enters a grid at its remembered cell by default", () => {
    render(
      <FocusRoot>
        <FocusStack axis="horizontal">
          <FocusStack axis="vertical">
            <GridHarness label="A" rows={2} columns={1} />
          </FocusStack>
          <FocusStack axis="vertical">
            <GridHarness label="B" rows={2} columns={2} />
          </FocusStack>
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("B 1,1");
    focusPart("A 0,0");
    arrow("ArrowRight");
    expectFocused("B 1,1");
  });

  it('enters aligned with the source row under entry="aligned", ignoring the remembered cell', () => {
    render(
      <FocusRoot>
        <FocusStack axis="horizontal" entry="aligned">
          <GridHarness label="A" rows={3} columns={2} />
          <GridHarness label="B" rows={3} columns={2} />
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("B 0,0");
    focusPart("A 2,1");
    arrow("ArrowRight");
    expectFocused("B 2,0");
  });

  it("applies the aligned policy at the routing stack, through plain inner stacks", () => {
    render(
      <FocusRoot>
        <FocusStack axis="horizontal" entry="aligned">
          <FocusStack axis="vertical">
            <GridHarness label="A" rows={3} columns={2} />
          </FocusStack>
          <FocusStack axis="vertical">
            <GridHarness label="B" rows={3} columns={2} />
          </FocusStack>
        </FocusStack>
      </FocusRoot>,
    );

    // Only the horizontal (routing) stack opts into alignment; the plain
    // vertical stacks pass the entry through unchanged.
    focusPart("B 0,0");
    focusPart("A 2,1");
    arrow("ArrowRight");
    expectFocused("B 2,0");
  });

  it("chains vertically into the next grid and skips a member whose enter fails", () => {
    const view = render(<VerticalChain middleRows={2} />);

    focusPart("A 1,0");
    arrow("ArrowDown");
    expectFocused("B 0,0");

    view.rerender(<VerticalChain middleRows={0} />);

    focusPart("A 1,0");
    arrow("ArrowDown");
    expectFocused("C 0,0");
  });

  it("never lets arrows leave a containing stack, even toward a routable sibling", () => {
    render(
      <FocusRoot>
        <FocusStack axis="horizontal">
          <FocusStack axis="horizontal" contain>
            <GridHarness label="A" rows={2} columns={2} />
          </FocusStack>
          <GridHarness label="B" rows={2} columns={2} />
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("A 0,1");
    arrow("ArrowRight");
    expectFocused("A 0,1");

    arrow("ArrowUp");
    expectFocused("A 0,1");
  });

  it("falls back to a mounted cell when the remembered cell unmounted", () => {
    const view = render(<ShrinkingPair bRows={2} />);

    focusPart("B 1,1");
    view.rerender(<ShrinkingPair bRows={1} />);

    focusPart("A 0,0");
    arrow("ArrowRight");
    expectFocused("B 0,0");
  });

  it("roves the tabindex: exactly one tabbable cell, following focus", () => {
    const view = render(
      <FocusRoot>
        <GridHarness label="A" rows={2} columns={3} />
      </FocusRoot>,
    );

    const tabbable = () =>
      [...view.container.querySelectorAll("button")].filter(
        (button) => button.tabIndex === 0,
      );
    expect(tabbable()).toEqual([screen.getByText("A 0,0")]);

    focusPart("A 1,2");
    expect(tabbable()).toEqual([screen.getByText("A 1,2")]);
    expect(screen.getByText("A 0,0").tabIndex).toBe(-1);
  });

  it("walks stops vertically with column memory, nearest sparse column, and a gutter lane", () => {
    render(
      <FocusRoot>
        <StopsHarness
          label="T"
          stops={[
            { id: "r0", kind: "row", gutter: true },
            { id: "count", kind: "full" },
            { id: "r1", kind: "row", gutter: true },
            { id: "shared", kind: "sparse", columns: [0, 2] },
          ]}
          columnCount={3}
        />
      </FocusRoot>,
    );

    focusPart("T r0 c1");
    arrow("ArrowDown");
    expectFocused("T count full");

    arrow("ArrowDown");
    expectFocused("T r1 c1");

    arrow("ArrowDown");
    expectFocused("T shared c0");

    focusPart("T r0 gutter");
    arrow("ArrowDown");
    expectFocused("T r1 gutter");

    arrow("ArrowRight");
    expectFocused("T r1 c0");

    arrow("ArrowLeft");
    expectFocused("T r1 gutter");
  });

  it("overflows the stops table into the stack, vertically and horizontally", () => {
    render(
      <FocusRoot>
        <FocusStack axis="vertical">
          <FocusStack axis="horizontal">
            <StopsHarness
              label="T"
              stops={[
                { id: "r0", kind: "row" },
                { id: "r1", kind: "row" },
              ]}
              columnCount={2}
            />
            <GridHarness label="R" rows={1} columns={1} />
          </FocusStack>
          <GridHarness label="D" rows={1} columns={1} />
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("T r1 c0");
    arrow("ArrowDown");
    expectFocused("D 0,0");

    focusPart("T r0 c1");
    arrow("ArrowRight");
    expectFocused("R 0,0");
  });

  it("drives collapse/expand from a header's Left/Right, routing horizontally without them", () => {
    const collapse = vi.fn();
    const expand = vi.fn();
    const withHandlers = render(
      <FocusRoot>
        <FocusStack axis="horizontal">
          <HeaderHarness label="H" collapse={collapse} expand={expand} />
          <GridHarness label="G" rows={1} columns={1} />
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("H");
    arrow("ArrowLeft");
    expect(collapse).toHaveBeenCalledTimes(1);
    expectFocused("H");
    arrow("ArrowRight");
    expect(expand).toHaveBeenCalledTimes(1);
    expectFocused("H");

    withHandlers.unmount();

    render(
      <FocusRoot>
        <FocusStack axis="horizontal">
          <GridHarness label="L" rows={1} columns={1} />
          <HeaderHarness label="H2" />
          <GridHarness label="R" rows={1} columns={1} />
        </FocusStack>
      </FocusRoot>,
    );

    focusPart("H2");
    arrow("ArrowLeft");
    expectFocused("L 0,0");

    focusPart("H2");
    arrow("ArrowRight");
    expectFocused("R 0,0");
  });
});
