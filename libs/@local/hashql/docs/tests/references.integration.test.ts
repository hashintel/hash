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
    Match.tag(
      "Parameter",
      "TypeParameter",
      "Property",
      "Method",
      "Accessor",
      "EnumMember",
      ({ _tag, name }) => `${_tag} ${name}`,
    ),
    Match.tag("ExternalItem", ({ name }) => `ExternalItem ${name}`),
    Match.orElse(({ _tag }) => _tag),
  );

/** Every identifier of the fixture's file that `lookup` resolves, in source order, with the node it resolves to. */
const resolved = Effect.fnUntraced(function* (
  source: string,
  lookup: (ast: AST.Store["Service"]) => References.Names,
) {
  const ast = yield* ParserFixture.success({ source });
  const names = lookup(ast);
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
          References.namesOf,
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
          References.namesOf,
        ),
      ).toStrictEqual([
        ["value", "Parameter value"],
        ["A", "Declaration A"],
      ]);
    }),
  );

  it.effect(
    "declared_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* resolved(
          [
            "export interface Box<Item> { value: Item; map<Next>(apply: (item: Item) => Next): Box<Next>; }",
            "export declare class Counter { get count(): number; set count(next: number); }",
            "export declare enum Mode { Fast }",
            "export declare function sum(first: number): number;",
            "export declare function sum({ left, right: [inner] }: { left: number; right: [number] }): number;",
            "export declare namespace Space { const inside: Mode; }",
            "export type Pair = Box<Mode>;",
            "export declare const pick: (from: Pair) => Mode;",
            "export interface Runner { run: (input: Pair) => Mode; }",
          ].join("\n"),
          References.linksOf,
        ),
      ).toStrictEqual([
        ["Box", "Declaration Box"],
        ["Item", "TypeParameter Item"],
        ["value", "Property value"],
        ["Item", "TypeParameter Item"],
        ["map", "Method map"],
        ["Next", "TypeParameter Next"],
        ["apply", "Parameter apply"],
        ["item", "Parameter item"],
        ["Item", "TypeParameter Item"],
        ["Next", "TypeParameter Next"],
        ["Box", "Declaration Box"],
        ["Next", "TypeParameter Next"],
        ["Counter", "Declaration Counter"],
        ["count", "Accessor count"],
        ["count", "Accessor count"],
        ["next", "Parameter next"],
        ["Mode", "Declaration Mode"],
        ["Fast", "EnumMember Fast"],
        ["sum", "Declaration sum"],
        ["first", "Parameter first"],
        ["sum", "Declaration sum"],
        ["left", "Parameter { left, right: [inner] }"],
        ["inner", "Parameter { left, right: [inner] }"],
        ["left", "Property left"],
        ["right", "Property right"],
        ["Space", "Declaration Space"],
        ["inside", "Declaration inside"],
        ["Mode", "Declaration Mode"],
        ["Pair", "Declaration Pair"],
        ["Box", "Declaration Box"],
        ["Mode", "Declaration Mode"],
        ["pick", "Declaration pick"],
        ["from", "Parameter from"],
        ["Pair", "Declaration Pair"],
        ["Mode", "Declaration Mode"],
        ["Runner", "Declaration Runner"],
        ["run", "Method run"],
        ["input", "Parameter input"],
        ["Pair", "Declaration Pair"],
        ["Mode", "Declaration Mode"],
      ]);
    }),
  );
});
