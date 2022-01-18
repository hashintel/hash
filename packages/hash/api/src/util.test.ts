import { topologicalSort, intersection } from "./util";

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
