import {
  StandardTags,
  TSDocConfiguration,
  TSDocParser,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import { Array, Effect, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Comment from "./Comment.js";

import type { TransformError } from "./TransformError.js";
import type { DocBlock, DocComment } from "@microsoft/tsdoc";

// The SDK's `tsdoc.json` defines `@since`, and the analysis parses with it.
const configuration = (): TSDocConfiguration => {
  const result = new TSDocConfiguration();
  result.addTagDefinition(
    new TSDocTagDefinition({
      tagName: "@since",
      syntaxKind: TSDocTagSyntaxKind.BlockTag,
    }),
  );

  return result;
};

const parse = (lines: readonly string[]): DocComment =>
  new TSDocParser(configuration()).parseString(
    pipe(
      ["/**", ...lines.map((line) => ` * ${line}`), " */"],
      Array.join("\n"),
    ),
  ).docComment;

const firstExample = (lines: readonly string[]): DocBlock =>
  pipe(
    Comment.blocksTagged(parse(lines), StandardTags.example.tagName),
    Array.head,
    Effect.fromOption,
    Effect.orDie,
    Effect.runSync,
  );

// Only `Known` names something on a page.
const convert = <A>(
  effect: Effect.Effect<A, TransformError, Comment.Links>,
): A =>
  effect.pipe(
    Effect.provideService(
      Comment.Links,
      Comment.Links.of({
        resolve: (reference) =>
          Effect.succeed(
            Option.liftPredicate(
              "/docs/known",
              () => reference.emitAsTsdoc() === "Known",
            ),
          ),
      }),
    ),
    Effect.orDie,
    Effect.runSync,
  );

describe("comment", () => {
  test("summary_links", () => {
    expect.hasAssertions();
    const blocks = convert(
      Comment.section(
        parse(["See {@link Known}, {@link Unknown} and {@link Known | this}."])
          .summarySection,
      ),
    );

    expect(blocks).toStrictEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "See " },
          {
            type: "link",
            url: "/docs/known",
            children: [{ type: "inlineCode", value: "Known" }],
          },
          { type: "text", value: ", " },
          { type: "inlineCode", value: "Unknown" },
          { type: "text", value: " and " },
          {
            type: "link",
            url: "/docs/known",
            children: [{ type: "text", value: "this" }],
          },
          { type: "text", value: "." },
        ],
      },
    ]);
  });

  test("summary_unparsed_syntax", () => {
    expect.hasAssertions();
    const blocks = convert(
      Comment.section(
        parse(["Accepts {a: 1} and links {@link type}."]).summarySection,
      ),
    );

    expect(blocks).toStrictEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Accepts " },
          { type: "text", value: "{" },
          { type: "text", value: "a: 1" },
          { type: "text", value: "}" },
          { type: "text", value: " and links " },
          { type: "inlineCode", value: "type" },
          { type: "text", value: "." },
        ],
      },
    ]);
  });

  test("example_caption", () => {
    expect.hasAssertions();
    const example = firstExample([
      "Summary.",
      "",
      "@example <caption>Build a {@link Known}.</caption>",
      "```ts",
      "const value = 1;",
      "```",
    ]);

    expect(convert(Comment.example(example))).toStrictEqual({
      caption: [
        { type: "text", value: "Build a " },
        {
          type: "link",
          url: "/docs/known",
          children: [{ type: "inlineCode", value: "Known" }],
        },
        { type: "text", value: "." },
      ],
      content: [{ type: "code", lang: "ts", value: "const value = 1;" }],
    });
  });

  test("example_without_caption", () => {
    expect.hasAssertions();
    const example = firstExample(["@example", "```", "plain", "```"]);

    expect(convert(Comment.example(example))).toStrictEqual({
      caption: [],
      content: [{ type: "code", lang: null, value: "plain" }],
    });
  });

  test("words", () => {
    expect.hasAssertions();

    expect(
      pipe(
        Comment.blocksTagged(parse(["@since `4.0.0` beta"]), "@since"),
        Array.head,
        Option.map(({ content }) => Comment.words(content)),
      ),
    ).toStrictEqual(Option.some("4.0.0 beta"));
  });
});
