import { Array, ManagedRuntime, Option, pipe } from "effect";
import { isFunctionDeclaration } from "typescript/ast";
import { afterAll, describe, expect, test } from "vitest";

import * as AST from "../src/AST/index.js";
import * as Code from "../src/Code.js";
import * as Syntax from "../src/internal/signature-syntax.js";
import * as Api from "../src/TypeScript/Api.js";
import * as Pages from "./fixtures/pages.js";
import * as ParserFixture from "./fixtures/parser.js";

import type * as Compiler from "./fixtures/compiler.js";
import type { Node } from "typescript/ast";

const runtime = ManagedRuntime.make(Api.layer);

const declarations = `
export interface Element {}
export interface Collection<A, B = Element> {}
export interface Selection<T> {}
export interface Projection<T> {}
`;

/** The line below a page's `**Returns**` label. */
const returnsOf = (markdown: string): string => {
  const lines = markdown.split("\n");
  return pipe(
    lines,
    Array.findFirstIndex((line) => line === "**Returns**"),
    Option.flatMap((index) => Array.get(lines, index + 2)),
    Option.getOrThrow,
  );
};

/** The fixture's `run`, documented, returning `returns`. */
const returning = (returns: string): string =>
  `${declarations}
/**
 * Runs.
 *
 * @returns The result.
 */
export declare function run(): ${returns};`;

/** The return type of the fixture's `run`, with the AST its names resolve in. */
const returnType = async (
  options: Compiler.Options,
): Promise<{ readonly ast: AST.Store["Service"]; readonly type: Node }> => {
  const ast = await ParserFixture.success(options);
  const type = pipe(
    ast.nodes(),
    Array.fromIterable,
    Array.filter(AST.CallSignature.isCallSignature),
    Array.map(({ node }) => node),
    Array.filter(isFunctionDeclaration),
    Array.findFirst((node) => node.name?.text === "run"),
    Option.flatMap((node) => Option.fromUndefinedOr(node.type)),
    Option.getOrThrow,
  );

  return { ast, type };
};

const printed = async (
  { ast, type }: Awaited<ReturnType<typeof returnType>>,
  depth: Option.Option<number>,
): Promise<{ readonly text: string; readonly links: readonly string[] }> => {
  const nodes = Option.match(depth, {
    onNone: () => [type],
    onSome: (value) => Syntax.elide([type], value),
  });
  const source = await runtime.runPromise(Code.print(nodes, ast));

  return {
    text: source.text,
    links: Array.map(source.names, ({ offset, length }) =>
      source.text.slice(offset, offset + length),
    ),
  };
};

describe("print", () => {
  afterAll(async () => {
    await runtime.dispose();
  });

  describe("terms", () => {
    test("whole_type", async () => {
      expect.hasAssertions();
      const markdown = await Pages.markdown({
        source: returning("Collection<Selection<Element>>"),
      });
      expect(returnsOf(markdown)).toBe("`Collection<Selection<Element>>`");
    });

    test("deepest_first", async () => {
      expect.hasAssertions();
      const markdown = await Pages.markdown({
        source: returning(
          "Collection<Selection<Projection<Element>>, Selection<Element>>",
        ),
      });
      expect(returnsOf(markdown)).toBe(
        "`Collection<Selection<Projection<…>>, Selection<Element>>`",
      );
    });

    test("outermost_last", async () => {
      expect.hasAssertions();
      const markdown = await Pages.markdown({
        source: returning(
          "Collection<Element> | Selection<Element> | Projection<Element> | Collection<Selection<Element>> | Selection<Projection<Element>>",
        ),
      });
      const line = returnsOf(markdown);
      expect(line).toContain("Collection<…>");
      expect(line).not.toContain("Element");
    });

    test("alike_forms", async () => {
      expect.hasAssertions();
      const markdown = await Pages.markdown({
        source: `${declarations}
/**
 * Runs.
 *
 * @param name - The name.
 * @returns The result.
 */
export declare function run<N extends string>(name: N): Collection<Selection<Projection<Element>>, Selection<Element>>;
export declare function run<N extends string>(name: N, other: N): Collection<Selection<Projection<Selection<Element>>>, Selection<Element>>;
export declare function run<N extends string>(name: N, other: N, last: N): Element;`,
      });
      expect(markdown).toContain("`name: N`");
      expect(returnsOf(markdown)).toBe(
        "`Collection<Selection<Projection<…>>, Selection<Element>>` (1, 2), `Element` (3)",
      );
    });
  });

  describe("elision", () => {
    test("nested_arguments", async () => {
      expect.hasAssertions();
      const fixture = await returnType({
        source: returning(
          "Collection<Selection<Element>, Element> | Selection<Element>",
        ),
      });
      await expect(printed(fixture, Option.some(1))).resolves.toStrictEqual({
        text: "Collection<Selection<…>, Element> | Selection<Element>",
        links: ["Collection", "Selection", "Element", "Selection", "Element"],
      });
      await expect(printed(fixture, Option.some(0))).resolves.toStrictEqual({
        text: "Collection<…> | Selection<…>",
        links: ["Collection", "Selection"],
      });
      await expect(printed(fixture, Option.none())).resolves.toHaveProperty(
        "text",
        "Collection<Selection<Element>, Element> | Selection<Element>",
      );
    });

    test("depth", async () => {
      expect.hasAssertions();
      const nested = await returnType({
        source: returning(
          "Collection<Selection<Projection<Element>>> | Element",
        ),
      });
      const plain = await returnType({
        source: returning("Element | Element[]"),
      });
      expect([
        Syntax.deepest([nested.type]),
        Syntax.deepest([plain.type]),
      ]).toStrictEqual([Option.some(2), Option.none()]);
    });

    test.each([
      "value is Selection<Element>",
      "asserts value is Selection<Element>",
    ])("predicate_%s", async (returns) => {
      expect.hasAssertions();
      const fixture = await returnType({
        source: `${declarations}
/**
 * Runs.
 *
 * @returns The result.
 */
export declare function run(value: unknown): ${returns};`,
      });
      const elided = await printed(fixture, Option.some(0));
      expect(elided.text).toBe(returns.replace("<Element>", "<…>"));
    });

    test("import_arguments", async () => {
      expect.hasAssertions();
      const fixture = await returnType({
        source: returning('import("./other.js").Box<Element>'),
        files: { "other.d.ts": "export interface Box<T> {}" },
      });
      const elided = await printed(fixture, Option.some(0));
      expect(elided.text).toBe('import("./other.js").Box<…>');
      expect(elided.links).not.toContain("Element");
    });

    test("marker_spelling", async () => {
      expect.hasAssertions();
      const fixture = await returnType({
        source: `export interface _ {}
${returning('[_, Selection<Element>, "_"]')}`,
      });
      await expect(printed(fixture, Option.some(0))).resolves.toStrictEqual({
        text: '[_, Selection<…>, "_"]',
        links: ["_", "Selection"],
      });
    });
  });
});
