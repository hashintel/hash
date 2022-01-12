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
    name: "N1",
    linkedGraphs: [
      { entity: { name: "N2", linkedGraphs: [{ entity: { name: "N5" } }] } },
      { entity: { name: "N3" } },
      { entity: { name: "N4", linkedGraphs: [{ entity: { name: "N6" } }] } },
    ],
  };

  const result = linkedTreeFlatten(graph, "linkedGraphs", "entity");
  // eslint-disable-next-line no-console
  console.log(result);
  expect(result).toEqual([
    {
      parentIndex: -1,
      name: "N1",
    },
    {
      meta: {},
      parentIndex: 0,
      name: "N2",
    },
    {
      meta: {},
      parentIndex: 0,
      name: "N3",
    },
    {
      meta: {},
      parentIndex: 0,
      name: "N4",
    },
    {
      meta: {},
      parentIndex: 1,
      name: "N5",
    },
    {
      meta: {},
      parentIndex: 3,
      name: "N6",
    },
  ]);
});

it("can bail out of a circular tree", () => {
  const graph: Entity = {
    name: "N1",
    linkedGraphs: [
      { entity: { name: "N2" } },
      { entity: { name: "N3" } },
      { entity: { name: "N4", linkedGraphs: [{ entity: { name: "N5" } }] } },
    ],
  };

  graph.linkedGraphs![0].entity = graph;

  expect(() => {
    linkedTreeFlatten(graph, "linkedGraphs", "entity");
  }).toThrowError(/limit reached/);
});
