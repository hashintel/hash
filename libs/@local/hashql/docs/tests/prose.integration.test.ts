import { Array, HashMap, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Tree from "../src/Tree/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";

const declarations = `export interface Box {}
export interface A {}
export interface B {}
export declare namespace Space { interface Value {} }`;

/** Prose without its origins, so two readings of one comment compare equal. A link keeps its target or address, and a code block its language. */
type Shape =
  | readonly ["text" | "inlineCode", string]
  | readonly ["code", Option.Option<string>, string]
  | readonly ["link", AST.Reference.Reference.Target | string, readonly Shape[]]
  | readonly ["paragraph", readonly Shape[]];

const shapeOf = (
  nodes: readonly (Tree.Prose.Block | Tree.Prose.Phrasing)[],
): readonly Shape[] =>
  Array.map(nodes, (node): Shape => {
    switch (node.type) {
      case "text":
      case "inlineCode": {
        return [node.type, node.value];
      }
      case "code": {
        return ["code", node.language, node.value];
      }
      case "link": {
        return [
          "link",
          node.destination instanceof URL
            ? node.destination.href
            : node.destination.target,
          shapeOf(node.children),
        ];
      }
      case "paragraph": {
        return ["paragraph", shapeOf(node.children)];
      }
    }
  });

interface Described {
  readonly reference: Reference.Reference;
  readonly blocks: readonly Tree.Prose.Block[];
}

/** The description of `comment` on a public declaration beside `declarations`. */
const described = async (comment: string): Promise<Described> => {
  const reference = await Reference.success({
    source: `${declarations}\n${comment}\nexport type Use = string;`,
    configuration: "render-tsdoc.json",
  });
  const blocks = pipe(
    HashMap.get(reference.document.entries, Reference.id(reference, ["Use"])),
    Option.flatMap(({ comments }) => Array.head(comments)),
    Option.flatMap(({ description }) => description),
    Option.map(({ children }) => children),
    Option.getOrThrow,
  );

  return { reference, blocks };
};

/** Whether two comments' descriptions say the same, wherever they stand. */
const equivalent = async (left: string, right: string): Promise<boolean> => {
  const [self, that] = await Promise.all([described(left), described(right)]);

  return Tree.Prose.equivalence(self.blocks, that.blocks);
};

const local = (
  reference: Reference.Reference,
  name: string,
): AST.Reference.Reference.Target => ({
  _tag: "Local",
  node: Reference.id(reference, [name]),
});

describe("prose", () => {
  test("rich_lead", async () => {
    expect.hasAssertions();
    const { reference, blocks } = await described(
      "/** Read `input` through {@link Box}.\n *\n * More detail.\n */",
    );
    expect(shapeOf(blocks)).toStrictEqual([
      [
        "paragraph",
        [
          ["text", "Read "],
          ["inlineCode", "input"],
          ["text", " through "],
          ["link", local(reference, "Box"), [["inlineCode", "Box"]]],
          ["text", "."],
        ],
      ],
      ["paragraph", [["text", "More detail."]]],
    ]);
    expect(Tree.Prose.plain(blocks)).toStrictEqual(
      Option.some("Read input through Box."),
    );
  });

  test("link_spacing", async () => {
    expect.hasAssertions();
    const { reference, blocks } = await described("/** {@link A} {@link B} */");
    expect(shapeOf(blocks)).toStrictEqual([
      [
        "paragraph",
        [
          ["link", local(reference, "A"), [["inlineCode", "A"]]],
          ["text", " "],
          ["link", local(reference, "B"), [["inlineCode", "B"]]],
        ],
      ],
    ]);
  });

  test("link_labels", async () => {
    expect.hasAssertions();
    const labelled = await described("/** {@link Box | its `value`} */");
    expect(shapeOf(labelled.blocks)).toStrictEqual([
      [
        "paragraph",
        [
          [
            "link",
            local(labelled.reference, "Box"),
            [
              ["text", "its "],
              ["inlineCode", "value"],
            ],
          ],
        ],
      ],
    ]);
    const unfinished = await described(
      "/** {@link Box | an `unfinished label} */",
    );
    expect(Tree.Prose.plain(unfinished.blocks)).toStrictEqual(
      Option.some("an `unfinished label"),
    );
  });

  test("url_label", async () => {
    expect.hasAssertions();
    const { blocks } = await described(
      "/** {@link https://example.com/guide} */",
    );
    expect(shapeOf(blocks)).toStrictEqual([
      [
        "paragraph",
        [
          [
            "link",
            "https://example.com/guide",
            [["inlineCode", "https://example.com/guide"]],
          ],
        ],
      ],
    ]);
  });

  test("qualified_label", async () => {
    expect.hasAssertions();
    const { blocks } = await described("/** {@link @scope/pkg#Space.Value} */");
    expect(Tree.Prose.plain(blocks)).toStrictEqual(Option.some("Space.Value"));
  });

  test("escaped_text", async () => {
    expect.hasAssertions();
    const { blocks } = await described(
      String.raw`/** Literal \@tag and \{ braces. */`,
    );
    expect(Tree.Prose.plain(blocks)).toStrictEqual(
      Option.some("Literal @tag and { braces."),
    );
  });

  test("html_code", async () => {
    expect.hasAssertions();
    const { blocks } = await described(
      "/** Before <code>  a\\`b\n * c  </code> after. */",
    );
    expect(shapeOf(blocks)).toStrictEqual([
      [
        "paragraph",
        [
          ["text", "Before "],
          ["inlineCode", "  a`b\nc  "],
          ["text", " after."],
        ],
      ],
    ]);
  });

  test("fenced_bytes", async () => {
    expect.hasAssertions();
    const { blocks } = await described(
      "/**\n * ```ts\n * const value = {\n *   text: ` keep `,\n * };\n * ```\n */",
    );
    expect(shapeOf(blocks)).toStrictEqual([
      ["code", Option.some("ts"), "const value = {\n  text: ` keep `,\n};\n"],
    ]);
    expect(Tree.Prose.plain(blocks)).toStrictEqual(Option.none());
  });

  test("missing_target", async () => {
    expect.hasAssertions();
    await expect(
      Reference.run({
        source: `/** A private trait with {@link Missing}. @trait */ interface Hidden {}
export declare class Model implements Hidden {}
export {};`,
        configuration: "render-tsdoc.json",
      }),
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProseError",
        reason: { _tag: "MissingTarget", reference: "Missing" },
      },
    });
  });

  test("semantic_equivalence", async () => {
    expect.hasAssertions();
    await expect(
      Promise.all(
        Array.map(
          [
            ["/** {@link Box}. */", "/**\n *\n * {@link Box}.\n */"],
            ["/** {@link Box | it}. */", "/** {@link A | it}. */"],
            ["/** {@link Box}. */", "/** {@link Box | other}. */"],
            ["/** `Box` */", "/** Box */"],
            [
              "/**\n * ```ts\n * x\n * ```\n */",
              "/**\n * ```js\n * x\n * ```\n */",
            ],
          ] as const,
          async ([left, right]) => equivalent(left, right),
        ),
      ),
    ).resolves.toStrictEqual([true, false, false, false, false]);
  });
});
