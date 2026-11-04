/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveNetContext } from "../../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../../react/state/editor-context";
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
  readOnly = false,
  selectItem = vi.fn(),
  onPlace,
}: {
  place?: Place;
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
            differentialEquations: equations,
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

const listedNames = () =>
  screen
    .getAllByRole("listitem")
    .map((item) => item.querySelector("span")?.textContent);

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

  it("reorders, removes and opens a term", () => {
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

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Move Orbit up" })
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move Orbit down" }));
    expect(listedNames()).toEqual(["Pull", "Orbit"]);
    expect(latest?.dynamics).toEqual([
      { differentialEquationId: "pull" },
      { differentialEquationId: "orbit" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "View Pull" }));
    expect(selectItem).toHaveBeenLastCalledWith({
      type: "differentialEquation",
      id: "pull",
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Orbit" }));
    expect(listedNames()).toEqual(["Pull"]);
    expect(latest?.dynamics).toEqual([{ differentialEquationId: "pull" }]);
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

  it("offers the colour's equations that are not composed yet", async () => {
    // Selecting an entry is the design-system menu's job, which jsdom cannot
    // drive; what the entry does is `addTerm`, tested with the transitions.
    render(<Harness place={{ ...initialPlace, dynamics: [] }} />);
    expect(screen.getByText(/No equations yet/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Add equation" }));
    await screen.findByRole("menuitem", { name: "Orbit · 1 token" });
    expect(
      screen.getByRole("menuitem", { name: "Pull · 2 tokens" }),
    ).toBeDefined();
    expect(
      screen.getByRole("menuitem", { name: "Drag · 1 token" }),
    ).toBeDefined();
    // The other colour's equation is not offered.
    expect(screen.queryByRole("menuitem", { name: /Rock/ })).toBeNull();
  });

  it("disables adding once every equation of the colour is composed", () => {
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
      screen.getByRole<HTMLButtonElement>("button", { name: "Add equation" })
        .disabled,
    ).toBe(true);
  });

  it("asks for a type before any equation", () => {
    render(
      <Harness place={{ ...initialPlace, colorId: null, dynamics: [] }} />,
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Add equation" })
        .disabled,
    ).toBe(true);
    expect(dynamicsSwitch().disabled).toBe(true);
    expect(screen.getByText(/Select a token type/)).toBeDefined();
  });

  it("keeps every control read-only", () => {
    render(<Harness readOnly />);
    for (const name of [
      "Add equation",
      "Move Orbit down",
      "Remove Orbit",
      "Remove Pull",
    ]) {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name }).disabled,
      ).toBe(true);
    }
    expect(dynamicsSwitch().disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "View Orbit" })
        .disabled,
    ).toBe(false);
  });
});
