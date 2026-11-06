import { Array, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as AST from "./AST/index.js";
import * as Hierarchy from "./Hierarchy.js";
import * as Trait from "./Trait.js";

/** A vertex no AST node backs, since the walks read positions and traits alone. */
const vertex = (
  ast: AST.Store["Service"],
  label: string,
  trait: Option.Option<Trait.Trait>,
): Hierarchy.Vertex => ({
  target: {
    _tag: "Local",
    node: ast.reserve<AST.Declaration.Declaration>().id,
  },
  label,
  trait,
  entry: Option.none(),
});

const explained = (explanation: string): Option.Option<Trait.Trait> =>
  Option.some(Trait.Explained({ explanation, guide: Option.none() }));

/** A cycle and a diamond: `One` and `Three` extend each other, and both reach `Four` through `Two`. */
const diamond = (): Hierarchy.Hierarchy => {
  const ast = AST.make();
  const vertices = [
    vertex(ast, "One", explained("One.")),
    vertex(ast, "Two", Option.none()),
    vertex(ast, "Three", explained("Three.")),
    vertex(ast, "Four", Option.none()),
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
