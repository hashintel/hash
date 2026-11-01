import { describe, expect, it } from "vitest";

import { isPetrinautId } from "../petrinaut-id";
import {
  instantiateLibraryComponent,
  libraryComponentSubnetId,
  type LibraryComponent,
} from "./component-library";

const queue: LibraryComponent = {
  id: "queue",
  name: "Queue",
  template: {
    name: "Queue",
    description: "Holds items until they are taken.",
    parameters: [
      {
        id: "rate",
        name: "Rate",
        variableName: "rate",
        type: "real",
        defaultValue: "1",
      },
    ],
    types: [
      {
        id: "item",
        name: "Item",
        iconSlug: "circle",
        displayColor: "#000",
        elements: [{ elementId: "w", name: "weight", type: "real" }],
      },
    ],
    differentialEquations: [],
    places: [
      {
        id: "in",
        name: "In",
        colorId: "item",
        dynamicsEnabled: false,
        differentialEquationId: null,
        isPort: true,
        x: 0,
        y: 0,
      },
      {
        id: "out",
        name: "Out",
        colorId: "item",
        dynamicsEnabled: false,
        differentialEquationId: null,
        isPort: true,
        x: 100,
        y: 0,
      },
    ],
    transitions: [
      {
        id: "move",
        name: "Move",
        inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
        outputArcs: [
          { endpoint: { kind: "place", placeId: "out" }, weight: 1 },
        ],
        lambdaType: "stochastic",
        lambdaCode: "return parameters.rate;",
        transitionKernelCode: "return { Out: input.In };",
        x: 50,
        y: 0,
      },
    ],
  },
};

describe("instantiateLibraryComponent", () => {
  it("gives the copy an id derived from the library and component ids", () => {
    const subnet = instantiateLibraryComponent("std", queue);

    expect(subnet.id).toBe(libraryComponentSubnetId("std", "queue"));
    expect(isPetrinautId(subnet.id)).toBe(true);
    expect(subnet.source).toEqual({ library: "std", component: "queue" });
    expect(subnet.name).toBe("Queue");
  });

  it("scopes every id and reference so two components may share local ids", () => {
    const subnet = instantiateLibraryComponent("std", queue);
    const other = instantiateLibraryComponent("std", {
      ...queue,
      id: "buffer",
    });
    const [inPlace, outPlace] = subnet.places;
    const [move] = subnet.transitions;

    expect(inPlace!.colorId).toBe(subnet.types[0]!.id);
    expect(move!.inputArcs[0]!.placeId).toBe(inPlace!.id);
    expect(move!.outputArcs[0]!.endpoint).toEqual({
      kind: "place",
      placeId: outPlace!.id,
    });
    expect(subnet.places.map(({ id }) => id)).not.toEqual(
      other.places.map(({ id }) => id),
    );
    expect(subnet.places.every(({ id }) => isPetrinautId(id))).toBe(true);
  });

  it("is deterministic, so instantiating twice yields the same subnet", () => {
    expect(instantiateLibraryComponent("std", queue)).toEqual(
      instantiateLibraryComponent("std", queue),
    );
  });
});
