import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, HashMap, Option, pipe } from "effect";

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
  | readonly ["link", AST.Target.Interned | string, readonly Shape[]]
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
            : node.destination,
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
const described = Effect.fnUntraced(function* (
  comment: string,
): Effect.fn.Return<Described, Reference.Failure> {
  const reference = yield* Reference.success({
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
});

/** Whether two comments' descriptions say the same, wherever they stand. */
const equivalent = Effect.fnUntraced(function* (left: string, right: string) {
  const [self, that] = yield* Effect.all([described(left), described(right)], {
    concurrency: "unbounded",
  });

  return Tree.Prose.equivalence(self.blocks, that.blocks);
});

describe("prose", () => {
  it.effect(
    "rich_lead",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { reference, blocks } = yield* described(
        "/** Read `input` through {@link Box}.\n *\n * More detail.\n */",
      );
      expect(shapeOf(blocks)).toStrictEqual([
        [
          "paragraph",
          [
            ["text", "Read "],
            ["inlineCode", "input"],
            ["text", " through "],
            ["link", Reference.id(reference, ["Box"]), [["inlineCode", "Box"]]],
            ["text", "."],
          ],
        ],
        ["paragraph", [["text", "More detail."]]],
      ]);
      expect(Tree.Prose.plain(blocks)).toStrictEqual(
        Option.some("Read input through Box."),
      );
    }),
  );

  it.effect(
    "link_spacing",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { reference, blocks } = yield* described(
        "/** {@link A} {@link B} */",
      );
      expect(shapeOf(blocks)).toStrictEqual([
        [
          "paragraph",
          [
            ["link", Reference.id(reference, ["A"]), [["inlineCode", "A"]]],
            ["text", " "],
            ["link", Reference.id(reference, ["B"]), [["inlineCode", "B"]]],
          ],
        ],
      ]);
    }),
  );

  it.effect(
    "link_labels",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const labelled = yield* described("/** {@link Box | its `value`} */");
      expect(shapeOf(labelled.blocks)).toStrictEqual([
        [
          "paragraph",
          [
            [
              "link",
              Reference.id(labelled.reference, ["Box"]),
              [
                ["text", "its "],
                ["inlineCode", "value"],
              ],
            ],
          ],
        ],
      ]);
      const unfinished = yield* described(
        "/** {@link Box | an `unfinished label} */",
      );
      expect(Tree.Prose.plain(unfinished.blocks)).toStrictEqual(
        Option.some("an `unfinished label"),
      );
    }),
  );

  it.effect(
    "url_label",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described(
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
    }),
  );

  it.effect(
    "qualified_label",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described(
        "/** {@link @scope/pkg#Space.Value} */",
      );
      expect(Tree.Prose.plain(blocks)).toStrictEqual(
        Option.some("Space.Value"),
      );
    }),
  );

  it.effect(
    "module_label",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described("/** {@link @scope/pkg#} */");
      expect(Tree.Prose.plain(blocks)).toStrictEqual(Option.some("@scope/pkg"));
    }),
  );

  it.effect(
    "escaped_text",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described(
        String.raw`/** Literal \@tag and \{ braces. */`,
      );
      expect(Tree.Prose.plain(blocks)).toStrictEqual(
        Option.some("Literal @tag and { braces."),
      );
    }),
  );

  it.effect(
    "html_code",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described(
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
    }),
  );

  it.effect(
    "fenced_bytes",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const { blocks } = yield* described(
        "/**\n * ```ts\n * const value = {\n *   text: ` keep `,\n * };\n * ```\n */",
      );
      expect(shapeOf(blocks)).toStrictEqual([
        ["code", Option.some("ts"), "const value = {\n  text: ` keep `,\n};\n"],
      ]);
      expect(Tree.Prose.plain(blocks)).toStrictEqual(Option.none());
    }),
  );

  it.effect(
    "missing_target",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Reference.run({
          source: `/** A private trait with {@link Missing}. @trait */ interface Hidden {}
export declare class Model implements Hidden {}
export {};`,
          configuration: "render-tsdoc.json",
        }),
      ).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "ProseError",
          reason: { _tag: "MissingTarget", reference: "Missing" },
        },
      });
    }),
  );

  it.effect(
    "unsupported_scheme",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Reference.run({
          source:
            "/** See {@link file:///guide.html | the guide}. */ export interface Box {}",
        }),
      ).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "ProseError",
          reason: { _tag: "UnsupportedScheme", url: "file:///guide.html" },
        },
      });
    }),
  );

  it.effect(
    "semantic_equivalence",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Effect.forEach(
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
          ([left, right]) => equivalent(left, right),
          { concurrency: "unbounded" },
        ),
      ).toStrictEqual([true, false, false, false, false]);
    }),
  );
});
