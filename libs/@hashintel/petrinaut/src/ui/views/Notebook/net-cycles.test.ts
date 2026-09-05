import { describe, expect, it } from "vitest";

import { buildCycleMembership, findCycleGroups } from "./net-cycles";

import type { NetGraph, NetGraphNode } from "./notebook-model";

const place = (id: string): NetGraphNode => ({ id, name: id, kind: "place" });
const transition = (id: string): NetGraphNode => ({
  id,
  name: id,
  kind: "transition",
});

describe("findCycleGroups", () => {
  it("finds no cycles in a chain", () => {
    const graph: NetGraph = {
      nodes: [place("Source"), transition("Move"), place("Sink")],
      edges: [
        { from: "Source", to: "Move" },
        { from: "Move", to: "Sink" },
      ],
    };

    expect(findCycleGroups(graph)).toEqual([]);
  });

  it("groups the members of a two-node loop", () => {
    const graph: NetGraph = {
      nodes: [place("Pool"), transition("Churn")],
      edges: [
        { from: "Pool", to: "Churn" },
        { from: "Churn", to: "Pool" },
      ],
    };

    const groups = findCycleGroups(graph);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.memberIds).toEqual(["Pool", "Churn"]);
    expect(groups[0]!.label).toBe(1);
  });

  it("keeps separate loops in separate groups, numbered in document order", () => {
    const graph: NetGraph = {
      nodes: [
        place("A1"),
        transition("A2"),
        place("B1"),
        transition("B2"),
        place("Free"),
      ],
      edges: [
        { from: "A1", to: "A2" },
        { from: "A2", to: "A1" },
        { from: "B1", to: "B2" },
        { from: "B2", to: "B1" },
        { from: "A1", to: "Free" },
      ],
    };

    const groups = findCycleGroups(graph);

    expect(groups.map(({ memberIds }) => memberIds)).toEqual([
      ["A1", "A2"],
      ["B1", "B2"],
    ]);
    expect(groups.map(({ label }) => label)).toEqual([1, 2]);
  });

  it("treats a longer loop as one group", () => {
    const graph: NetGraph = {
      nodes: [place("P1"), transition("T1"), place("P2"), transition("T2")],
      edges: [
        { from: "P1", to: "T1" },
        { from: "T1", to: "P2" },
        { from: "P2", to: "T2" },
        { from: "T2", to: "P1" },
      ],
    };

    const groups = findCycleGroups(graph);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.memberIds).toEqual(["P1", "T1", "P2", "T2"]);
  });

  it("maps every member to its group", () => {
    const graph: NetGraph = {
      nodes: [place("Pool"), transition("Churn"), place("Outside")],
      edges: [
        { from: "Pool", to: "Churn" },
        { from: "Churn", to: "Pool" },
        { from: "Churn", to: "Outside" },
      ],
    };

    const membership = buildCycleMembership(findCycleGroups(graph));

    expect(membership.get("Pool")?.label).toBe(1);
    expect(membership.get("Churn")?.label).toBe(1);
    expect(membership.has("Outside")).toBe(false);
  });
});
