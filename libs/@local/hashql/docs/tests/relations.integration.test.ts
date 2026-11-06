import { Array, HashMap, Option, pipe } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Tree from "../src/Tree/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";

const source = `
import type * as Pipeable from "effect/Pipeable";
/** A public trait. @trait */ interface PublicTrait {}
/** A private trait with {@link Value}.
 * @trait
 * @see Private details.
 * @example
 * \`\`\`ts
 * const example = 1;
 * \`\`\`
 */ interface PrivateTrait {}
interface Hidden extends PublicTrait, PrivateTrait {}
interface Value { readonly text: string; }
class Base {}
class Model extends Base implements Hidden, Pipeable.Pipeable {
  /** Reads a value. */ accept(input: Value): Value;
}
class Child extends Model {}
function factory(input: Value): Value;
namespace A {
  /** Same first. @trait */
  interface Shared {}
  class One implements Shared {}
  export { One };
}
namespace B {
  /** Same second. @trait */
  interface Shared {}
  class Two implements Shared {}
  export { Two };
}
export { PublicTrait, Value, Base, Model, Child, factory, A, B };
`;

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

/** The export documented under `name` on the root page, with what its page relates to it. */
const exportOf = (name: string): Tree.Export.Export => {
  const id = Reference.id(reference(), [name]);

  return pipe(
    reference().document.pages,
    Array.flatMap((tree) => {
      if (tree.type !== "module") {
        return [];
      }

      return Array.flatMap(tree.groups, ({ exports }) => exports);
    }),
    Array.findFirst(({ origin }) => origin.id === id),
    Option.getOrThrow,
  );
};

const traitsOf = (): readonly Tree.Trait.Trait[] =>
  pipe(
    reference().document.pages,
    Array.flatMap((tree) => {
      if (tree.type !== "traits") {
        return [];
      }

      return tree.traits;
    }),
  );

const traitOf = (name: string): Tree.Trait.Trait =>
  Array.findFirst(traitsOf(), (trait) => trait.name === name).pipe(
    Option.getOrThrow,
  );

const hierarchyOf = (name: string): Tree.Hierarchy.Hierarchy =>
  Option.getOrThrow(exportOf(name).hierarchy);

const edgesOf = (
  hierarchy: Tree.Hierarchy.Hierarchy,
): readonly (readonly [string, string])[] =>
  Array.map(hierarchy.edges, ({ base, derived }) => [
    base.label,
    derived.label,
  ]);

/** What each row links to. */
const targetsOf = (rows: readonly Tree.Row.Row[]): readonly Tree.Row.Target[] =>
  Array.map(rows, ({ origin }) => origin);

const local = (name: string): AST.Reference.Reference.Target => ({
  _tag: "Local",
  node: Reference.id(reference(), [name]),
});

const declared = (name: string): Tree.Row.Target => ({
  _tag: "Reference",
  target: local(name),
});

const summaryOf = (
  description: Tree.Trait.Trait["description"],
): Option.Option<string> => {
  if (description.type === "explanation") {
    return Tree.Prose.plain(description.children);
  }

  return Option.flatMap(description.description, ({ children }) =>
    Tree.Prose.plain(children),
  );
};

/** A trait's own comment, or none for one the reference explains. */
const commentOf = (
  trait: Tree.Trait.Trait,
): Option.Option<Tree.Comment.Comment> => {
  if (trait.description.type === "explanation") {
    return Option.none();
  }

  return Option.some(trait.description);
};

const isCatalogued = (target: AST.Reference.Reference.Target): boolean =>
  target._tag === "Local" &&
  Array.some(
    reference().document.catalogue.entries,
    ({ id }) => id === target.node,
  );

describe("relations", () => {
  beforeAll(async () => {
    loaded = await Reference.success({ source });
  });

  test("private_intermediates", () => {
    expect.hasAssertions();
    const hierarchy = hierarchyOf("Model");
    const labels = Array.map(hierarchy.nodes, ({ label }) => label);
    expect(labels).not.toContain("Hidden");
    expect(labels).toStrictEqual(
      expect.arrayContaining([
        "Base",
        "PublicTrait",
        "PrivateTrait",
        "Pipeable.Pipeable",
        "Model",
        "Child",
      ]),
    );
    expect(edgesOf(hierarchy)).toStrictEqual(
      expect.arrayContaining([
        ["Base", "Model"],
        ["PublicTrait", "Model"],
        ["PrivateTrait", "Model"],
        ["Pipeable.Pipeable", "Model"],
        ["Model", "Child"],
      ]),
    );
  });

  test("graph_roles", () => {
    expect.hasAssertions();
    const nodes = HashMap.fromIterable(
      Array.map(
        hierarchyOf("Model").nodes,
        (node) => [node.label, node] as const,
      ),
    );
    const roleOf = (label: string): Option.Option<string> =>
      Option.map(HashMap.get(nodes, label), ({ role }) => role);
    expect(
      Array.map(["Model", "PrivateTrait", "Base", "Pipeable.Pipeable"], roleOf),
    ).toStrictEqual(
      Array.map(["current", "trait", "type", "trait"], Option.some),
    );
    expect(
      Option.map(HashMap.get(nodes, "Base"), ({ origin }) => origin),
    ).toStrictEqual(Option.some(local("Base")));
  });

  test("transitive_traits", () => {
    expect.hasAssertions();
    expect(
      Array.map(exportOf("Child").related.traits, ({ label }) =>
        label.join("."),
      ),
    ).toStrictEqual(
      expect.arrayContaining([
        "PublicTrait",
        "PrivateTrait",
        "Pipeable.Pipeable",
      ]),
    );
    expect(targetsOf(traitOf("PrivateTrait").implementors)).toStrictEqual([
      declared("Child"),
      declared("Model"),
    ]);
    expect(
      targetsOf(exportOf("PublicTrait").related.implementedBy),
    ).toStrictEqual(targetsOf(traitOf("PublicTrait").implementors));
    expect(exportOf("Model").related.implementedBy).toStrictEqual([]);
  });

  test("private_trait_content", () => {
    expect.hasAssertions();
    const trait = traitOf("PrivateTrait");
    expect(isCatalogued(trait.origin)).toBe(false);
    const comment = Option.getOrThrow(commentOf(trait));
    expect(
      Array.map(comment.see, ({ children }) => Tree.Prose.plain(children)),
    ).toStrictEqual([Option.some("Private details.")]);
    expect(comment.examples).toHaveLength(1);
  });

  test("explained_trait", () => {
    expect.hasAssertions();
    const trait = traitOf("Pipeable.Pipeable");
    expect([trait.description.type, trait.origin._tag]).toStrictEqual([
      "explanation",
      "External",
    ]);
    expect(summaryOf(trait.description).pipe(Option.getOrThrow)).toContain(
      "Chains functions with pipe",
    );
  });

  test("duplicate_trait_names", () => {
    expect.hasAssertions();
    expect(Array.map(traitsOf(), ({ name }) => name)).toStrictEqual([
      "Pipeable.Pipeable",
      "PrivateTrait",
      "PublicTrait",
      "Shared",
      "Shared",
    ]);
    const shared = Array.filter(traitsOf(), ({ name }) => name === "Shared");
    expect(
      Array.map(shared, ({ description }) => summaryOf(description)),
    ).toStrictEqual(
      expect.arrayContaining([
        Option.some("Same first."),
        Option.some("Same second."),
      ]),
    );
  });

  test("usage_identity", () => {
    expect.hasAssertions();
    const value = exportOf("Value");
    const [accept] = exportOf("Model").members;
    const expected = [
      {
        _tag: "Reference",
        target: { _tag: "Local", node: accept?.id },
      },
      declared("factory"),
    ];
    expect(targetsOf(value.related.acceptedBy)).toStrictEqual(expected);
    expect(targetsOf(value.related.returnedBy)).toStrictEqual(expected);
    expect(value.hierarchy).toStrictEqual(Option.none());
  });
});
