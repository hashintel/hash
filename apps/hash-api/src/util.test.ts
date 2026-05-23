import { describe, expect, it } from "vitest";

import { intersection, linkedTreeFlatten, topologicalSort, treeFromParentReferences } from "./util";

describe("topological sort", () => {
  it("can do topological sort", () => {
    // ┌────── A ─────┐
    // │              │
    // ▼              ▼
    // B       ┌──────C──────┐
    // │       │      │      │
    // │       ▼      ▼      ▼
    // └──────►D      E      F
    //                       │
    //                       ▼
    //                       G
    const edges: [string, string][] = [
      ["F", "G"],
      ["C", "D"],
      ["B", "D"],
      ["C", "E"],
      ["A", "B"],
      ["C", "F"],
      ["A", "C"],
    ];

    expect(topologicalSort(edges)).toEqual(["A", "C", "F", "G", "E", "B", "D"]);
  });

  it("throws an error on topological sort on a graph with cycles", () => {
    //         ┌─────────────────────┐
    //         │                     │
    //         ▼                     │
    // ┌────── A ─────┐              │
    // │              │              │
    // ▼              ▼              │
    // B       ┌──────C──────┐       │
    // │       │      │      │       │
    // │       ▼      ▼      ▼       │
    // └──────►D      E      F       │
    //                       │       │
    //                       ▼       │
    //                       G ──────┘
    const edges: [string, string][] = [
      ["F", "G"],
      ["C", "D"],
      ["B", "D"],
      ["C", "E"],
      ["A", "B"],
      ["C", "F"],
      ["A", "C"],
      ["G", "A"],
    ];

    expect(() => topologicalSort(edges)).toThrow("graph is not acyclic");
  });
});

it("can compute intersection of sets", () => {
  const setA = new Set([1, 2, 3]);
  const setB = new Set([2, 3, 4]);
  const setC = new Set([]);
  const setD = new Set([5, 6, 7]);

  expect(intersection(setA, setB)).toEqual(new Set([2, 3]));
  expect(intersection(setA, setC)).toEqual(new Set([]));
  expect(intersection(setB, setD)).toEqual(new Set([]));
});

describe("tree flattening", () => {
  type Entity = {
    name: string;
    linkedGraphs?: LinkedEntity[];
  };

  type LinkedEntity = {
    entity: Entity;
  };

  it("can flatten a tree structure", () => {
    // ┌───────E1──────┐
    // │       │       │
    // ▼       ▼       ▼
    // E2      E3      E4
    // │               │
    // ▼               ▼
    // E5              E6

    const graph: Entity = {
      name: "E1",
      linkedGraphs: [
        { entity: { name: "E2", linkedGraphs: [{ entity: { name: "E5" } }] } },
        { entity: { name: "E3" } },
        { entity: { name: "E4", linkedGraphs: [{ entity: { name: "E6" } }] } },
      ],
    };

    const result = linkedTreeFlatten(graph, "linkedGraphs", "entity");

    //   ┌─┬──┬──┐
    //   │ │  │  │
    // ┌─▼┌┴─┬┴─┬┴─┬──┬──┐
    // │E1│E2│E3│E4│E5│E6│
    // └──┴─▲└──┴─▲┴┬─┴┬─┘
    //      │     │ │  │
    //      └─────┼─┘  │
    //            └────┘
    expect(result).toEqual([
      {
        parentIndex: -1,
        name: "E1",
      },
      {
        meta: {},
        parentIndex: 0,
        name: "E2",
      },
      {
        meta: {},
        parentIndex: 0,
        name: "E3",
      },
      {
        meta: {},
        parentIndex: 0,
        name: "E4",
      },
      {
        meta: {},
        parentIndex: 1,
        name: "E5",
      },
      {
        meta: {},
        parentIndex: 3,
        name: "E6",
      },
    ]);
  });

  it("can handle non-linked tree structure", () => {
    // ┌───────E1──────┐
    // │       │       │
    // ▼       ▼       ▼
    // E2      E3      E4
    // │               │
    // ▼               ▼
    // E5              E6
    const graph: Entity = {
      name: "E1",
    };

    const result = linkedTreeFlatten(graph, "linkedGraphs", "entity");
    expect(result).toEqual([
      {
        parentIndex: -1,
        name: "E1",
      },
    ]);
  });

  it("can bail out of a circular tree", () => {
    const graph: Entity = {
      name: "E1",
      linkedGraphs: [
        { entity: { name: "E2" } },
        { entity: { name: "E3" } },
        { entity: { name: "E4", linkedGraphs: [{ entity: { name: "E5" } }] } },
      ],
    };

    graph.linkedGraphs![0]!.entity = graph;

    expect(() => {
      linkedTreeFlatten(graph, "linkedGraphs", "entity");
    }).toThrowError(/limit reached/);
  });
});

describe("restructure flat list to tree", () => {
  type Element = {
    id: string;
    ref?: string | undefined;
    children?: Element[] | undefined;
  };

  it("can rebuild tree", () => {
    const test1 = [
      { id: "1" },
      { id: "2", ref: "1" },
      { id: "3", ref: "2" },
      { id: "4", ref: "1" },
      { id: "5" },
    ] as Element[];

    const result = treeFromParentReferences(test1, "id", "ref", "children");

    expect(result).toEqual([
      {
        id: "1",
        children: [
          { id: "4", ref: "1" },
          { id: "2", ref: "1", children: [{ id: "3", ref: "2" }] },
        ],
        ref: undefined,
      },

      { id: "5" },
    ]);
  });

  it("bails out if a circular tree is supplied", () => {
    const test1 = [
      { id: "1", ref: "2" },
      { id: "2", ref: "1" },
      { id: "3", ref: "2" },
      { id: "4", ref: "1" },
      { id: "5" },
    ] as Element[];

    expect(() => treeFromParentReferences(test1, "id", "ref", "children")).toThrow(
      "graph is not acyclic",
    );
  });

  it("can rebuild tree with invalid refs", () => {
    const test1 = [
      { id: "1" },
      { id: "2", ref: "1" },
      { id: "3", ref: "2" },
      { id: "4", ref: "1" },
      { id: "5" },
      { id: "6", ref: "x1" },
      { id: "7", ref: "x2" },
    ] as Element[];

    const result = treeFromParentReferences(test1, "id", "ref", "children");

    expect(result).toEqual([
      {
        id: "1",
        children: [
          { id: "4", ref: "1" },
          { id: "2", ref: "1", children: [{ id: "3", ref: "2" }] },
        ],
        ref: undefined,
      },

      { id: "5" },
      { id: "6" },
      { id: "7" },
    ]);
  });

  it("ignores lists without references", () => {
    const test1 = [
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "4" },
      { id: "5" },
      { id: "6" },
      { id: "7" },
    ] as Element[];

    const result = treeFromParentReferences(test1, "id", "ref", "children");

    expect(result).toEqual([
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "4" },
      { id: "5" },
      { id: "6" },
      { id: "7" },
    ]);
  });
});
