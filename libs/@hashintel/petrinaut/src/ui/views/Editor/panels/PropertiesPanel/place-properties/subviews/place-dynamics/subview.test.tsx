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
  { id: "orbit", name: "Orbit", colorId: "satellite", code: "" },
  { id: "pull", name: "Pull", colorId: "satellite", code: "", arity: 2 },
  { id: "drag", name: "Drag", colorId: "satellite", code: "", arity: 1 },
  { id: "rock", name: "Rock", colorId: "rock", code: "" },
];

const initialPlace: Place = {
  id: "space",
  name: "Space",
  colorId: "satellite",
  dynamicsEnabled: true,
  differentialEquationId: "orbit",
  dynamics: [
    { differentialEquationId: "pull" },
    { differentialEquationId: "drag" },
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

describe("Composed dynamics subview", () => {
  it("lists the composed equations in order with how they see tokens", () => {
    render(<Harness />);
    expect(listedNames()).toEqual(["Pull", "Drag"]);
    expect(screen.getByText("2 tokens")).toBeDefined();
    expect(screen.getByText("1 token")).toBeDefined();
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
      screen.getByRole<HTMLButtonElement>("button", { name: "Move Pull up" })
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move Pull down" }));
    expect(listedNames()).toEqual(["Drag", "Pull"]);
    expect(latest?.dynamics).toEqual([
      { differentialEquationId: "drag" },
      { differentialEquationId: "pull" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "View Pull" }));
    expect(selectItem).toHaveBeenLastCalledWith({
      type: "differentialEquation",
      id: "pull",
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Drag" }));
    expect(listedNames()).toEqual(["Pull"]);
    expect(latest?.dynamics).toEqual([{ differentialEquationId: "pull" }]);
  });

  it("offers the colour's equations that are not composed yet", async () => {
    // Selecting an entry is the design-system menu's job, which jsdom cannot
    // drive; what the entry does is `addTerm`, tested with the transitions.
    render(<Harness place={{ ...initialPlace, dynamics: [] }} />);
    expect(screen.getByText(/No further equations/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Add equation" }));
    await screen.findByRole("menuitem", { name: "Pull · 2 tokens" });
    expect(
      screen.getByRole("menuitem", { name: "Drag · 1 token" }),
    ).toBeDefined();
    // The selected equation and the other colour's are not offered.
    expect(screen.queryByRole("menuitem", { name: /Orbit/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Rock/ })).toBeNull();
  });

  it("disables adding once every equation of the colour is composed", () => {
    render(
      <Harness
        place={{
          ...initialPlace,
          dynamics: [
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

  it("keeps every control read-only", () => {
    render(<Harness readOnly />);
    for (const name of [
      "Add equation",
      "Move Pull down",
      "Remove Pull",
      "Remove Drag",
    ]) {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name }).disabled,
      ).toBe(true);
    }
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "View Pull" })
        .disabled,
    ).toBe(false);
  });
});
