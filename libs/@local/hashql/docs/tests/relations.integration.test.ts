import { expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, Option, pipe } from "effect";

import * as Anchor from "../src/Anchor.js";
import * as Destinations from "../src/Destinations.js";
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

/** The export documented under `name` on the root page, with what its page relates to it. */
const exportOf = (
  reference: Reference.Reference,
  name: string,
): Tree.Export.Export => {
  const id = Reference.id(reference, [name]);

  return pipe(
    reference.pages,
    Array.flatMap(({ tree }) => {
      if (tree.type !== "module") {
        return [];
      }

      return Array.flatMap(tree.groups, ({ exports }) => exports);
    }),
    Array.findFirst(({ origin }) => origin.id === id),
    Option.getOrThrow,
  );
};

const traitsOf = (
  reference: Reference.Reference,
): readonly Tree.Trait.Trait[] =>
  pipe(
    reference.pages,
    Array.flatMap(({ tree }) => {
      if (tree.type !== "traits") {
        return [];
      }

      return tree.traits;
    }),
  );

const traitOf = (
  reference: Reference.Reference,
  name: string,
): Tree.Trait.Trait =>
  Array.findFirst(traitsOf(reference), (trait) => trait.name === name).pipe(
    Option.getOrThrow,
  );

const hierarchyOf = (
  reference: Reference.Reference,
  name: string,
): Tree.Hierarchy.Hierarchy =>
  Option.getOrThrow(exportOf(reference, name).hierarchy);

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

const declared = (
  reference: Reference.Reference,
  name: string,
): Tree.Row.Target => ({
  _tag: "Reference",
  target: Reference.id(reference, [name]),
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

const isCatalogued = (
  reference: Reference.Reference,
  target: AST.Target.Interned,
): boolean =>
  Array.some(reference.document.catalogue.entries, ({ id }) => id === target);

layer(Reference.layer({ source }), { excludeTestServices: true })(
  "relations",
  (it) => {
    it.effect(
      "private_intermediates",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const hierarchy = hierarchyOf(reference, "Model");
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
      }),
    );

    it.effect(
      "graph_roles",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const nodes = HashMap.fromIterable(
          Array.map(
            hierarchyOf(reference, "Model").nodes,
            (node) => [node.label, node] as const,
          ),
        );
        const roleOf = (label: string): Option.Option<string> =>
          Option.map(HashMap.get(nodes, label), ({ role }) => role);
        expect(
          Array.map(
            ["Model", "PrivateTrait", "Base", "Pipeable.Pipeable"],
            roleOf,
          ),
        ).toStrictEqual(
          Array.map(["current", "trait", "type", "trait"], Option.some),
        );
        expect(
          Option.map(HashMap.get(nodes, "Base"), ({ origin }) => origin),
        ).toStrictEqual(Option.some(Reference.id(reference, ["Base"])));
      }),
    );

    it.effect(
      "transitive_traits",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(
          Array.map(exportOf(reference, "Child").related.traits, ({ label }) =>
            label.join("."),
          ),
        ).toStrictEqual(
          expect.arrayContaining([
            "PublicTrait",
            "PrivateTrait",
            "Pipeable.Pipeable",
          ]),
        );
        expect(
          targetsOf(traitOf(reference, "PrivateTrait").implementors),
        ).toStrictEqual([
          declared(reference, "Child"),
          declared(reference, "Model"),
        ]);
        expect(
          targetsOf(exportOf(reference, "PublicTrait").related.implementedBy),
        ).toStrictEqual(
          targetsOf(traitOf(reference, "PublicTrait").implementors),
        );
        expect(
          exportOf(reference, "Model").related.implementedBy,
        ).toStrictEqual([]);
      }),
    );

    it.effect(
      "private_trait_content",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const trait = traitOf(reference, "PrivateTrait");
        expect(isCatalogued(reference, trait.origin)).toBe(false);
        const comment = Option.getOrThrow(commentOf(trait));
        expect(
          Array.map(comment.see, ({ children }) => Tree.Prose.plain(children)),
        ).toStrictEqual([Option.some("Private details.")]);
        expect(comment.examples).toHaveLength(1);
        const { destinations } = Reference.page(
          reference,
          "traits.html",
        ).output;
        expect(Destinations.trait(destinations, trait.origin)).toStrictEqual(
          Option.some({
            file: Anchor.File("traits.html"),
            id: Option.some(Anchor.AnchorId("PrivateTrait")),
          }),
        );
      }),
    );

    it.effect(
      "explained_trait",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const trait = traitOf(reference, "Pipeable.Pipeable");
        expect([
          trait.description.type,
          reference.document.catalogue.ast.get(trait.origin)._tag,
        ]).toStrictEqual(["explanation", "ExternalItem"]);
        expect(summaryOf(trait.description).pipe(Option.getOrThrow)).toContain(
          "Chains functions with pipe",
        );
      }),
    );

    it.effect(
      "duplicate_trait_names",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(
          Array.map(traitsOf(reference), ({ name }) => name),
        ).toStrictEqual([
          "Pipeable.Pipeable",
          "PrivateTrait",
          "PublicTrait",
          "Shared",
          "Shared",
        ]);
        const shared = Array.filter(
          traitsOf(reference),
          ({ name }) => name === "Shared",
        );
        const { destinations } = Reference.page(
          reference,
          "traits.html",
        ).output;
        expect(
          Array.map(shared, ({ origin }) =>
            Destinations.trait(destinations, origin).pipe(
              Option.flatMap(({ id }) => id),
            ),
          ),
        ).toStrictEqual([Option.some("Shared"), Option.some("Shared-2")]);
        expect(
          Array.map(shared, ({ description }) => summaryOf(description)),
        ).toStrictEqual(
          expect.arrayContaining([
            Option.some("Same first."),
            Option.some("Same second."),
          ]),
        );
      }),
    );

    it.effect(
      "value_apart",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.success({
          source: `/** A trait. @trait */ interface Shared {}
interface Box extends Shared {}
declare function Box(input: Input): Box;
interface Input {}
export { Box, Input };`,
        });
        const box = Reference.id(reference, ["Box"]);
        expect(
          pipe(
            reference.document.pages,
            Array.flatMap((tree) =>
              tree.type === "module" ? tree.groups : [],
            ),
            Array.flatMap(({ exports }) => exports),
            Array.filter(({ origin }) => origin.id === box),
            Array.map(({ meaning, hierarchy, related }) => [
              meaning,
              Option.isSome(hierarchy),
              related.traits.length,
            ]),
          ),
        ).toStrictEqual([
          [Option.some("type"), true, 1],
          [Option.some("value"), false, 0],
        ]);
        expect(
          targetsOf(exportOf(reference, "Input").related.acceptedBy),
        ).toStrictEqual([{ _tag: "Value", declaration: box }]);
      }),
    );

    it.effect(
      "usage_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const value = exportOf(reference, "Value");
        const [accept] = exportOf(reference, "Model").members;
        const expected = [
          { _tag: "Reference", target: accept?.id },
          declared(reference, "factory"),
        ];
        expect(targetsOf(value.related.acceptedBy)).toStrictEqual(expected);
        expect(targetsOf(value.related.returnedBy)).toStrictEqual(expected);
        expect(value.hierarchy).toStrictEqual(Option.none());
      }),
    );
  },
);
