import { Array, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Hierarchy from "../src/Hierarchy.js";
import * as Reference from "./fixtures/reference.js";

const collect = async (source: string): Promise<Hierarchy.Hierarchy> => {
  const { document } = await Reference.success({ source });

  return Hierarchy.collect(document.catalogue);
};

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
  test("private_bases_and_implements", async () => {
    expect.hasAssertions();
    const hierarchy = await collect(`
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
  });

  test("intersection_base", async () => {
    expect.hasAssertions();
    const hierarchy = await collect(`
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
  });

  test("declared_traits", async () => {
    expect.hasAssertions();
    const hierarchy = await collect(`
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
  });

  test("private_trait_failure", async () => {
    expect.hasAssertions();
    await expect(
      Reference.run({
        source: `/** @trait @unknownTag */ interface Hidden {}\nclass Model implements Hidden {}\nexport { Model };`,
      }),
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DocumentationError",
        reason: { _tag: "InvalidComment" },
      },
    });
  });

  test("effect_trait_origin", async () => {
    expect.hasAssertions();
    const hierarchy = await collect(`
      import type { Equal } from "effect/Equal";
      export namespace Pipeable { export interface Pipeable {} }
      export interface Model extends Equal, Pipeable.Pipeable {}
    `);
    const traits = Hierarchy.traitsOf(hierarchy, indexOf(hierarchy, "Model"));
    expect(labels(hierarchy, traits)).toStrictEqual([
      "Equal.Equal",
      "Hash.Hash",
    ]);
    expect(vertexOf(hierarchy, "Pipeable.Pipeable").trait).toStrictEqual(
      Option.none(),
    );
    expect(vertexOf(hierarchy, "Equal.Equal")).toMatchObject({
      trait: Option.some({ _tag: "Explained" }),
      target: {
        _tag: "External",
        url: Option.some(
          new URL("https://effect.website/docs/v4/api/effect/Equal#Equal"),
        ),
      },
    });
  });

  test("empty", async () => {
    expect.hasAssertions();
    const hierarchy = await collect(
      "export type Text = string; export const value: number;",
    );
    expect([
      hierarchy.vertices.length,
      hierarchy.bases.length,
      hierarchy.derived.length,
    ]).toStrictEqual([0, 0, 0]);
  });
});
