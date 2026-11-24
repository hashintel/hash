import { describe, expect, it } from "vitest";

import {
  firstInstancePathOf,
  indexCompositionState,
  netAtInstancePath,
} from "./instance-state";

import type {
  Component,
  ComponentInstance,
  Place,
  SDCPN,
} from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...overrides,
});

const instance = (
  id: string,
  componentId: string,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance => ({
  id,
  name: id,
  component: { id: componentId },
  parameterValues: {},
  x: 0,
  y: 0,
  ...overrides,
});

const component = (
  id: string,
  overrides: Partial<Component> = {},
): Component => ({
  id,
  name: id,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const machine = component("machine", {
  places: [place("in", { isPort: true }), place("work")],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    },
  ],
});

/** A line of two machines, the first fed from a root place through a fusion. */
const line = component("line", {
  componentInstances: [instance("m1", "machine"), instance("m2", "machine")],
});

const definition: SDCPN = {
  places: [place("buffer")],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  components: [machine, line],
  componentInstances: [
    instance("top", "machine", { parameterValues: { rate: "3" } }),
    instance("l1", "line"),
  ],
  fusions: [
    {
      id: "belt",
      name: "Belt",
      members: [
        { kind: "place", placeId: "buffer" },
        {
          kind: "componentPort",
          componentInstanceId: "top",
          portPlaceId: "in",
        },
      ],
    },
  ],
};

describe("indexCompositionState", () => {
  const index = indexCompositionState(definition);

  it("leaves a root place where it is", () => {
    expect(index.flatPlaceId([], "buffer")).toBe("buffer");
  });

  it("scopes a place of an instance under the instances that lead to it", () => {
    expect(index.flatPlaceId(["top"], "work")).toBe("top::work");
    expect(index.flatPlaceId(["l1", "m2"], "work")).toBe("l1::m2::work");
  });

  it("reads a fused port from the place its fusion leaves", () => {
    expect(index.flatPlaceId(["top"], "in")).toBe("buffer");
    // The same port of another instance is in no fusion.
    expect(index.flatPlaceId(["l1", "m1"], "in")).toBe("l1::m1::in");
  });

  it("gives each instance the parameter values it runs with", () => {
    expect(index.instanceParameterValues(["top"])).toEqual({ rate: 3 });
    expect(index.instanceParameterValues(["l1", "m1"])).toEqual({ rate: 1 });
  });

  it("has no instance values for the root net or a path to nothing", () => {
    expect(index.instanceParameterValues([])).toBeNull();
    expect(index.instanceParameterValues(["nowhere"])).toBeNull();
  });

  it("reads places as their own when the composition does not flatten", () => {
    const broken = indexCompositionState({
      ...definition,
      componentInstances: [instance("lost", "missing")],
    });
    expect(broken.flatPlaceId(["lost"], "in")).toBe("lost::in");
  });
});

describe("netAtInstancePath", () => {
  it("is the root net for an empty path", () => {
    expect(netAtInstancePath(definition, [])).toBe(definition);
  });

  it("is the component the last instance of the path runs", () => {
    expect(netAtInstancePath(definition, ["l1"])).toBe(line);
    expect(netAtInstancePath(definition, ["l1", "m2"])).toBe(machine);
  });

  it("is null for a path that leads to no instance", () => {
    expect(netAtInstancePath(definition, ["l1", "top"])).toBeNull();
  });
});

describe("firstInstancePathOf", () => {
  it("finds the instance nearest the root that runs the component", () => {
    expect(firstInstancePathOf(definition, "machine")).toEqual(["top"]);
    expect(firstInstancePathOf(definition, "line")).toEqual(["l1"]);
  });

  it("looks inside the instances of the root net", () => {
    const nested: SDCPN = {
      ...definition,
      componentInstances: [instance("l1", "line")],
      fusions: undefined,
    };
    expect(firstInstancePathOf(nested, "machine")).toEqual(["l1", "m1"]);
  });

  it("is null for a component nothing instantiates", () => {
    expect(
      firstInstancePathOf({ ...definition, componentInstances: [] }, "machine"),
    ).toBeNull();
  });
});
