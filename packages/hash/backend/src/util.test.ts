import { topologicalSort } from "./util";

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
