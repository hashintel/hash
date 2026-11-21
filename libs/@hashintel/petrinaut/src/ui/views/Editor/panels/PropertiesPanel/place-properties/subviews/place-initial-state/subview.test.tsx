/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { PlacePropertiesContext } from "../../context";
import { PlaceInitialStateContent } from "./subview";

import type { Color, Place } from "@hashintel/petrinaut-core";

afterEach(cleanup);

vi.mock("../../../../../../../components/spreadsheet", () => ({
  Spreadsheet: ({ data, onChange }: { data: unknown; onChange?: unknown }) => (
    <div role="grid" aria-readonly={onChange === undefined}>
      {JSON.stringify(data)}
    </div>
  ),
}));

const place: Place = {
  id: "place-1",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const color: Color = {
  id: "type-1",
  name: "Item",
  iconSlug: "circle",
  displayColor: "#3366ff",
  elements: [{ elementId: "value", name: "value", type: "real" }],
};

const Harness = ({ typed }: { typed: boolean }) => {
  const simulationDefaults = use(SimulationContext);
  return (
    <SimulationContext
      value={{
        ...simulationDefaults,
        initialMarking: { [place.id]: typed ? [{ value: 42 }] : 3 },
      }}
    >
      <PlacePropertiesContext
        value={{ place, placeType: typed ? color : null, types: [color] }}
      >
        <PlaceInitialStateContent />
      </PlacePropertiesContext>
    </SimulationContext>
  );
};

it("shows the tokens of a typed place read-only", () => {
  render(<Harness typed />);
  const grid = screen.getByRole("grid");
  expect(grid.getAttribute("aria-readonly")).toBe("true");
  expect(grid.textContent).toBe("[[42]]");
});

it("shows the token count of an untyped place read-only", () => {
  render(<Harness typed={false} />);
  const input = screen.getByRole<HTMLInputElement>("spinbutton");
  expect(input.disabled).toBe(true);
  expect(input.value).toBe("3");
});
