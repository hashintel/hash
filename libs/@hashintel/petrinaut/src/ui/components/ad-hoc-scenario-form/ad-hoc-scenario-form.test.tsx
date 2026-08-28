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
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY_AD_HOC_STATE } from "@hashintel/petrinaut-core";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../react/lsp/context";
import { AdHocScenarioForm } from "./ad-hoc-scenario-form";

import type { AdHocFormSelection } from "./form-context";
import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

// Monaco cannot run in jsdom; the expression editor becomes a plain textarea.
vi.mock("../../monaco/code-editor", () => ({
  CodeEditor: ({
    onChange,
    value,
    placeholder,
  }: {
    onChange: (value: string | undefined) => void;
    value?: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="Expression"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

// jsdom provides neither observer, but the value editor's popover schedules
// @floating-ui/dom's autoUpdate on an animation frame, which constructs both.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): never[] {
    return [];
  }
}
globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver =
  ObserverStub as unknown as typeof IntersectionObserver;

afterEach(cleanup);

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  places: [
    {
      id: "place-pumps",
      name: "Pumps",
      colorId: "colour-pump",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-pump",
      name: "Pump",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "e1", name: "pressure", type: "real" },
        { elementId: "e2", name: "worn", type: "boolean" },
      ],
    },
  ],
};

const Harness: React.FC<{
  selection?: AdHocFormSelection;
  onState?: (state: AdHocScenarioState) => void;
  initial?: AdHocScenarioState;
  withVariables?: boolean;
}> = ({
  selection = "optimize",
  onState,
  initial = EMPTY_AD_HOC_STATE,
  withVariables,
}) => {
  const [state, setState] = useState(initial);
  return (
    <AdHocScenarioForm
      state={state}
      onChange={(next) => {
        setState(next);
        onState?.(next);
      }}
      context={context}
      selection={selection}
      withVariables={withVariables}
    />
  );
};

const colouredPlace = (state: AdHocScenarioState | undefined) => {
  const place = state?.places["place-pumps"];
  if (place?.kind !== "coloured") {
    throw new Error("expected a coloured place state");
  }
  return place;
};

describe("AdHocScenarioForm", () => {
  it("materializes the phantom row into a fixed row", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    const place = colouredPlace(latest);
    expect(place.rows).toHaveLength(1);
    expect(place.rows[0]?.kind).toBe("fixed");
    // The gutter shows the row's ordinal, and a fresh phantom row follows.
    expect(screen.getByRole("button", { name: "Row 1 kind" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    ).toBeTruthy();
  });

  it("a phantom cell selects on the first pointer click and materializes on the second", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    const phantom = screen.getByRole("button", {
      name: "Add a token row (pressure)",
    });

    // A first pointer click (detail 1, target not focused at pointerdown)
    // only selects the cell — no row appears.
    fireEvent.pointerDown(phantom);
    fireEvent.click(phantom, { detail: 1 });
    expect(latest).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Row 1 kind" })).toBeNull();

    // A pointer click on the already-selected cell materializes the row.
    phantom.focus();
    fireEvent.pointerDown(phantom);
    fireEvent.click(phantom, { detail: 1 });
    expect(colouredPlace(latest).rows).toHaveLength(1);

    // A keyboard "click" (Enter — no pointer detail) materializes directly
    // on a fresh, unselected phantom.
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    expect(colouredPlace(latest).rows).toHaveLength(2);
  });

  it("the add-variable line selects on the first pointer click and materializes on the second", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    const addLine = screen.getByRole("button", {
      name: "Add a variable (Top-level variables)",
    });

    fireEvent.pointerDown(addLine);
    fireEvent.click(addLine, { detail: 1 });
    expect(latest).toBeUndefined();

    addLine.focus();
    fireEvent.pointerDown(addLine);
    fireEvent.click(addLine, { detail: 1 });
    expect(latest?.variables).toHaveLength(1);
  });

  it("selects a row's kind from the gutter menu", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Dynamic count" }),
    );
    let place = colouredPlace(latest);
    expect(place.rows[0]?.kind).toBe("template");
    // The dynamic row carries the quiet count strip with its count slot.
    expect(
      screen.getByRole("button", { name: "Pumps › item 0 › count" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Optimized count" }),
    );
    place = colouredPlace(latest);
    const row = place.rows[0];
    if (row?.kind !== "template") {
      throw new Error("expected a dynamic row");
    }
    expect(row.count.optimize).toEqual({
      min: "0",
      max: "10",
      scale: "linear",
    });

    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Fixed row" }),
    );
    place = colouredPlace(latest);
    expect(place.rows[0]?.kind).toBe("fixed");
  });

  it("hides the optimized kind and moves focus with arrow keys", async () => {
    render(<Harness selection="none" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    // Without Optimize, the menu offers no optimized-count kind.
    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    await screen.findByRole("menuitemradio", { name: "Dynamic count" });
    expect(
      screen.queryByRole("menuitemradio", { name: "Optimized count" }),
    ).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });

    const first = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Pumps › item 0 › worn",
    );
  });

  it("navigates the row-kind menu with the keyboard", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    const fixed = await screen.findByRole("menuitemradio", {
      name: "Fixed row",
    });
    // Opening moves focus into the menu, onto the checked kind.
    expect(document.activeElement).toBe(fixed);

    fireEvent.keyDown(fixed, { key: "ArrowDown" });
    const dynamic = screen.getByRole("menuitemradio", {
      name: "Dynamic count",
    });
    expect(document.activeElement).toBe(dynamic);

    // Escape returns focus to the gutter without choosing.
    fireEvent.keyDown(dynamic, { key: "Escape" });
    expect(screen.queryByRole("menuitemradio", { name: "Fixed row" })).toBe(
      null,
    );
    // The refocus is deferred a tick, past the Popover teardown.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const gutter = screen.getByRole("button", { name: "Row 1 kind" });
    expect(document.activeElement).toBe(gutter);
    expect(colouredPlace(latest).rows[0]?.kind).toBe("fixed");

    // Reopen, walk to a kind, and choose it.
    fireEvent.click(gutter);
    const reopenedFixed = await screen.findByRole("menuitemradio", {
      name: "Fixed row",
    });
    fireEvent.keyDown(reopenedFixed, { key: "ArrowDown" });
    fireEvent.click(document.activeElement!);
    expect(colouredPlace(latest).rows[0]?.kind).toBe("template");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Row 1 kind" }),
    );
  });

  it("shares a column, seeding from the first row, and un-shares it back", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    const header = screen.getByRole("button", {
      name: "Share column pressure",
    });
    fireEvent.click(header);

    const place = colouredPlace(latest);
    // Fresh cells are empty, so the seeded shared value is empty too — it
    // synthesizes as the column type's neutral.
    expect(place.sharedColumns["pressure"]?.expression).toBe("");
    expect(header.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(header);
    const after = colouredPlace(latest);
    expect(after.sharedColumns["pressure"]).toBeUndefined();
    expect(after.retainedSharedColumns?.["pressure"]).toBeTruthy();
  });

  it("hides every selection toggle when selection is none", () => {
    render(<Harness selection="none" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    expect(screen.queryByText("Optimize")).toBeNull();
    expect(screen.queryByRole("switch", { name: /Optimize/ })).toBeNull();
  });

  it("offers Scenario Parameter on top-level Variables in expose mode", () => {
    let latest: AdHocScenarioState | undefined;
    const initial: AdHocScenarioState = {
      variables: [
        { name: "n", type: "integer", expression: "2", optimize: null },
      ],
      netParameters: [],
      places: {},
    };
    render(
      <Harness
        selection="expose"
        initial={initial}
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    // Expose mode marks whole Variables: no Optimize anywhere, and no
    // toggle on value slots.
    expect(screen.queryByText("Optimize")).toBe(null);
    const toggle = screen.getByRole("button", { name: "Scenario Parameter n" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(latest?.variables[0]?.exposed).toBe(true);
  });

  it("edits the uncoloured count as an expression", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue › count" }));
    const input = await screen.findByRole("textbox", { name: "Expression" });
    fireEvent.change(input, { target: { value: "parameters.rate * 4" } });

    const place = latest?.places["place-queue"];
    if (place?.kind !== "uncoloured") {
      throw new Error("expected an uncoloured place state");
    }
    expect(place.count.expression).toBe("parameters.rate * 4");
  });

  it("renders a synthesis error on the closed slot's trigger", () => {
    const initial: AdHocScenarioState = {
      variables: [],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "fixed",
              cells: [
                {
                  expression: "1",
                  optimize: { min: "nope", max: "1", scale: "linear" },
                },
                { expression: "false", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    };
    render(<Harness initial={initial} />);

    const trigger = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    expect(trigger.getAttribute("title")).toContain("nope");
  });

  it("removes the row when Delete is pressed on its gutter", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    expect(colouredPlace(latest).rows).toHaveLength(1);

    const gutter = screen.getByRole("button", { name: "Row 1 kind" });
    fireEvent.keyDown(gutter, { key: "Delete" });
    expect(colouredPlace(latest).rows).toHaveLength(0);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it("re-prints a committed expression through the format service", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <LanguageClientContext.Provider
        value={{
          ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
          requestFormatExpression: (code) =>
            Promise.resolve(code === "1+2" ? "1 + 2" : null),
        }}
      >
        <Harness
          onState={(state) => {
            latest = state;
          }}
        />
      </LanguageClientContext.Provider>,
    );

    // Materializing opens the fresh cell's editor (the mocked textarea).
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    const editor = screen.getByRole("textbox", { name: "Expression" });
    fireEvent.change(editor, { target: { value: "1+2" } });

    // Escape closes the slab; the committed text comes back formatted.
    fireEvent.keyDown(editor, { key: "Escape" });
    await waitFor(() => {
      const row = colouredPlace(latest).rows[0];
      if (row?.kind !== "fixed") {
        throw new Error("expected a fixed row");
      }
      expect(row.cells[0]?.expression).toBe("1 + 2");
    });
  });

  it("reaches the count strip and the gutter with arrow keys", () => {
    const initial: AdHocScenarioState = {
      variables: [],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "template",
              count: { expression: "3", optimize: null },
              cells: [
                { expression: "1", optimize: null },
                { expression: "false", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    };
    render(<Harness initial={initial} />);

    const cell = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Pumps › item 0 › count",
    );

    const strip = document.activeElement!;
    fireEvent.keyDown(strip, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Pumps › item 0 › pressure",
    );

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Row 1 kind",
    );
  });

  it("materializes a variable from the phantom row, name cell editing", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );
    expect(latest?.variables).toHaveLength(1);
    expect(latest?.variables[0]?.name).toBe("variable1");
    // The fresh row's name cell opens in edit mode.
    const input = screen.getByRole("textbox", {
      name: "Name of variable 1 (Top-level variables)",
    });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "altitude" } });
    expect(latest?.variables[0]?.name).toBe("altitude");
    expect(input.isConnected).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    // Escape leaves the edit; the cell renders as a selectable button again.
    expect(
      screen.getByRole("button", {
        name: "Name of variable 1 (Top-level variables)",
      }).textContent,
    ).toBe("altitude");
  });

  it("undoes and redoes edits at the form level", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    expect(colouredPlace(latest).rows).toHaveLength(1);

    const table = screen.getByRole("button", { name: "Row 1 kind" });
    fireEvent.keyDown(table, { key: "z", metaKey: true });
    expect(latest?.places["place-pumps"]).toBeUndefined();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
      { key: "z", metaKey: true, shiftKey: true },
    );
    expect(colouredPlace(latest).rows).toHaveLength(1);
  });

  it("replays identical snapshots: undo moves a cursor, redo restores the same state", () => {
    const states: AdHocScenarioState[] = [];
    render(
      <Harness
        onState={(state) => {
          states.push(state);
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    const afterRow = states.at(-1)!;
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    );
    const afterVariable = states.at(-1)!;

    // Fire on the phantom row's always-present button, freshly queried each
    // time — an unmounted node's events never reach the form's handler.
    const anywhere = () =>
      screen.getByRole("button", { name: "Add a token row (pressure)" });
    fireEvent.keyDown(anywhere(), { key: "z", metaKey: true });
    // Undo replays the exact recorded snapshot — the same object, not a
    // reconstruction from an inverse edit.
    expect(states.at(-1)).toBe(afterRow);
    fireEvent.keyDown(anywhere(), { key: "z", metaKey: true });
    expect(states.at(-1)).toBe(EMPTY_AD_HOC_STATE);
    fireEvent.keyDown(anywhere(), { key: "z", metaKey: true, shiftKey: true });
    expect(states.at(-1)).toBe(afterRow);
    fireEvent.keyDown(anywhere(), { key: "z", metaKey: true, shiftKey: true });
    expect(states.at(-1)).toBe(afterVariable);
  });

  it("coalesces a typing burst in one slot into a single undo step", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue › count" }));
    const input = await screen.findByRole("textbox", { name: "Expression" });
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.change(input, { target: { value: "421" } });
    fireEvent.keyDown(input, { key: "Escape" });

    const queueCount = () => {
      const place = latest?.places["place-queue"];
      return place?.kind === "uncoloured" ? place.count.expression : undefined;
    };
    expect(queueCount()).toBe("421");

    // One undo unwinds the whole burst — the slot's edits collapsed into one
    // step keyed by the slot, not by a timer.
    const trigger = screen.getByRole("button", { name: "Queue › count" });
    fireEvent.keyDown(trigger, { key: "z", metaKey: true });
    expect(latest?.places["place-queue"]).toBeUndefined();
    fireEvent.keyDown(trigger, { key: "z", metaKey: true, shiftKey: true });
    expect(queueCount()).toBe("421");
  });

  it("walks between zones and toggles sections from their headers", async () => {
    render(<Harness />);

    // Variables lead the form; down from the parameters grid (one row)
    // lands on the Initial state section header.
    const rateValue = screen.getByRole("button", { name: "Rate" });
    rateValue.focus();
    fireEvent.keyDown(rateValue, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Toggle Initial state section" }),
    );

    // Up from the parameters grid reaches its header, then the variables
    // grid, then the Variables header.
    rateValue.focus();
    fireEvent.keyDown(rateValue, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Toggle Parameters section" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Add a variable (Top-level variables)",
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    const variablesTrigger = screen.getByRole("button", {
      name: "Toggle Variables section",
    });
    expect(document.activeElement).toBe(variablesTrigger);

    // Left collapses the section; its grid leaves the accessibility tree,
    // and Down now skips it, landing on the Parameters header.
    fireEvent.keyDown(variablesTrigger, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Add a variable (Top-level variables)",
        }),
      ).toBe(null);
    });
    fireEvent.keyDown(variablesTrigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Toggle Parameters section" }),
    );

    // Right expands it again.
    fireEvent.keyDown(variablesTrigger, { key: "ArrowRight" });
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Add a variable (Top-level variables)",
        }),
      ).toBeTruthy();
    });
  });

  it("reaches the column headers and collapses a place to a summary", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    // Up from the first row's cell lands on its column header.
    const cell = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    cell.focus();
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    const header = screen.getByRole("button", {
      name: "Share column pressure",
    });
    expect(document.activeElement).toBe(header);

    // Up from the header leaves the table onto the place's variables line,
    // then the place header.
    fireEvent.keyDown(header, { key: "ArrowUp" });
    const placePhantom = screen.getByRole("button", {
      name: "Add a variable (Variables of Pumps)",
    });
    expect(document.activeElement).toBe(placePhantom);
    fireEvent.keyDown(placePhantom, { key: "ArrowUp" });
    const placeHeader = screen.getByRole("button", { name: "Pumps place" });
    expect(document.activeElement).toBe(placeHeader);

    // Left collapses the place to a one-line summary; the content stays
    // mounted (the collapse animates and turns inert). Right restores it.
    fireEvent.keyDown(placeHeader, { key: "ArrowLeft" });
    expect(screen.getByText("1 row · 1 tokens")).toBeTruthy();
    expect(placeHeader.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(placeHeader, { key: "ArrowRight" });
    expect(placeHeader.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Share column pressure" }),
    ).toBeTruthy();
  });

  it("navigates through the type select, which offers no empty row", () => {
    const initial: AdHocScenarioState = {
      variables: [
        { name: "altitude", type: "real", expression: "400", optimize: null },
      ],
      netParameters: [],
      places: {},
    };
    render(<Harness initial={initial} />);

    const nameCell = screen.getByRole("button", {
      name: "Name of variable 1 (Top-level variables)",
    });
    nameCell.focus();
    fireEvent.keyDown(nameCell, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Type of altitude",
    );

    // The native select mirrors the dropdown: three types, no empty item.
    const nativeSelect = document.querySelector("select");
    expect(nativeSelect?.options.length).toBe(3);

    // The trailing add-a-variable line is one cell, reachable with
    // ArrowDown from any column of the row above it.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Add a variable (Top-level variables)",
    );
  });

  it("deletes rows and variables from the gutter menus", async () => {
    let latest: AdHocScenarioState | undefined;
    const initial: AdHocScenarioState = {
      variables: [
        { name: "n", type: "integer", expression: "2", optimize: null },
      ],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [{ kind: "fixed", cells: [] }],
          sharedColumns: {},
        },
      },
    };
    render(
      <Harness
        initial={initial}
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    // The token gutter's menu carries Delete row.
    fireEvent.click(screen.getByRole("button", { name: "Row 1 kind" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete row" }),
    );
    expect(colouredPlace(latest).rows).toHaveLength(0);

    // The variable gutter's menu deletes the variable.
    fireEvent.click(screen.getByRole("button", { name: "Variable 1 actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete variable" }),
    );
    expect(latest?.variables).toHaveLength(0);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // Focus lands on the add-a-variable line once nothing is left.
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Add a variable (Top-level variables)",
    );
  });

  it("highlights dependencies and dependents around the focused value", () => {
    const initial: AdHocScenarioState = {
      variables: [
        { name: "n", type: "integer", expression: "2", optimize: null },
      ],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "fixed",
              cells: [
                { expression: "2 * scenario.n", optimize: null },
                { expression: "false", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    };
    render(<Harness initial={initial} />);

    // Focusing the cell highlights the variable row its expression reads.
    const cell = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    const nameCell = screen.getByRole("button", {
      name: "Name of variable 1 (Top-level variables)",
    });
    fireEvent.focus(cell);
    expect(nameCell.closest("tr")?.getAttribute("data-highlighted")).toBe(
      "true",
    );

    // Focusing the variable highlights the cell that reads it.
    fireEvent.focus(nameCell);
    expect(cell.getAttribute("data-highlighted")).toBe("true");
    expect(nameCell.closest("tr")?.getAttribute("data-highlighted")).toBe(null);
  });

  it("edits optimize bounds as selectable expression cells", async () => {
    let latest: AdHocScenarioState | undefined;
    const initial: AdHocScenarioState = {
      variables: [
        {
          name: "n",
          type: "integer",
          expression: "2",
          optimize: { min: "0", max: "10", step: "1", scale: "linear" },
        },
      ],
      netParameters: [],
      places: {},
    };
    render(
      <Harness
        initial={initial}
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    // A keyboard click opens the slab; the Min cell arrives selected, and
    // the bounds show their labels.
    fireEvent.click(screen.getByRole("button", { name: "n" }));
    const minCell = await screen.findByRole("button", { name: "Min of n" });
    expect(document.activeElement).toBe(minCell);
    expect(screen.getByText("Scale")).toBeTruthy();

    // Arrows move between the bound cells; Enter opens the expression
    // editor in place (no per-cell path or Optimize chrome).
    fireEvent.keyDown(minCell, { key: "ArrowRight" });
    const maxCell = screen.getByRole("button", { name: "Max of n" });
    expect(document.activeElement).toBe(maxCell);
    fireEvent.click(maxCell);
    const editor = await screen.findByRole("textbox", { name: "Expression" });
    fireEvent.change(editor, { target: { value: "scenario.other" } });
    expect(latest?.variables[0]?.optimize?.max).toBe("scenario.other");

    // Escape peels one layer: first back to the selected cell...
    fireEvent.keyDown(editor, { key: "Escape" });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Max of n" }),
    );
    expect(screen.getByText("Scale")).toBeTruthy();

    // ...then the whole slab.
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByText("Scale")).toBe(null);
  });

  it("selects on pointer click and opens the menu from the dots", async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );

    // A pointer click (detail 1) selects without opening the menu.
    const gutter = screen.getByRole("button", { name: "Row 1 kind" });
    fireEvent.click(gutter, { detail: 1 });
    expect(screen.queryByRole("menuitemradio", { name: "Fixed row" })).toBe(
      null,
    );

    // The dots affordance opens it.
    fireEvent.click(screen.getByRole("button", { name: "Row 1 menu" }));
    expect(
      await screen.findByRole("menuitemradio", { name: "Fixed row" }),
    ).toBeTruthy();
  });

  it("highlights a whole row's connections from its gutter", () => {
    const initial: AdHocScenarioState = {
      variables: [
        { name: "n", type: "integer", expression: "2", optimize: null },
      ],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "fixed",
              cells: [
                { expression: "2 * scenario.n", optimize: null },
                { expression: "false", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    };
    render(<Harness initial={initial} />);

    // The token row's gutter highlights everything its cells read.
    const rowGutter = screen.getByRole("button", { name: "Row 1 kind" });
    fireEvent.focus(rowGutter);
    const nameCell = screen.getByRole("button", {
      name: "Name of variable 1 (Top-level variables)",
    });
    expect(nameCell.closest("tr")?.getAttribute("data-highlighted")).toBe(
      "true",
    );

    // The variable row's gutter highlights the cells that read it.
    fireEvent.focus(screen.getByRole("button", { name: "Variable 1 actions" }));
    expect(
      screen
        .getByRole("button", { name: "Pumps › item 0 › pressure" })
        .getAttribute("data-highlighted"),
    ).toBe("true");
  });

  it("creates entries from the add-line gutters", () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a token row" }));
    expect(colouredPlace(latest).rows).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable from the gutter (Top-level variables)",
      }),
    );
    expect(latest?.variables).toHaveLength(1);
  });

  it("shows the place total, unresolved when a count is optimized", () => {
    const initial: AdHocScenarioState = {
      variables: [],
      netParameters: [],
      places: {
        "place-pumps": {
          kind: "coloured",
          variables: [],
          rows: [
            { kind: "fixed", cells: [] },
            {
              kind: "template",
              count: {
                expression: "4",
                optimize: { min: "0", max: "10", scale: "linear" },
              },
              cells: [],
            },
          ],
          sharedColumns: {},
        },
      },
    };
    render(<Harness initial={initial} />);
    expect(screen.getByText("1 + 0 … 10 tokens")).toBeTruthy();
  });

  it("hides the Variables section when the embedding offers none", () => {
    render(<Harness withVariables={false} />);
    expect(
      screen.queryByRole("button", {
        name: "Add a variable (Top-level variables)",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Toggle Variables section" }),
    ).toBeNull();
    // The other groups are untouched.
    expect(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    ).toBeTruthy();
  });
});
