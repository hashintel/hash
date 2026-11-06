import { Array, HashMap, Option, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Tree from "../src/Tree/index.js";
import * as Reference from "./fixtures/reference.js";

const fixture = `/** Read \`value\` through {@link Box}.
 *
 * More detail.
 * @remarks Keep the details.
 * @deprecated Use {@link Box} instead.
 * @see {@link Box}
 * @see Another source.
 * @since 1.2.3
 * @category Builders
 * @stability beta
 * @internal
 * @custom Extension text.
 */`;

const examples = `/** Example source.
 * @example
 * \`\`\`json
 * { "value": 1 }
 * \`\`\`
 * @example
 * <caption>Build \`value\` through {@link Box}.</caption>
 * \`\`\`ts
 * Box
 * \`\`\`
 */`;

/** The content of `comment` on a public declaration beside `Box`. */
const contentOf = async (comment: string): Promise<Tree.Comment.Comment> => {
  const reference = await Reference.success({
    source: `export interface Box {}\n${comment}\nexport type Use = string;`,
    configuration: "render-tsdoc.json",
  });

  return pipe(
    HashMap.get(reference.document.entries, Reference.id(reference, ["Use"])),
    Option.flatMap(({ comments }) => Array.head(comments)),
    Option.getOrThrow,
  );
};

/** The plain text of each block list. */
const plainOf = (
  sections: readonly { readonly children: readonly Tree.Prose.Block[] }[],
): readonly Option.Option<string>[] =>
  Array.map(sections, ({ children }) => Tree.Prose.plain(children));

/** The phrasing of every paragraph among `blocks`. */
const phrasingOf = (
  blocks: readonly Tree.Prose.Block[],
): readonly Tree.Prose.Phrasing[] =>
  Array.flatMap(blocks, (block) => {
    if (block.type !== "paragraph") {
      return [];
    }

    return block.children;
  });

const typesOf = (
  nodes: readonly (Tree.Prose.Block | Tree.Prose.Phrasing)[],
): readonly string[] => Array.map(nodes, ({ type }) => type);

describe("content", () => {
  test("description", async () => {
    expect.hasAssertions();
    const content = await contentOf(fixture);
    const blocks = pipe(
      content.description,
      Option.map(({ children }) => children),
      Option.getOrThrow,
    );
    expect(
      plainOf(Array.map(blocks, (block) => ({ children: [block] }))),
    ).toStrictEqual([
      Option.some("Read value through Box."),
      Option.some("More detail."),
    ]);
  });

  test("remarks_deprecation", async () => {
    expect.hasAssertions();
    const content = await contentOf(fixture);
    expect(plainOf(Option.toArray(content.remarks))).toStrictEqual([
      Option.some("Keep the details."),
    ]);
    const deprecation = Option.getOrThrow(content.facts.deprecation);
    expect(plainOf([deprecation])).toStrictEqual([
      Option.some("Use Box instead."),
    ]);
    expect(typesOf(phrasingOf(deprecation.children))).toStrictEqual([
      "text",
      "link",
      "text",
    ]);
  });

  test("references_extensions", async () => {
    expect.hasAssertions();
    const content = await contentOf(fixture);
    expect(plainOf(content.see)).toStrictEqual([
      Option.some("Box"),
      Option.some("Another source."),
    ]);
    expect(
      Array.map(content.custom, ({ tag, children }) => [
        tag,
        Tree.Prose.plain(children),
      ]),
    ).toStrictEqual([["@custom", Option.some("Extension text.")]]);
  });

  test("facts", async () => {
    expect.hasAssertions();
    const { facts, origin } = await contentOf(fixture);
    expect([
      Option.map(facts.since, ({ version }) => version),
      Option.map(facts.stability, ({ level }) => level),
      Option.isSome(facts.internal),
      Option.map(origin.category, ({ name }) => name),
    ]).toStrictEqual([
      Option.some("1.2.3"),
      Option.some("beta"),
      true,
      Option.some("Builders"),
    ]);
  });

  test("examples", async () => {
    expect.hasAssertions();
    const content = await contentOf(examples);
    expect(
      Array.map(content.examples, ({ language, code, program }) => [
        language,
        code,
        Option.isSome(program),
      ]),
    ).toStrictEqual([
      [Option.some("json"), '{ "value": 1 }', false],
      [Option.some("ts"), "Box", true],
    ]);
    expect(
      pipe(
        content.examples,
        Array.map(({ caption }) =>
          Option.map(caption, ({ children }) => typesOf(children)),
        ),
      ),
    ).toStrictEqual([
      Option.none(),
      Option.some(["text", "inlineCode", "text", "link", "text"]),
    ]);
  });

  test("optional_sections", async () => {
    expect.hasAssertions();
    const content = await contentOf("/** Brief. */");
    expect(content).toMatchObject({
      remarks: Option.none(),
      see: [],
      examples: [],
      custom: [],
      facts: {
        since: Option.none(),
        stability: Option.none(),
        internal: Option.none(),
        deprecation: Option.none(),
      },
    });
  });
});
