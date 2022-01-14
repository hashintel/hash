import { topologicalSort, linkedTreeFlatten, intersection } from "./util";

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

it("can compute intersection of sets", () => {
  const setA = new Set([1, 2, 3]);
  const setB = new Set([2, 3, 4]);
  const setC = new Set([]);
  const setD = new Set([5, 6, 7]);

  expect(intersection(setA, setB)).toEqual(new Set([2, 3]));
  expect(intersection(setA, setC)).toEqual(new Set([]));
  expect(intersection(setB, setD)).toEqual(new Set([]));
});

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

  graph.linkedGraphs![0].entity = graph;

  expect(() => {
    linkedTreeFlatten(graph, "linkedGraphs", "entity");
  }).toThrowError(/limit reached/);
});
