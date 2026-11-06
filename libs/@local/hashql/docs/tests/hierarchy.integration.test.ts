import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as Hierarchy from "../src/Hierarchy.js";
import * as Reference from "./fixtures/reference.js";

const collect = Effect.fnUntraced(function* (source: string) {
  const { document } = yield* Reference.success({ source });

  return Hierarchy.collect(document.catalogue);
});

const indexOf = (hierarchy: Hierarchy.Hierarchy, label: string): number =>
  Array.findFirstIndex(
    hierarchy.vertices,
    (vertex) => vertex.label === label,
  ).pipe(Option.getOrThrow);

const vertexOf = (
  hierarchy: Hierarchy.Hierarchy,
  label: string,
): Hierarchy.Vertex =>
  Array.get(hierarchy.vertices, indexOf(hierarchy, label)).pipe(
    Option.getOrThrow,
  );

const labels = (
  hierarchy: Hierarchy.Hierarchy,
  indexes: readonly number[],
): readonly string[] =>
  Array.map(indexes, (index) =>
    Array.get(hierarchy.vertices, index).pipe(
      Option.getOrThrow,
      ({ label }) => label,
    ),
  );

describe("hierarchy", () => {
  it.effect(
    "private_bases_and_implements",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const hierarchy = yield* collect(`
      interface Root {}
      interface Hidden extends Root {}
      export interface Contract extends Root {}
      export class Base {}
      export class Child extends Base implements Hidden, Contract {}
      export class Grandchild extends Child {}
      export { Child as Renamed };
    `);
      const child = indexOf(hierarchy, "Child");
      expect(
        labels(
          hierarchy,
          Array.get(hierarchy.bases, child).pipe(Option.getOrThrow),
        ),
      ).toStrictEqual(["Base", "Hidden", "Contract"]);
      expect(
        labels(hierarchy, Hierarchy.ancestorsOf(hierarchy, child)),
      ).toStrictEqual(["Base", "Hidden", "Contract", "Root"]);
      expect(
        labels(
          hierarchy,
          Hierarchy.descendantsOf(hierarchy, indexOf(hierarchy, "Root")),
        ),
      ).toStrictEqual(["Contract", "Hidden", "Child", "Grandchild"]);
      expect([
        vertexOf(hierarchy, "Hidden").entry,
        Array.filter(hierarchy.vertices, ({ entry }) => Option.isSome(entry))
          .length,
        hierarchy.vertices.length,
      ]).toStrictEqual([Option.none(), 4, 6]);
      expect(
        hierarchy.indexOf(vertexOf(hierarchy, "Child").target),
      ).toStrictEqual(Option.some(child));
    }),
  );

  it.effect(
    "intersection_base",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const hierarchy = yield* collect(`
      export interface Left { left: string }
      export interface Right { right: number }
      declare const Parent: new () => Left & Right;
      export class Model extends Parent {}
    `);
      expect(
        labels(
          hierarchy,
          Hierarchy.ancestorsOf(hierarchy, indexOf(hierarchy, "Model")),
        ),
      ).toStrictEqual(["Left", "Right"]);
    }),
  );

  it.effect(
    "declared_traits",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const hierarchy = yield* collect(`
      /** A private capability. @trait */ interface Hidden {}
      /** A public capability. @trait */ interface Public {}
      class Model implements Hidden, Public {}
      export { Model, Public };
    `);
      const traits = labels(
        hierarchy,
        Hierarchy.traitsOf(hierarchy, indexOf(hierarchy, "Model")),
      );
      expect(traits).toStrictEqual(["Hidden", "Public"]);
      expect(
        Array.map(traits, (label) =>
          Option.map(vertexOf(hierarchy, label).trait, ({ _tag }) => _tag),
        ),
      ).toStrictEqual([Option.some("Declared"), Option.some("Declared")]);
      const hidden = vertexOf(hierarchy, "Hidden");
      expect(hidden.entry).toStrictEqual(Option.none());
      expect(
        pipe(
          hidden.trait,
          Option.filter((trait) => trait._tag === "Declared"),
          Option.map(({ documentation }) => documentation.node.getText()),
          Option.getOrThrow,
        ),
      ).toContain("A private capability.");
    }),
  );

  it.effect(
    "private_trait_failure",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Reference.run({
          source: `/** @trait @unknownTag */ interface Hidden {}\nclass Model implements Hidden {}\nexport { Model };`,
        }),
      ).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "DocumentationError",
          reason: { _tag: "InvalidComment" },
        },
      });
    }),
  );

  it.effect(
    "effect_trait_origin",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { document } = yield* Reference.success({
        source: `
      import type { Equal } from "effect/Equal";
      export namespace Pipeable { export interface Pipeable {} }
      export interface Model extends Equal, Pipeable.Pipeable {}
    `,
      });
      const { ast } = document.catalogue;
      const hierarchy = Hierarchy.collect(document.catalogue);
      const traits = Hierarchy.traitsOf(hierarchy, indexOf(hierarchy, "Model"));
      expect(labels(hierarchy, traits)).toStrictEqual([
        "Equal.Equal",
        "Hash.Hash",
      ]);
      expect(vertexOf(hierarchy, "Pipeable.Pipeable").trait).toStrictEqual(
        Option.none(),
      );
      const equal = vertexOf(hierarchy, "Equal.Equal");
      expect(equal).toMatchObject({
        trait: Option.some({ _tag: "Explained" }),
        external: true,
      });
      expect(
        ast.narrow(equal.target, AST.ExternalItem.isExternalItem).pipe(
          Option.map(ast.get),
          Option.flatMap((item) => item.page("type")),
          Option.map(({ href }) => href),
        ),
      ).toStrictEqual(
        Option.some("https://effect.website/docs/v4/api/effect/Equal#Equal"),
      );
    }),
  );

  it.effect(
    "empty",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const hierarchy = yield* collect(
        "export type Text = string; export const value: number;",
      );
      expect([
        hierarchy.vertices.length,
        hierarchy.bases.length,
        hierarchy.derived.length,
      ]).toStrictEqual([0, 0, 0]);
    }),
  );
});
