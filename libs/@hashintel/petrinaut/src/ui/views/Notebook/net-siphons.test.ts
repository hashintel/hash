import { describe, expect, it } from "vitest";

import {
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
} from "@hashintel/petrinaut-core/examples";

import {
  buildInitialPlaceMembership,
  findInitialPlaceGroups,
} from "./net-siphons";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";

const emptyNet: ActiveNetDefinition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
};

const place = (id: string): ActiveNetDefinition["places"][number] => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): ActiveNetDefinition["transitions"][number] => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard" as const,
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "stochastic",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

/** Group members by place name, for readable assertions. */
const groupNames = (net: ActiveNetDefinition): string[][] => {
  const nameOf = new Map(net.places.map((p) => [p.id, p.name || p.id]));
  return findInitialPlaceGroups(net).map((group) =>
    group.placeIds.map((id) => nameOf.get(id) ?? id).sort(),
  );
};

const exampleNet = (example: {
  petriNetDefinition: { places: unknown; transitions: unknown };
}): ActiveNetDefinition =>
  ({
    ...emptyNet,
    ...example.petriNetDefinition,
  }) as ActiveNetDefinition;

describe("findInitialPlaceGroups", () => {
  it("reports a source place as its own group", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Source"), place("Sink")],
      transitions: [transition("Move", ["Source"], ["Sink"])],
    };

    expect(groupNames(net)).toEqual([["Source"]]);
  });

  it("reports a resource pool that circulates inside a cycle", () => {
    // Machines are borrowed and returned, never manufactured.
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Idle"), place("Busy"), place("Output")],
      transitions: [
        transition("Start", ["Idle"], ["Busy"]),
        transition("Finish", ["Busy"], ["Idle", "Output"]),
      ],
    };

    expect(groupNames(net)).toEqual([["Busy", "Idle"]]);
  });

  it("does not report places fed by a source transition", () => {
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Arrivals")],
      transitions: [transition("Spawn", [], ["Arrivals"])],
    };

    expect(groupNames(net)).toEqual([]);
  });

  it("excludes a group that merely contains a smaller one", () => {
    // Output is only reachable through the seeded pool, so it is not itself
    // something the initial state has to mark.
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Idle"), place("Busy"), place("Output")],
      transitions: [
        transition("Start", ["Idle"], ["Busy"]),
        transition("Finish", ["Busy"], ["Idle", "Output"]),
      ],
    };

    const membership = buildInitialPlaceMembership(findInitialPlaceGroups(net));

    expect(membership.has("Output")).toBe(false);
    expect(membership.get("Idle")).toBe(membership.get("Busy"));
  });

  it("ignores arcs naming a place that no longer exists", () => {
    // "Feed"'s only input names a deleted place, so it must not read as a
    // source transition — "Arrivals" still needs seeding.
    const net: ActiveNetDefinition = {
      ...emptyNet,
      places: [place("Arrivals")],
      transitions: [transition("Feed", ["deleted-place"], ["Arrivals"])],
    };

    expect(groupNames(net)).toEqual([["Arrivals"]]);
  });

  it("handles an empty net", () => {
    expect(findInitialPlaceGroups(emptyNet)).toEqual([]);
  });
});

describe("findInitialPlaceGroups on the shipped examples", () => {
  it("finds the raw material and the machine pool, without the technicians", () => {
    // Technicians are created by "Call Technician" from a broken machine, so
    // they are fed from outside and must not be reported.
    expect(groupNames(exampleNet(productionMachines))).toEqual([
      ["RawMaterial"],
      [
        "AvailableMachines",
        "BrokenMachines",
        "MachinesBeingRepaired",
        "MachinesProducing",
        "MachinesToRepair",
      ],
    ]);
  });

  it("finds nothing to seed when source transitions manufacture tokens", () => {
    expect(groupNames(exampleNet(probabilisticSatellitesSDCPN))).toEqual([]);
  });

  it("finds both SIR compartments that the epidemic needs", () => {
    // Two independent groups: without susceptibles nothing can be infected,
    // and without a patient zero the infection can never start.
    expect(groupNames(exampleNet(sirModel))).toEqual([
      ["Susceptible"],
      ["Infected"],
    ]);
  });
});
