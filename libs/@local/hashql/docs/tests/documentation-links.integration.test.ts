import { describe, expect, it } from "@effect/vitest";
import { DocLinkTag } from "@microsoft/tsdoc";
import { Array, Effect, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as Reference from "./fixtures/reference.js";

import type { DocNode } from "@microsoft/tsdoc";

const prelude = `export declare namespace Tools { export interface Item {} export function make(): Item; }`;

/** A public model whose private base is a trait documented by `comment`. */
const privateTrait = (comment: string): string => `${prelude}
/** ${comment} @trait */ interface Hidden {}
interface Model extends Hidden {}
export { Model };`;

/** The private trait `comment` documents, beside a public class with a static member. */
const privateTraitWithBox = (comment: string): string =>
  `${privateTrait(comment)}\nexport declare class Box { static create(): Box; }`;

/** The links below `node`. */
const tagsIn = (node: DocNode): readonly DocLinkTag[] => {
  if (node instanceof DocLinkTag) {
    return [node];
  }

  return Array.flatMap(node.getChildNodes(), tagsIn);
};

/** Each declaration link of every comment, by its destination as written, with what it resolved to. */
const linksOf = ({
  document,
}: Reference.Reference): readonly (readonly [
  string,
  Option.Option<AST.Target.Interned>,
])[] => {
  const { ast } = document.catalogue;

  return pipe(
    Array.fromIterable(ast.nodes()),
    Array.filter(AST.Documentation.isDocumentation),
    Array.flatMap(({ source }) => tagsIn(source)),
    Array.flatMap((tag) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(tag.codeDestination),
          (destination) =>
            [
              destination.emitAsTsdoc(),
              Option.map(ast.nameOf(tag), ({ target }) => ast.idOf(target)),
            ] as const,
        ),
      ),
    ),
  );
};

/** What the node a local target names declares, by its tag and name. */
const declaredBy = (
  { document }: Reference.Reference,
  target: Option.Option<AST.Target.Interned>,
): Option.Option<string> =>
  Option.flatMap(target, (value) => {
    const node = document.catalogue.ast.get(value);
    if (AST.ExternalItem.isExternalItem(node)) {
      return Option.none();
    }

    if (node._tag === "Declaration") {
      return Option.some(`Declaration ${node.symbol.name}`);
    }

    return Option.some(node._tag);
  });

/** What stops the reference for `source` from building. A reference that builds fails the test. */
const failure = (
  source: string,
  files: Readonly<Record<string, string>> = {},
): Effect.Effect<Reference.Failure, Reference.Reference> =>
  Effect.flip(Reference.success({ source, files }));

describe("documentation links", () => {
  it.effect(
    "lexical_alias",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `import type { Original as Imported } from "./other.js"; export type { Original as Public } from "./other.js";
/** See {@link Imported}, then {@link Public}. */ export type Use = Imported;`,
        files: { "other.d.ts": `export interface Original { value: string; }` },
      });
      const original = Reference.id(reference, ["Public"]);
      expect(linksOf(reference)).toStrictEqual([
        ["Imported", Option.some(original)],
        ["Public", Option.some(original)],
      ]);
    }),
  );

  it.effect(
    "package_namespace_paths",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `${prelude} export { Tools as Alias };
/** See {@link @scope/pkg#Alias.Item} and {@link Tools.make}. */ export type Use = string;`,
      });
      expect(
        Array.map(linksOf(reference), ([destination, target]) => [
          destination,
          declaredBy(reference, target),
        ]),
      ).toStrictEqual([
        ["@scope/pkg#Alias.Item", Option.some("Declaration Item")],
        ["Tools.make", Option.some("Declaration make")],
      ]);
    }),
  );

  it.effect(
    "members",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `export declare class Box { value: string; static create(): Box; }
/** See {@link @scope/pkg#Box.value} and {@link Box.create}. */ export type Use = Box;`,
      });
      expect(
        Array.map(linksOf(reference), ([, target]) =>
          declaredBy(reference, target),
        ),
      ).toStrictEqual([Option.some("Property"), Option.some("Method")]);
    }),
  );

  it.effect.each([
    [
      "type_only_static",
      `declare class Box { static create(): Box; value: string; } export type { Box };`,
      "@scope/pkg#Box.create",
    ],
    [
      "ambiguous_member",
      `export declare class Box { static value: string; value: string; }`,
      "@scope/pkg#Box.value",
    ],
    [
      "external_member",
      `import type { Owner } from "./node_modules/effect/dist/Fixture.js";`,
      "Owner.member",
    ],
  ] as const)(
    "%s",
    Effect.fnUntraced(function* ([, declarations, destination]: readonly [
      string,
      string,
      string,
    ]) {
      expect.hasAssertions();
      expect(
        yield* failure(
          `${declarations}\n/** See {@link ${destination}}. */ export type Use = string;`,
          {
            "node_modules/effect/dist/Fixture.d.ts":
              "export interface Owner { member: string; }",
          },
        ),
      ).toMatchObject({
        _tag: "DocumentationError",
        reason: { _tag: "UnresolvedLink", destination },
      });
    }),
  );

  it.effect(
    "binding_without_page",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `import { Base } from "./node_modules/other/index.js";
export declare class Model extends Base { merge(other: Model): Model; }
/** See {@link Model.merge}. */ export type Use = string;`,
        files: {
          "node_modules/other/index.d.ts":
            "export declare class Base { static merge(): void; }",
        },
      });
      expect(
        Array.map(linksOf(reference), ([destination, target]) => [
          destination,
          declaredBy(reference, target),
        ]),
      ).toStrictEqual([["Model.merge", Option.some("Method")]]);
    }),
  );

  it.effect(
    "external_and_url",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `import type { Option } from "effect/Option";
/** See {@link Option} or {@link https://example.com | online}. */ export type Use = Option<string>;`,
      });
      const { ast } = reference.document.catalogue;
      expect(
        Array.map(linksOf(reference), ([destination, target]) => [
          destination,
          Option.flatMap(target, (id) =>
            ast.narrow(id, AST.ExternalItem.isExternalItem).pipe(
              Option.map(ast.get),
              Option.flatMap((item) => item.page("type")),
              Option.map(({ href }) => href),
            ),
          ),
        ]),
      ).toStrictEqual([
        [
          "Option",
          Option.some(
            "https://effect.website/docs/v4/api/effect/Option#Option-type",
          ),
        ],
      ]);
    }),
  );

  it.effect(
    "private_remarks",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `${prelude}
/** Public text.
 * @privateRemarks {@link Missing} and \`Tools.make\`.
 */ export type Use = string;`,
        configuration: "render-tsdoc.json",
      });
      expect(linksOf(reference)).toStrictEqual([["Missing", Option.none()]]);
    }),
  );

  it.effect(
    "linked_qualified_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `${prelude}
/** {@link Tools.make} then \`Tools.make()\`. */ export type Use = string;`,
      });
      expect(linksOf(reference)).toHaveLength(1);
    }),
  );

  it.effect(
    "private_trait",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Effect.flip(
          Reference.success({
            source: privateTrait("Use `Tools.make()`."),
            configuration: "render-tsdoc.json",
          }),
        ),
      ).toMatchObject({
        _tag: "DocumentationError",
        reason: { _tag: "UnlinkedName" },
      });
      yield* Reference.success({
        source: privateTrait("Use {@link Tools.make}."),
        configuration: "render-tsdoc.json",
      });
    }),
  );

  it.effect(
    "private_trait_member",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Effect.flip(
          Reference.success({
            source: privateTraitWithBox("Use `Box.create()`."),
            configuration: "render-tsdoc.json",
          }),
        ),
      ).toMatchObject({
        _tag: "DocumentationError",
        reason: { _tag: "UnlinkedName", code: "Box.create()" },
      });
      yield* Reference.success({
        source: privateTraitWithBox(
          "Use {@link Box.create}, not `Box.missing()`.",
        ),
        configuration: "render-tsdoc.json",
      });
    }),
  );

  it.effect.each([
    ["missing_link", "See {@link Missing}.", "UnresolvedLink"],
    ["foreign_package", "See {@link other#Tools.make}.", "UnresolvedLink"],
    ["unlinked_name", "Use `Tools.make()`.", "UnlinkedName"],
    ["type_arguments", "Use `Tools.Item<string>`.", "UnlinkedName"],
    ["generic_call", "Use `Tools.make<string>()`.", "UnlinkedName"],
    ["call_arguments", "Use `Tools.make(1, 2)`.", "UnlinkedName"],
    [
      "link_after_name",
      "Use `Tools.make`, see {@link Tools.make}.",
      "UnlinkedName",
    ],
    [
      "paragraph_reset",
      "{@link Tools.make}.\n *\n * Use `Tools.make`.",
      "UnlinkedName",
    ],
    [
      "unsupported_selector",
      "See {@link (Tools:namespace)}.",
      "UnsupportedReference",
    ],
  ] as const)(
    "%s",
    Effect.fnUntraced(function* ([, comment, reason]: readonly [
      string,
      string,
      string,
    ]) {
      expect.hasAssertions();
      expect(
        yield* failure(
          `${prelude}\n/** ${comment} */ export type Use = string;`,
        ),
      ).toMatchObject({
        _tag: "DocumentationError",
        reason: { _tag: reason },
      });
    }),
  );
});
