import { describe, expect, layer } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";
import { isFunctionDeclaration } from "typescript/ast";

import * as AST from "../src/AST/index.js";
import * as Code from "../src/Code.js";
import * as References from "../src/internal/references.js";
import * as Syntax from "../src/internal/signature-syntax.js";
import * as Api from "../src/TypeScript/Api.js";
import * as Pages from "./fixtures/pages.js";
import * as ParserFixture from "./fixtures/parser.js";

import type { Node } from "typescript/ast";

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
const returnType = Effect.fnUntraced(function* (options: {
  readonly source: string;
  readonly files?: Readonly<Record<string, string>>;
}): Effect.fn.Return<
  { readonly ast: AST.Store["Service"]; readonly type: Node },
  Effect.Error<ReturnType<typeof ParserFixture.success>>
> {
  const ast = yield* ParserFixture.success(options);
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
});

const printed = Effect.fnUntraced(function* (
  { ast, type }: Effect.Success<ReturnType<typeof returnType>>,
  depth: Option.Option<number>,
) {
  const nodes = Option.match(depth, {
    onNone: () => [type],
    onSome: (value) => Syntax.elide([type], value),
  });
  const source = yield* Code.print(nodes, References.namesOf(ast));

  return {
    text: source.text,
    links: Array.map(source.names, ({ offset, length }) =>
      source.text.slice(offset, offset + length),
    ),
  };
});

layer(Api.layer, { excludeTestServices: true })("print", (it) => {
  describe("terms", () => {
    it.effect(
      "whole_type",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const markdown = yield* Pages.markdown({
          source: returning("Collection<Selection<Element>>"),
        });
        expect(returnsOf(markdown)).toBe("`Collection<Selection<Element>>`");
      }),
    );

    it.effect(
      "deepest_first",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const markdown = yield* Pages.markdown({
          source: returning(
            "Collection<Selection<Projection<Element>>, Selection<Element>>",
          ),
        });
        expect(returnsOf(markdown)).toBe(
          "`Collection<Selection<Projection<…>>, Selection<Element>>`",
        );
      }),
    );

    it.effect(
      "outermost_last",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const markdown = yield* Pages.markdown({
          source: returning(
            "Collection<Element> | Selection<Element> | Projection<Element> | Collection<Selection<Element>> | Selection<Projection<Element>>",
          ),
        });
        const line = returnsOf(markdown);
        expect(line).toContain("Collection<…>");
        expect(line).not.toContain("Element");
      }),
    );

    it.effect(
      "alike_forms",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const markdown = yield* Pages.markdown({
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
      }),
    );
  });

  describe("elision", () => {
    it.effect(
      "nested_arguments",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const fixture = yield* returnType({
          source: returning(
            "Collection<Selection<Element>, Element> | Selection<Element>",
          ),
        });
        expect(yield* printed(fixture, Option.some(1))).toStrictEqual({
          text: "Collection<Selection<…>, Element> | Selection<Element>",
          links: ["Collection", "Selection", "Element", "Selection", "Element"],
        });
        expect(yield* printed(fixture, Option.some(0))).toStrictEqual({
          text: "Collection<…> | Selection<…>",
          links: ["Collection", "Selection"],
        });
        expect(yield* printed(fixture, Option.none())).toHaveProperty(
          "text",
          "Collection<Selection<Element>, Element> | Selection<Element>",
        );
      }),
    );

    it.effect(
      "depth",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const nested = yield* returnType({
          source: returning(
            "Collection<Selection<Projection<Element>>> | Element",
          ),
        });
        const plain = yield* returnType({
          source: returning("Element | Element[]"),
        });
        expect([
          Syntax.deepest([nested.type]),
          Syntax.deepest([plain.type]),
        ]).toStrictEqual([Option.some(2), Option.none()]);
      }),
    );

    it.effect.each([
      "value is Selection<Element>",
      "asserts value is Selection<Element>",
    ])(
      "predicate_%s",
      Effect.fnUntraced(function* (returns: string) {
        expect.hasAssertions();
        const fixture = yield* returnType({
          source: `${declarations}
/**
 * Runs.
 *
 * @returns The result.
 */
export declare function run(value: unknown): ${returns};`,
        });
        const elided = yield* printed(fixture, Option.some(0));
        expect(elided.text).toBe(returns.replace("<Element>", "<…>"));
      }),
    );

    it.effect(
      "import_arguments",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const fixture = yield* returnType({
          source: returning('import("./other.js").Box<Element>'),
          files: { "other.d.ts": "export interface Box<T> {}" },
        });
        const elided = yield* printed(fixture, Option.some(0));
        expect(elided.text).toBe('import("./other.js").Box<…>');
        expect(elided.links).not.toContain("Element");
      }),
    );

    it.effect(
      "marker_spelling",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const fixture = yield* returnType({
          source: `export interface _ {}
${returning('[_, Selection<Element>, "_"]')}`,
        });
        expect(yield* printed(fixture, Option.some(0))).toStrictEqual({
          text: '[_, Selection<…>, "_"]',
          links: ["_", "Selection"],
        });
      }),
    );
  });
});
