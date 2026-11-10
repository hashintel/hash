/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectedRowCellStyle } from "../../../../../../components/spreadsheet-kit/form-table";
import { TypePropertiesContext } from "../context";
import { DimensionsTable } from "./dimensions-table";

import type { TypePropertiesContextValue } from "../context";
import type { Color } from "@hashintel/petrinaut-core";

afterEach(cleanup);

// The select's positioner observes its anchor; jsdom has no observer.
if (typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    value: ResizeObserverStub,
    configurable: true,
  });
}

const satellite: Color = {
  id: "satellite",
  name: "Satellite",
  iconSlug: "circle",
  displayColor: "#3366ff",
  elements: [
    { elementId: "x", name: "x", type: "real" },
    { elementId: "v", name: "velocity", type: "real" },
  ],
};

/** Applies the element mutations to local state, the way the net does. */
const Harness = ({
  type: initialType = satellite,
  readOnly = false,
  onType,
}: {
  type?: Color;
  readOnly?: boolean;
  onType?: (type: Color) => void;
}) => {
  const [type, setType] = useState(initialType);
  onType?.(type);

  const value: TypePropertiesContextValue = {
    type,
    updateType: vi.fn(),
    addTypeElement: ({ element }) =>
      setType((current) => ({
        ...current,
        elements: [...current.elements, element],
      })),
    updateTypeElement: ({ elementId, update }) =>
      setType((current) => ({
        ...current,
        elements: current.elements.map((element) =>
          element.elementId === elementId ? { ...element, ...update } : element,
        ),
      })),
    removeTypeElement: ({ elementId }) =>
      setType((current) => ({
        ...current,
        elements: current.elements.filter(
          (element) => element.elementId !== elementId,
        ),
      })),
    moveTypeElement: ({ elementId, toIndex }) =>
      setType((current) => {
        const elements = [...current.elements];
        const from = elements.findIndex(
          (element) => element.elementId === elementId,
        );
        const [moved] = elements.splice(from, 1);
        elements.splice(toIndex, 0, moved!);
        return { ...current, elements };
      }),
  };

  return (
    <TypePropertiesContext value={value}>
      <DimensionsTable readOnly={readOnly} />
    </TypePropertiesContext>
  );
};

const nameCell = (row: number) =>
  screen.getByRole("button", { name: `Name of dimension ${row}` });

const gutter = (row: number) =>
  screen.getByRole("button", { name: `Dimension ${row} actions` });

const listedNames = () =>
  screen
    .getAllByRole("button", { name: /^Name of dimension/ })
    .map((cell) => cell.textContent);

/** Opens the name editor with a keyboard click and types a new name. */
const typeName = (row: number, text: string) => {
  fireEvent.click(nameCell(row));
  const input = screen.getByRole("textbox", {
    name: `Name of dimension ${row}`,
  });
  fireEvent.change(input, { target: { value: text } });
  return input;
};

describe("Dimensions table", () => {
  it("lists the dimensions in order", () => {
    render(<Harness />);
    expect(listedNames()).toEqual(["x", "velocity"]);
  });

  it("adds a dimension from the trailing line and opens its name", () => {
    let latest: Color | undefined;
    render(
      <Harness
        onType={(type) => {
          latest = type;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a dimension" }));
    expect(latest?.elements.at(-1)).toMatchObject({
      name: "dimension_1",
      type: "real",
    });
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Name of dimension 3",
    });
    fireEvent.change(input, { target: { value: "Mass" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(latest?.elements.at(-1)?.name).toBe("mass");
  });

  it("commits a typed name as an identifier and refuses a taken one", () => {
    let latest: Color | undefined;
    render(
      <Harness
        onType={(type) => {
          latest = type;
        }}
      />,
    );
    fireEvent.keyDown(typeName(1, "Position X"), { key: "Enter" });
    expect(latest?.elements.map((element) => element.name)).toEqual([
      "position_x",
      "velocity",
    ]);

    const input = typeName(2, "Position X");
    expect(input.title).toBe("Another dimension is already named position_x");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(latest?.elements[1]?.name).toBe("velocity");
    expect(listedNames()).toEqual(["position_x", "velocity"]);
  });

  it("drops the draft on Escape", () => {
    let latest: Color | undefined;
    render(
      <Harness
        onType={(type) => {
          latest = type;
        }}
      />,
    );
    const input = typeName(1, "Something else");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(latest?.elements[0]?.name).toBe("x");
    expect(listedNames()).toEqual(["x", "velocity"]);
  });

  it("moves a row with Alt and an arrow, focus travelling with it", () => {
    let latest: Color | undefined;
    render(
      <Harness
        onType={(type) => {
          latest = type;
        }}
      />,
    );
    const first = gutter(1);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(latest?.elements.map((element) => element.name)).toEqual([
      "velocity",
      "x",
    ]);
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("aria-label")).toBe("Dimension 2 actions");
    // The row highlight follows the moved row.
    expect(first.closest("td")?.className).toContain(selectedRowCellStyle);
    expect(gutter(1).closest("td")?.className).not.toContain(
      selectedRowCellStyle,
    );

    // Past the edge nothing moves.
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(latest?.elements.map((element) => element.name)).toEqual([
      "velocity",
      "x",
    ]);
  });

  it("deletes from the gutter, never the last dimension", () => {
    let latest: Color | undefined;
    render(
      <Harness
        onType={(type) => {
          latest = type;
        }}
      />,
    );
    fireEvent.keyDown(gutter(1), { key: "Delete" });
    expect(latest?.elements.map((element) => element.name)).toEqual([
      "velocity",
    ]);
    fireEvent.keyDown(gutter(1), { key: "Delete" });
    expect(latest?.elements).toHaveLength(1);
  });

  it("offers no editing when read-only", () => {
    render(<Harness readOnly />);
    expect(
      screen.queryByRole("button", { name: "Add a dimension" }),
    ).toBeNull();
    fireEvent.click(nameCell(1));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(listedNames()).toEqual(["x", "velocity"]);
  });
});
