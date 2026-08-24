/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
