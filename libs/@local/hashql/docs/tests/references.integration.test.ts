import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, Match, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as References from "../src/internal/references.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as ParserFixture from "./fixtures/parser.js";

/** A node a name resolves to, by its kind and its name. */
const describeTarget = (node: AST.Target.Target): string =>
  Match.value(node).pipe(
    Match.tag("Declaration", ({ symbol }) => `Declaration ${symbol.name}`),
    Match.tag("Parameter", ({ name }) => `Parameter ${name}`),
    Match.tag("ExternalItem", ({ name }) => `ExternalItem ${name}`),
    Match.orElse(({ _tag }) => _tag),
  );

/** Every identifier of the fixture's file that the index resolves, in source order, with the node it resolves to. */
const resolved = Effect.fnUntraced(function* (source: string) {
  const ast = yield* ParserFixture.success({ source });
  const names = References.namesOf(ast);
  const file = pipe(
    Array.fromIterable(ast.nodes()),
    Array.findFirst(AST.TypeReference.isTypeReference),
    Option.map(({ node }) => node.getSourceFile()),
    Option.getOrThrow,
  );

  return Array.flatMap(TypeScript.Node.identifiers(file), (name) =>
    pipe(
      names(name),
      Option.map((target) => [name.text, describeTarget(ast.get(target))]),
      Option.toArray,
    ),
  );
});

describe("references", () => {
  it.effect(
    "qualified_and_imported_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* resolved(
          [
            "export namespace Outer { export interface Inner {} }",
            "export interface A {}",
            'export declare function run(value: Outer.Inner, other: import("./declarations.js").A): void;',
          ].join("\n"),
        ),
      ).toStrictEqual([
        ["Outer", "Declaration Outer"],
        ["Inner", "Declaration Inner"],
        ["A", "Declaration A"],
      ]);
    }),
  );

  it.effect(
    "type_predicate",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* resolved(
          "export interface A {}\nexport declare function is(value: unknown): value is A;",
        ),
      ).toStrictEqual([
        ["value", "Parameter value"],
        ["A", "Declaration A"],
      ]);
    }),
  );
});
