import { DocLinkTag } from "@microsoft/tsdoc";
import { Array, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as AST from "../src/AST/index.js";
import * as Reference from "./fixtures/reference.js";

import type { DocNode } from "@microsoft/tsdoc";

const prelude = `export declare namespace Tools { export interface Item {} export function make(): Item; }`;

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
  Option.Option<AST.Reference.Reference.Target>,
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
              Option.map(ast.referenceAt(tag), ({ target }) => target),
            ] as const,
        ),
      ),
    ),
  );
};

/** What the node a local target names declares, by its tag and name. */
const declaredBy = (
  { document }: Reference.Reference,
  target: Option.Option<AST.Reference.Reference.Target>,
): Option.Option<string> =>
  Option.flatMap(target, (value) => {
    if (value._tag !== "Local") {
      return Option.none();
    }

    const node = document.catalogue.ast.get(value.node);
    if (node._tag === "Declaration") {
      return Option.some(`Declaration ${node.symbol.name}`);
    }

    return Option.some(node._tag);
  });

const failure = async (
  source: string,
  files: Readonly<Record<string, string>> = {},
): Promise<Reference.Failure | undefined> => {
  const result = await Reference.run({ source, files });
  if (result._tag === "Failure") {
    return result.failure;
  }

  return undefined;
};

describe("documentation links", () => {
  test("lexical_alias", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
      source: `import type { Original as Imported } from "./other.js"; export type { Original as Public } from "./other.js";
/** See {@link Imported}, then {@link Public}. */ export type Use = Imported;`,
      files: { "other.d.ts": `export interface Original { value: string; }` },
    });
    const original = Reference.id(reference, ["Public"]);
    expect(linksOf(reference)).toStrictEqual([
      ["Imported", Option.some({ _tag: "Local", node: original })],
      ["Public", Option.some({ _tag: "Local", node: original })],
    ]);
  });

  test("package_namespace_paths", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
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
  });

  test("members", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
      source: `export declare class Box { value: string; static create(): Box; }
/** See {@link @scope/pkg#Box.value} and {@link Box.create}. */ export type Use = Box;`,
    });
    expect(
      Array.map(linksOf(reference), ([, target]) =>
        declaredBy(reference, target),
      ),
    ).toStrictEqual([Option.some("Property"), Option.some("Method")]);
  });

  test.each([
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
  ])("%s", async (_name, declarations, destination) => {
    expect.hasAssertions();
    await expect(
      failure(
        `${declarations}\n/** See {@link ${destination}}. */ export type Use = string;`,
        {
          "node_modules/effect/dist/Fixture.d.ts":
            "export interface Owner { member: string; }",
        },
      ),
    ).resolves.toMatchObject({
      _tag: "DocumentationError",
      reason: { _tag: "UnresolvedLink", destination },
    });
  });

  test("binding_without_page", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
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
  });

  test("external_and_url", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
      source: `import type { Option } from "effect/Option";
/** See {@link Option} or {@link https://example.com | online}. */ export type Use = Option<string>;`,
    });
    expect(linksOf(reference)).toMatchObject([
      [
        "Option",
        Option.some({
          _tag: "External",
          url: Option.some(
            new URL(
              "https://effect.website/docs/v4/api/effect/Option#Option-type",
            ),
          ),
        }),
      ],
    ]);
  });

  test("private_remarks", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
      source: `${prelude}
/** Public text.
 * @privateRemarks {@link Missing} and \`Tools.make\`.
 */ export type Use = string;`,
      configuration: "render-tsdoc.json",
    });
    expect(linksOf(reference)).toStrictEqual([["Missing", Option.none()]]);
  });

  test("linked_qualified_names", async () => {
    expect.hasAssertions();
    const reference = await Reference.success({
      source: `${prelude}
/** {@link Tools.make} then \`Tools.make()\`. */ export type Use = string;`,
    });
    expect(linksOf(reference)).toHaveLength(1);
  });

  test.each([
    ["missing_link", "See {@link Missing}.", "UnresolvedLink"],
    ["foreign_package", "See {@link other#Tools.make}.", "UnresolvedLink"],
    ["unlinked_name", "Use `Tools.make()`.", "UnlinkedName"],
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
  ])("%s", async (_name, comment, reason) => {
    expect.hasAssertions();
    await expect(
      failure(`${prelude}\n/** ${comment} */ export type Use = string;`),
    ).resolves.toMatchObject({
      _tag: "DocumentationError",
      reason: { _tag: reason },
    });
  });
});
