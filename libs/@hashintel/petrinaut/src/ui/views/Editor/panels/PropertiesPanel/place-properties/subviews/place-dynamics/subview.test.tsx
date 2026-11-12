/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveNetContext } from "../../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../../react/state/editor-context";
import { selectedRowCellStyle } from "../../../../../../../components/spreadsheet-kit/form-table";
import { PlacePropertiesProvider } from "../../context";
import { placeDynamicsSubView } from "./subview";

import type {
  Color,
  DifferentialEquation,
  Place,
  SelectionItem,
} from "@hashintel/petrinaut-core";

afterEach(cleanup);

// The menu's positioner observes its anchor; jsdom has no observer.
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
  elements: [{ elementId: "x", name: "x", type: "real" }],
};

const equations: DifferentialEquation[] = [
  { id: "orbit", name: "Orbit", colorId: "satellite", code: "", arity: 1 },
  { id: "pull", name: "Pull", colorId: "satellite", code: "", arity: 2 },
  { id: "drag", name: "Drag", colorId: "satellite", code: "", arity: 1 },
  { id: "rock", name: "Rock", colorId: "rock", code: "", arity: 1 },
];

const initialPlace: Place = {
  id: "space",
  name: "Space",
  colorId: "satellite",
  dynamicsEnabled: true,
  dynamics: [
    { differentialEquationId: "orbit" },
    { differentialEquationId: "pull" },
  ],
  x: 0,
  y: 0,
};

const Content = placeDynamicsSubView.component;

const Harness = ({
  place: startingPlace = initialPlace,
  equations: netEquations = equations,
  readOnly = false,
  selectItem = vi.fn(),
  onPlace,
}: {
  place?: Place;
  equations?: DifferentialEquation[];
  readOnly?: boolean;
  selectItem?: (item: SelectionItem) => void;
  onPlace?: (place: Place) => void;
}) => {
  const editorDefaults = use(EditorContext);
  const activeNetDefaults = use(ActiveNetContext);
  const [place, setPlace] = useState(startingPlace);
  onPlace?.(place);

  return (
    <EditorContext value={{ ...editorDefaults, selectItem }}>
      <ActiveNetContext
        value={{
          ...activeNetDefaults,
          activeNet: {
            ...activeNetDefaults.activeNet,
            types: [satellite],
            differentialEquations: netEquations,
          },
        }}
      >
        <PlacePropertiesProvider
          place={place}
          placeType={satellite}
          types={[satellite]}
          isReadOnly={readOnly}
          updatePlace={({ update }) =>
            setPlace((currentPlace) => ({ ...currentPlace, ...update }))
          }
        >
          {placeDynamicsSubView.renderHeaderAction?.()}
          <Content />
        </PlacePropertiesProvider>
      </ActiveNetContext>
    </EditorContext>
  );
};

/** The composed equations' names, top to bottom. */
const listedNames = () =>
  screen
    .getAllByRole("button", { name: /^Open (Orbit|Pull|Drag)$/ })
    .map((cell) => cell.textContent);

const gutter = (row: number) =>
  screen.getByRole("button", { name: `Equation ${row} actions` });

const listedIds = (place: Place | undefined) =>
  place?.dynamics?.map((term) => term.differentialEquationId);

// The design-system Toggle labels its root, so its hidden input is the one
// unnamed checkbox in this harness.
const dynamicsSwitch = () => screen.getByRole<HTMLInputElement>("checkbox");

describe("Dynamics subview", () => {
  it("lists the composed equations in order with how many tokens each couples", () => {
    render(<Harness />);
    expect(listedNames()).toEqual(["Orbit", "Pull"]);
    expect(screen.getByText("1 token")).toBeDefined();
    expect(screen.getByText("2 tokens")).toBeDefined();
  });

  it("moves a row with Alt and an arrow, focus travelling with it", () => {
    let latest: Place | undefined;
    render(
      <Harness
        onPlace={(place) => {
          latest = place;
        }}
      />,
    );
    const first = gutter(1);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(listedNames()).toEqual(["Pull", "Orbit"]);
    expect(listedIds(latest)).toEqual(["pull", "orbit"]);
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute("aria-label")).toBe("Equation 2 actions");
    // The row highlight follows the moved row.
    expect(first.closest("td")?.className).toContain(selectedRowCellStyle);
    expect(gutter(1).closest("td")?.className).not.toContain(
      selectedRowCellStyle,
    );
  });

  it("opens an equation from its name and removes one from the gutter", () => {
    const selectItem = vi.fn();
    let latest: Place | undefined;
    render(
      <Harness
        selectItem={selectItem}
        onPlace={(place) => {
          latest = place;
        }}
      />,
    );
    // A keyboard click carries no pointer detail and activates at once.
    fireEvent.click(screen.getByRole("button", { name: "Open Pull" }));
    expect(selectItem).toHaveBeenLastCalledWith({
      type: "differentialEquation",
      id: "pull",
    });

    fireEvent.keyDown(gutter(1), { key: "Delete" });
    expect(listedNames()).toEqual(["Pull"]);
    expect(listedIds(latest)).toEqual(["pull"]);
  });

  it("shows whether the place's dynamics run from the header switch", () => {
    // Driving the design-system switch is its own concern; the switch
    // mirrors `dynamicsEnabled` and the list says when it is off.
    const { unmount } = render(<Harness />);
    expect(dynamicsSwitch().checked).toBe(true);
    expect(screen.queryByText(/switched off/)).toBeNull();
    unmount();

    render(<Harness place={{ ...initialPlace, dynamicsEnabled: false }} />);
    expect(dynamicsSwitch().checked).toBe(false);
    expect(screen.getByText(/switched off/)).toBeDefined();
    expect(listedNames()).toEqual(["Orbit", "Pull"]);
  });

  it("adds one of the colour's remaining equations from the trailing line", async () => {
    let latest: Place | undefined;
    render(
      <Harness
        place={{
          ...initialPlace,
          dynamics: [{ differentialEquationId: "orbit" }],
        }}
        onPlace={(place) => {
          latest = place;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add an equation" }));
    await screen.findByRole("menuitem", { name: "Pull · 2 tokens" });
    expect(
      screen.getByRole("menuitem", { name: "Drag · 1 token" }),
    ).toBeDefined();
    // Composed and other-colour equations are not offered.
    expect(screen.queryByRole("menuitem", { name: /Orbit/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Rock/ })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Drag · 1 token" }));
    expect(listedIds(latest)).toEqual(["orbit", "drag"]);
    expect(listedNames()).toEqual(["Orbit", "Drag"]);
  });

  it("drops the trailing line once every equation of the colour is composed", () => {
    render(
      <Harness
        place={{
          ...initialPlace,
          dynamics: [
            { differentialEquationId: "orbit" },
            { differentialEquationId: "pull" },
            { differentialEquationId: "drag" },
          ],
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add an equation" }),
    ).toBeNull();
    expect(listedNames()).toEqual(["Orbit", "Pull", "Drag"]);
  });

  it("asks for a type before any equation", () => {
    render(
      <Harness place={{ ...initialPlace, colorId: null, dynamics: [] }} />,
    );
    expect(dynamicsSwitch().disabled).toBe(true);
    expect(screen.getByText(/Select a token type/)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Add an equation" }),
    ).toBeNull();
  });

  it("points at the sidebar when the type has no equations", () => {
    render(
      <Harness
        place={{ ...initialPlace, dynamics: [] }}
        equations={[equations[3]!]}
      />,
    );
    expect(screen.getByText(/has no equations yet/)).toBeDefined();
  });

  it("keeps the list read-only while still opening equations", () => {
    const selectItem = vi.fn();
    let latest: Place | undefined;
    render(
      <Harness
        readOnly
        selectItem={selectItem}
        onPlace={(place) => {
          latest = place;
        }}
      />,
    );
    expect(dynamicsSwitch().disabled).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Add an equation" }),
    ).toBeNull();

    const first = gutter(1);
    fireEvent.keyDown(first, { key: "Delete" });
    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });
    expect(listedIds(latest)).toEqual(["orbit", "pull"]);

    fireEvent.click(screen.getByRole("button", { name: "Open Orbit" }));
    expect(selectItem).toHaveBeenLastCalledWith({
      type: "differentialEquation",
      id: "orbit",
    });
  });
});
