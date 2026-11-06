import { describe, expect, test } from "@effect/vitest";
import { Array, Option, pipe } from "effect";

import * as Hierarchy from "./Hierarchy.js";
import * as Trait from "./Trait.js";

import type * as AST from "./AST/index.js";

/** A vertex no AST node backs, since the walks read positions and traits alone. */
const vertex = (
  index: number,
  label: string,
  trait: Option.Option<Trait.Trait>,
): Hierarchy.Vertex => ({
  // SAFETY: The walks compare a vertex's target by identity and never look it up in an AST.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- No walk dereferences this identity.
  target: index as AST.Target.Interned,
  label,
  external: false,
  trait,
  entry: Option.none(),
});

const explained = (explanation: string): Option.Option<Trait.Trait> =>
  Option.some(Trait.Explained({ explanation, guide: Option.none() }));

/** A cycle and a diamond: `One` and `Three` extend each other, and both reach `Four` through `Two`. */
const diamond = (): Hierarchy.Hierarchy => {
  const vertices = [
    vertex(0, "One", explained("One.")),
    vertex(1, "Two", Option.none()),
    vertex(2, "Three", explained("Three.")),
    vertex(3, "Four", Option.none()),
  ];

  return {
    vertices,
    bases: [[1, 2], [2, 3], [0, 3], []],
    derived: [[2], [0], [0, 1], [1, 2]],
    indexOf: (target) =>
      Array.findFirstIndex(
        vertices,
        (candidate) => candidate.target === target,
      ),
  };
};

describe("hierarchy", () => {
  test("cyclic_diamond", () => {
    expect.hasAssertions();
    const hierarchy = diamond();
    expect(Hierarchy.ancestorsOf(hierarchy, 0)).toStrictEqual([1, 2, 3]);
    expect(pipe(hierarchy, Hierarchy.descendantsOf(0))).toStrictEqual([2, 1]);
    expect(Hierarchy.traitsOf(hierarchy, 0)).toStrictEqual([2]);
  });

  test("absent_vertex", () => {
    expect.hasAssertions();
    const hierarchy = diamond();
    expect([
      Hierarchy.ancestorsOf(hierarchy, 8),
      Hierarchy.descendantsOf(hierarchy, 8),
      Hierarchy.traitsOf(hierarchy, 8),
    ]).toStrictEqual([[], [], []]);
  });
});
