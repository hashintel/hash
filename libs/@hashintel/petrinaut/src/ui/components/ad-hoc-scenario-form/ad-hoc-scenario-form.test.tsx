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

import { AdHocScenarioForm } from "./ad-hoc-scenario-form";
import { EMPTY_AD_HOC_STATE } from "./state";

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
  optimizable: boolean;
  onState?: (state: AdHocScenarioState) => void;
  initial?: AdHocScenarioState;
}> = ({ optimizable, onState, initial = EMPTY_AD_HOC_STATE }) => {
  const [state, setState] = useState(initial);
  return (
    <AdHocScenarioForm
      state={state}
      onChange={(next) => {
        setState(next);
        onState?.(next);
      }}
      context={context}
      optimizable={optimizable}
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
        optimizable
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

  it("selects a row's kind from the gutter menu", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
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
    render(<Harness optimizable={false} />);
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
        optimizable
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
        optimizable
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
    expect(place.sharedColumns["pressure"]?.expression).toBe("0");
    expect(header.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(header);
    const after = colouredPlace(latest);
    expect(after.sharedColumns["pressure"]).toBeUndefined();
    expect(after.retainedSharedColumns?.["pressure"]).toBeTruthy();
  });

  it("hides every Optimize control when optimizable is off", () => {
    render(<Harness optimizable={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a token row (pressure)" }),
    );
    expect(screen.queryByText("Optimize")).toBeNull();
    expect(screen.queryByRole("switch", { name: /Optimize/ })).toBeNull();
  });

  it("edits the uncoloured count as an expression", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
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
    render(<Harness optimizable initial={initial} />);

    const trigger = screen.getByRole("button", {
      name: "Pumps › item 0 › pressure",
    });
    expect(trigger.getAttribute("title")).toContain("nope");
  });

  it("removes the row when Delete is pressed on its gutter", async () => {
    let latest: AdHocScenarioState | undefined;
    render(
      <Harness
        optimizable
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
    render(<Harness optimizable initial={initial} />);

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
        optimizable
        onState={(state) => {
          latest = state;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add a variable (name, Top-level variables)",
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
        optimizable
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

  it("walks between zones and toggles sections from their headers", async () => {
    render(<Harness optimizable />);

    // Down from the parameters grid lands on the Variables section header.
    const rateValue = screen.getByRole("button", { name: "Rate" });
    rateValue.focus();
    fireEvent.keyDown(rateValue, { key: "ArrowDown" });
    const variablesTrigger = screen.getByRole("button", {
      name: "Toggle Variables section",
    });
    expect(document.activeElement).toBe(variablesTrigger);

    // Down enters the variables grid; Up returns to the header.
    fireEvent.keyDown(variablesTrigger, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Add a variable (name, Top-level variables)",
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(variablesTrigger);

    // Left collapses the section; its grid leaves the accessibility tree,
    // and Down now skips it, landing on the Initial state header.
    fireEvent.keyDown(variablesTrigger, { key: "ArrowLeft" });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Add a variable (name, Top-level variables)",
        }),
      ).toBe(null);
    });
    fireEvent.keyDown(variablesTrigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Toggle Initial state section" }),
    );

    // Right expands it again.
    fireEvent.keyDown(variablesTrigger, { key: "ArrowRight" });
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Add a variable (name, Top-level variables)",
        }),
      ).toBeTruthy();
    });
  });

  it("reaches the column headers and collapses a place to a summary", () => {
    render(<Harness optimizable />);
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

    // Up from the header leaves the table onto the place header.
    fireEvent.keyDown(header, { key: "ArrowUp" });
    const placeHeader = screen.getByRole("button", { name: "Pumps place" });
    expect(document.activeElement).toBe(placeHeader);

    // Left collapses the place to a one-line summary; Right restores it.
    fireEvent.keyDown(placeHeader, { key: "ArrowLeft" });
    expect(screen.getByText("1 row · = 1 tokens")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Share column pressure" }),
    ).toBe(null);
    fireEvent.keyDown(placeHeader, { key: "ArrowRight" });
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
    render(<Harness optimizable initial={initial} />);

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
    render(<Harness optimizable initial={initial} />);

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
    render(<Harness optimizable initial={initial} />);
    expect(screen.getByText("= 1 + 0 … 10 tokens")).toBeTruthy();
  });
});
