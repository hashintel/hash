import { describe, expect, it } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";

import { entityGroups, firstEntityRows } from "./entity-groups";

import type { Place, Transition } from "@hashintel/petrinaut-core";

const place = (id: string, name: string): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

const transition = (id: string, name: string): Transition => ({
  id,
  name,
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const net = {
  places: [place("p1", "Stock"), place("p2", "")],
  transitions: [transition("t1", "Ship"), transition("t2", "")],
  types: [
    {
      id: "c1",
      name: "Pallet",
      iconSlug: "box",
      displayColor: "#f00",
      elements: [],
    },
  ],
  differentialEquations: [
    { id: "e1", name: "Decay", colorId: "c1", code: "", arity: 1 },
  ],
  parameters: [
    {
      id: "r1",
      name: "Rate",
      variableName: "rate",
      type: "real" as const,
      defaultValue: "1",
    },
  ],
};

const groupNames = (extensions: Partial<typeof DEFAULT_PETRINAUT_EXTENSIONS>) =>
  entityGroups(net, { ...DEFAULT_PETRINAUT_EXTENSIONS, ...extensions }).map(
    (group) => group.name,
  );

describe("entityGroups", () => {
  it("lists places before transitions under Nodes, naming the unnamed by their id", () => {
    const [nodes] = entityGroups(net, DEFAULT_PETRINAUT_EXTENSIONS);

    expect(nodes!.children).toEqual([
      { id: "p1", type: "place", name: "Stock" },
      { id: "p2", type: "place", name: "Place p2" },
      { id: "t1", type: "transition", name: "Ship" },
      { id: "t2", type: "transition", name: "Transition t2" },
    ]);
  });

  it("gives a token type its colour and a parameter its variable name", () => {
    const [, types, equations, parameters] = entityGroups(
      net,
      DEFAULT_PETRINAUT_EXTENSIONS,
    );

    expect(types!.children).toEqual([
      { id: "c1", type: "type", name: "Pallet", iconColor: "#f00" },
    ]);
    expect(equations!.children).toEqual([
      { id: "e1", type: "differentialEquation", name: "Decay" },
    ]);
    expect(parameters!.children).toEqual([
      { id: "r1", type: "parameter", name: "Rate", variableName: "rate" },
    ]);
  });

  it("leaves out the groups of an extension that is off", () => {
    expect(groupNames({})).toEqual([
      "Nodes",
      "Token Types",
      "Differential Equations",
      "Parameters",
    ]);
    expect(groupNames({ dynamics: false })).toEqual([
      "Nodes",
      "Token Types",
      "Parameters",
    ]);
    expect(groupNames({ parameters: false })).toEqual([
      "Nodes",
      "Token Types",
      "Differential Equations",
    ]);
    // Equations are written over token types, so they go with the colours.
    expect(groupNames({ colors: false })).toEqual(["Nodes", "Parameters"]);
  });
});

describe("firstEntityRows", () => {
  const groups = entityGroups(net, DEFAULT_PETRINAUT_EXTENSIONS);
  const rowIds = (top: typeof groups) =>
    top.map((group) => [group.id, ...group.children.map((child) => child.id)]);

  it("keeps a list that fits as it is, each group the same object", () => {
    const top = firstEntityRows(groups, 7);

    expect(top).toEqual(groups);
    expect(top.every((group, index) => group === groups[index])).toBe(true);
  });

  it("cuts the group that reaches the limit and leaves out the groups after it", () => {
    expect(rowIds(firstEntityRows(groups, 3))).toEqual([
      ["group-nodes", "p1", "p2", "t1"],
    ]);
    expect(rowIds(firstEntityRows(groups, 4))).toEqual([
      ["group-nodes", "p1", "p2", "t1", "t2"],
    ]);
    expect(rowIds(firstEntityRows(groups, 5))).toEqual([
      ["group-nodes", "p1", "p2", "t1", "t2"],
      ["group-types", "c1"],
    ]);
  });
});
