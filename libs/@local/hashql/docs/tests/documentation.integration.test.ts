import { fileURLToPath } from "node:url";

import {
  DocCodeSpan,
  DocExcerpt,
  DocLinkTag,
  DocPlainText,
  TSDocConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import { Array, Chunk, Effect, Option, Result, pipe } from "effect";
import { isJSDoc } from "typescript/ast";
import { describe, expect, test } from "vitest";

import * as AST from "../src/AST/index.js";
import * as DocumentationParser from "../src/DocumentationParser.js";
import * as Compiler from "./fixtures/compiler.js";
import * as ParserFixture from "./fixtures/parser.js";

import type * as DocumentationError from "../src/DocumentationError.js";
import type { DocNode } from "@microsoft/tsdoc";

/** The standard tags, the package's own, and a custom block a package might define. */
const configuration = (): TSDocConfiguration => {
  const value = new TSDocConfiguration();
  for (const tagName of ["@since", "@category", "@stability", "@custom"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
      }),
    );
  }
  for (const tagName of ["@module", "@trait"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.ModifierTag,
      }),
    );
  }
  value.setSupportedHtmlElements(["caption", "code"]);
  return value;
};

/** `comment` parsed as the compiler reads it above a declaration. */
const parse = async (
  comment: string,
  parser: DocumentationParser.DocumentationParser["Service"] = DocumentationParser.make(
    configuration(),
  ),
): Promise<
  Result.Result<
    AST.Documentation.Documentation,
    DocumentationError.DocumentationError
  >
> => {
  const fixture = await Compiler.open({
    source: `${comment}\nexport type Subject = string;`,
  });
  try {
    // The comment as written, whatever it documents, so a `@module` comment parses too.
    const jsDoc = pipe(
      Array.head(fixture.source.statements),
      Option.flatMap(({ jsDoc: comments }) =>
        Array.findLast(comments ?? [], isJSDoc),
      ),
      Option.getOrThrow,
    );
    return await Effect.runPromise(Effect.result(parser.parse(jsDoc)));
  } finally {
    await fixture.api.close();
  }
};

const descendants = (node: DocNode): DocNode[] =>
  pipe(node.getChildNodes(), Array.flatMap(descendants), Array.prepend(node));
const plain = (node: DocNode): string =>
  pipe(
    descendants(node),
    Array.filter((child) => child instanceof DocPlainText),
    Array.map((child) => child.text),
    Array.join(""),
    (text) => text.trim(),
  );
const codes = (nodes: readonly DocNode[]): string[] =>
  pipe(
    nodes,
    Array.filter((node) => node instanceof DocCodeSpan),
    Array.map((node) => node.code),
  );
const links = (nodes: readonly DocNode[]): DocLinkTag[] =>
  Array.filter(nodes, (node) => node instanceof DocLinkTag);

const fixture = `/**
 * Read \`value\` through {@link Box | its box}.
 *
 * @remarks Keep the rich paragraph.
 * @param value - The input.
 * @typeParam T - The payload.
 * @returns The output.
 * @throws The first failure.
 * @throws The second failure.
 * @see {@link https://example.com | Reference}
 * @since 1.2.3
 * @category Constructors
 * @stability beta
 * @deprecated Use {@link next}.
 * @custom Visible extension.
 * @internal
 * @trait
 * @module
 * @example
 * <caption>Build \`Box\` with {@link make}.</caption>
 * \`\`\`ts
 * const value = {
 *   nested: 1,
 * };
 * \`\`\`
 * @privateRemarks Do not publish this.
 */`;

const documented = async (): Promise<AST.Documentation.Documentation> =>
  Result.getOrThrow(await parse(fixture));

const source = `export type Box = string;
/** String overload with {@link Box}. */
export function choose(value: Box): string;
/** Numeric overload. */
export function choose(value: number): number;
/** A callable value. */
export const call: (value: Box) => Box;
`;

/** The comment `documentation` names, as TSDoc writes it again. */
const emitted = (
  ast: AST.Store["Service"],
  documentation: Option.Option<AST.Documentation.Interned>,
): Option.Option<string> =>
  Option.map(documentation, (id) => ast.get(id).source.emitAsTsdoc());

describe("documentation", () => {
  test("rich_description", async () => {
    expect.hasAssertions();
    const doc = await documented();
    const nodes = descendants(doc.source.summarySection);
    expect(plain(doc.source.summarySection)).toContain("Read");
    expect(codes(nodes)).toStrictEqual(["value"]);
    expect(Array.map(links(nodes), ({ linkText }) => linkText)).toStrictEqual([
      "its box",
    ]);
    expect(
      Option.map(doc.remarks, ({ content }) => plain(content)),
    ).toStrictEqual(Option.some("Keep the rich paragraph."));
  });

  test("parameters", async () => {
    expect.hasAssertions();
    const doc = await documented();
    expect([
      Array.map(doc.parameters, ({ name, content }) => [name, plain(content)]),
      Array.map(doc.typeParameters, ({ name, content }) => [
        name,
        plain(content),
      ]),
      Option.map(doc.returns, ({ content }) => plain(content)),
      Array.map(doc.throws, ({ content }) => plain(content)),
    ]).toStrictEqual([
      [["value", "The input."]],
      [["T", "The payload."]],
      Option.some("The output."),
      ["The first failure.", "The second failure."],
    ]);
  });

  test("metadata", async () => {
    expect.hasAssertions();
    const doc = await documented();
    expect([
      Option.map(doc.since, ({ version }) => version),
      Option.map(doc.category, ({ name }) => name),
      Option.map(doc.stability, ({ level }) => level),
    ]).toStrictEqual([
      Option.some("1.2.3"),
      Option.some("Constructors"),
      Option.some("beta"),
    ]);
    expect(
      Array.map([doc.internal, doc.trait, doc.module], Option.isSome),
    ).toStrictEqual([true, true, true]);
    expect(Array.map(doc.modifiers, ({ tag }) => tag)).toContain("@trait");
  });

  test("remaining_content", async () => {
    expect.hasAssertions();
    const doc = await documented();
    expect(doc.see).toHaveLength(1);
    expect(
      Option.map(
        doc.deprecated,
        ({ content }) => links(descendants(content)).length,
      ),
    ).toStrictEqual(Option.some(1));
    expect(
      Array.map(doc.customBlocks, ({ tag, content }) => [tag, plain(content)]),
    ).toStrictEqual([["@custom", "Visible extension."]]);
    expect(
      Option.map(
        Option.fromUndefinedOr(doc.source.privateRemarks),
        ({ content }) => plain(content),
      ),
    ).toStrictEqual(Option.some("Do not publish this."));
  });

  test("example_caption_and_indentation", async () => {
    expect.hasAssertions();
    const doc = await documented();
    expect(doc.examples).toHaveLength(1);
    const example = Array.head(doc.examples).pipe(Option.getOrThrow);
    expect([example.language, example.code]).toStrictEqual([
      "ts",
      "const value = {\n  nested: 1,\n};",
    ]);
    const caption = Option.getOrThrow(example.caption).content;
    expect([codes(caption), links(caption).length]).toStrictEqual([["Box"], 1]);
  });

  test("caption_spacing", async () => {
    expect.hasAssertions();
    const doc = Result.getOrThrow(
      await parse(
        "/**\n * @example\n * <caption>{@link First} {@link Second}</caption>\n * ```ts\n * const x = 1;\n * ```\n */",
      ),
    );
    const caption = pipe(
      Array.head(doc.examples),
      Option.flatMap(({ caption: value }) => value),
      Option.getOrThrow,
    ).content;
    expect(
      pipe(
        caption,
        Array.filter((node) => node instanceof DocPlainText),
        Array.map(({ text }) => text),
      ),
    ).toStrictEqual([" "]);
  });

  test("example_without_caption", async () => {
    expect.hasAssertions();
    const doc = Result.getOrThrow(
      await parse("/**\n * @example\n * ```ts\n * const x = 1;\n * ```\n */"),
    );
    const example = Array.head(doc.examples).pipe(Option.getOrThrow);
    expect([example.caption, example.code]).toStrictEqual([
      Option.none(),
      "const x = 1;",
    ]);
  });

  test.each([
    ["missing_code", "/** @example Just prose. */"],
    [
      "two_blocks",
      "/**\n * @example\n * ```ts\n * 1\n * ```\n * ```ts\n * 2\n * ```\n */",
    ],
    [
      "uncaptioned_prose",
      "/**\n * @example\n * A description.\n * ```ts\n * 1\n * ```\n */",
    ],
  ])("invalid_example_%s", async (_, input) => {
    expect.hasAssertions();
    await expect(parse(input)).resolves.toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidExample" } },
    });
  });

  test("unknown_stability", async () => {
    expect.hasAssertions();
    await expect(parse("/** @stability frozen */")).resolves.toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "UnknownStability" } },
    });
  });

  test.each(["@since", "@category", "@stability"])(
    "duplicate_%s",
    async (tag) => {
      expect.hasAssertions();
      await expect(
        parse(`/**\n * ${tag} beta\n * ${tag} stable\n */`),
      ).resolves.toMatchObject({
        _tag: "Failure",
        failure: { reason: { _tag: "DuplicateTag", tag } },
      });
    },
  );

  test("absence", async () => {
    expect.hasAssertions();
    const doc = Result.getOrThrow(await parse("/** A summary. */"));
    expect([doc.examples, doc.stability, doc.inheritDoc]).toStrictEqual([
      [],
      Option.none(),
      Option.none(),
    ]);
  });

  test("inherit_doc", async () => {
    expect.hasAssertions();
    const doc = Result.getOrThrow(await parse("/** {@inheritDoc Box} */"));
    expect(
      pipe(
        doc.inheritDoc,
        Option.flatMap(({ reference }) => reference),
        Option.map((reference) => reference.emitAsTsdoc()),
      ),
    ).toStrictEqual(Option.some("Box"));
  });

  test("package_configuration", async () => {
    expect.hasAssertions();
    const configured = await Effect.runPromise(
      DocumentationParser.fromFile(
        fileURLToPath(
          new URL("../../sdk/typescript/tsdoc.json", import.meta.url),
        ),
      ),
    );
    const doc = Result.getOrThrow(
      await parse(
        "/** A model.\n * @stability beta\n * @trait\n */",
        configured,
      ),
    );
    expect([
      Option.isSome(doc.trait),
      Option.map(doc.stability, ({ level }) => level),
    ]).toStrictEqual([true, Option.some("beta")]);
  });

  test("missing_configuration", async () => {
    expect.hasAssertions();
    const file = fileURLToPath(
      new URL("fixtures/missing-tsdoc.json", import.meta.url),
    );
    await expect(
      Effect.runPromise(Effect.result(DocumentationParser.fromFile(file))),
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: { file, reason: { _tag: "InvalidConfiguration", file } },
    });
  });

  test("overload_comments", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({ source });
    const group = pipe(
      Array.fromIterable(ast.nodes()),
      Array.findFirst(AST.FunctionOverloads.isFunctionOverloads),
      Option.getOrThrow,
    );
    expect(
      Array.map(Chunk.toReadonlyArray(group.overloads), (id) =>
        emitted(ast, ast.get(id).documentation),
      ),
    ).toStrictEqual([
      Option.some("/**\n * String overload with {@link Box}.\n */\n"),
      Option.some("/**\n * Numeric overload.\n */\n"),
    ]);
  });

  test("source_positions", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({ source });
    const call = pipe(
      Array.fromIterable(ast.nodes()),
      Array.findFirst(AST.CallSignature.isCallSignature),
      Option.flatMap(({ documentation }) => documentation),
      Option.map(ast.get),
      Option.getOrThrow,
    );
    const range = pipe(
      links(descendants(call.source.summarySection)),
      Array.head,
      Option.flatMap((link) =>
        Array.findFirst(
          link.getChildNodes(),
          (node) => node instanceof DocExcerpt,
        ),
      ),
      Option.getOrThrow,
      (node) => node.content.getContainingTextRange(),
    );
    expect([range.pos, source.slice(range.pos, range.end)]).toStrictEqual([
      source.indexOf("{@link"),
      "{",
    ]);
    expect(call.node.getSourceFile().text).toBe(source);
  });

  test("callable_constant_comment", async () => {
    expect.hasAssertions();
    const ast = await ParserFixture.success({ source });
    const call = pipe(
      Array.fromIterable(ast.nodes()),
      Array.findFirst(AST.CallableConstant.isCallableConstant),
      Option.getOrThrow,
    );
    expect(emitted(ast, call.documentation)).toStrictEqual(
      Option.some("/**\n * A callable value.\n */\n"),
    );
  });

  test("diagnostic_position", async () => {
    expect.hasAssertions();
    const invalid =
      "export type Prefix = string;\n/** @unknownTag text */\nexport type Bad = string;";
    await expect(
      ParserFixture.parse({ source: invalid }),
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        file: fileURLToPath(
          new URL("fixtures/declarations.d.ts", import.meta.url),
        ),
        reason: {
          _tag: "InvalidComment",
          diagnostics: [
            {
              messageId: "tsdoc-undefined-tag",
              start: invalid.indexOf("@unknownTag"),
              end: invalid.indexOf("@unknownTag") + "@unknownTag".length,
            },
          ],
        },
      },
    });
  });
});
