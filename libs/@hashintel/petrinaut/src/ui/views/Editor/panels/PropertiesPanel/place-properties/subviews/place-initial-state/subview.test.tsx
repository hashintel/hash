/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { SimulationContext } from "../../../../../../../../react/simulation/context";
import { PlacePropertiesProvider } from "../../context";
import { placeInitialStateSubView } from "./subview";

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
  differentialEquationId: null,
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
const StateContent = placeInitialStateSubView.component;

const Harness = ({
  typed,
  selectedScenarioId,
}: {
  typed: boolean;
  selectedScenarioId: string | null;
}) => {
  const simulationDefaults = use(SimulationContext);
  return (
    <SimulationContext
      value={{
        ...simulationDefaults,
        selectedScenarioId,
        initialMarking: { [place.id]: typed ? [{ value: 42 }] : 3 },
      }}
    >
      <PlacePropertiesProvider
        place={place}
        placeType={typed ? color : null}
        types={[color]}
        isReadOnly={false}
        updatePlace={vi.fn()}
      >
        {placeInitialStateSubView.renderHeaderAction?.()}
        <StateContent />
      </PlacePropertiesProvider>
    </SimulationContext>
  );
};

it.each([null, "scenario-1"])(
  "keeps typed state read-only with scenario %s",
  (selectedScenarioId) => {
    render(<Harness typed selectedScenarioId={selectedScenarioId} />);
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-readonly")).toBe("true");
    expect(grid.textContent).toBe("[[42]]");
    expect(screen.queryByRole("button", { name: "Clear state" })).toBeNull();
  },
);

it.each([null, "scenario-1"])(
  "keeps untyped state read-only with scenario %s",
  (selectedScenarioId) => {
    render(<Harness typed={false} selectedScenarioId={selectedScenarioId} />);
    const input = screen.getByRole<HTMLInputElement>("spinbutton");
    expect(input.disabled).toBe(true);
    expect(input.value).toBe("3");
    expect(screen.queryByRole("button", { name: "Clear state" })).toBeNull();
  },
);
