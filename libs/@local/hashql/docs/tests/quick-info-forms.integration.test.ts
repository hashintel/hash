import { describe, expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, Layer, Option } from "effect";

import * as QuickInfo from "../src/QuickInfo.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Compiler from "./fixtures/compiler.js";

import type { Identifier } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

const declarations = `
export interface Box<T> {
  value: T;
  readonly label?: string;
  get size(): number;
  map<U>(transform: (value: T) => U): Box<U>;
  pair(): readonly [T, T];
}
export interface Wide<T> extends Box<readonly [T]> {}
export declare class Thing<T> {
  constructor(value: T);
  static count: number;
  prop: T;
}
export declare class Options {
  constructor(options: { readonly from: string; where?: [string, number] });
}
export declare namespace Space {
  const value: number;
  namespace Inner { type Kind = string; }
}
export interface Path<T extends string = string> { readonly head: T; }
export declare namespace Path { type Any = Path<string>; }
export type Kind<K extends string> = { readonly kind: K } | undefined;
export declare namespace Kind { type Any = Kind<string>; }
export interface Shape { readonly side: number; }
export declare const Shape: { make(): Shape };
export declare function measure(): void;
export declare namespace measure { type Unit = string; }
export declare function make<T>(value: T): Box<T>;
export declare function make(): Box<never>;
export declare function single(value: string): string;
export declare function five(value: 1): 1;
export declare function five(value: 2): 2;
export declare function five(value: 3): 3;
export declare function five(value: 4): 4;
export declare function five(value: 5): 5;
export declare function shaped<T extends string>(
  pair: [T, { readonly inner: [T] }],
  mapped: { readonly [K in T]?: K },
  text: "é",
): readonly [T, number];
export declare const build: <T>(value: T) => Box<T>;
export declare const tuple: readonly [string, { readonly deep: [1, 2] }];
export declare const dictionary: { [key: string]: number };
export declare enum Colour { Red, Blue = "blue" }
export declare const enum Fixed { One = 1 }
export declare abstract class Abstract<T extends object = {}> { abstract run(): T; }
export type Pair<A, B = A> = readonly [A, B];
export * as Nested from "./nested.js";
`;

const nested = `
export declare const leaf: number;
`;

/** Each name in `code`, read as a module beside the declarations, with what an editor shows on hover over it. */
const inspect = Effect.fnUntraced(function* (code: string) {
  const { file } = yield* Compiler.Fixture;
  const example = `${file}.example.ts`;
  const compiler = yield* TypeScript.Program.extend(
    HashMap.make([example, code]),
  );

  return yield* Effect.gen(function* () {
    const program = yield* TypeScript.Program.Program;
    const checker = yield* TypeScript.Checker.Checker;
    const source = yield* program.sourceFile(example);
    const names = TypeScript.Node.identifiers(Option.getOrThrow(source));
    const symbols = yield* checker.getSymbolAtLocation(names);
    const shown = yield* Effect.forEach(
      Array.zip(names, symbols),
      Effect.fnUntraced(function* ([name, symbol]: readonly [
        Identifier,
        Option.Option<CompilerSymbol>,
      ]) {
        if (Option.isNone(symbol)) {
          return Option.none();
        }

        const info = yield* QuickInfo.of(name, symbol.value);
        const text = yield* Effect.transposeOption(
          Option.map(info, QuickInfo.display),
        );

        return Option.map(text, (value) => [name.text, value] as const);
      }),
    );

    return Array.getSomes(shown);
  }).pipe(Effect.provide(compiler));
});

const fixture = Layer.merge(
  Compiler.layer({
    source: declarations,
    files: { "nested.d.ts": nested },
  }),
  TypeScript.Api.layer,
);

layer(fixture, { excludeTestServices: true })("quick info", (it) => {
  describe("names", () => {
    it.effect(
      "bindings",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`const fixed = "text";
let mutable = 1;
var legacy = true;
const { nested } = { nested: "value" };
function run({ input }: { input: string }) { return input; }
fixed; mutable; legacy; nested;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["fixed", 'const fixed: "text"'],
            ["mutable", "let mutable: number"],
            ["legacy", "var legacy: boolean"],
            ["nested", "const nested: string"],
            ["input", "(parameter) input: string"],
            ["input", "(property) input: string"],
          ]),
        );
      }),
    );

    it.effect(
      "member_qualified_by_holder",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { type Box, Thing, Space } from "./declarations.js";
declare const box: Box<{ a: 1 }>;
box.value; box.label; box.size;
Thing.count;
new Thing("text").prop;
Space.value;
let kind: Space.Inner.Kind;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["value", "(property) Box<{ a: 1; }>.value: {\n    a: 1;\n}"],
            ["label", "(property) Box<{ a: 1; }>.label?: string | undefined"],
            ["size", "(accessor) Box<{ a: 1; }>.size: number"],
            ["count", "(property) Thing<T>.count: number"],
            ["prop", "(property) Thing<string>.prop: string"],
            ["value", "const Space.value: number"],
            ["Inner", "namespace Space.Inner"],
            ["Kind", "type Space.Inner.Kind = string"],
          ]),
        );
      }),
    );

    it.effect(
      "accessors",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`class Counter {
  get current(): number { return 1; }
  set current(value: number) {}
  get fixed(): string { return "text"; }
}
declare const counter: Counter;
counter.current = counter.current + 1; counter.fixed;`);
        expect(names).toStrictEqual([
          ["Counter", "class Counter"],
          ["current", "(accessor) Counter.current: number"],
          ["current", "(accessor) Counter.current: number"],
          ["value", "(parameter) value: number"],
          ["fixed", "(accessor) Counter.fixed: string"],
          ["counter", "const counter: Counter"],
          ["Counter", "class Counter"],
          ["counter", "const counter: Counter"],
          ["current", "(accessor) Counter.current: number"],
          ["counter", "const counter: Counter"],
          ["current", "(accessor) Counter.current: number"],
          ["counter", "const counter: Counter"],
          ["fixed", "(accessor) Counter.fixed: string"],
        ]);
      }),
    );

    it.effect(
      "member_inherited",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import type { Wide } from "./declarations.js";
declare const wide: Wide<string>;
wide.value;`);
        expect(names).toContainEqual([
          "value",
          "(property) Box.value: readonly [string]",
        ]);
      }),
    );

    it.effect(
      "member_in_scope",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`namespace Local {
  export const value = 1;
  export const twice = value * 2;
}
Local.value;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["value", "const value: 1"],
            ["value", "const Local.value: 1"],
          ]),
        );
      }),
    );

    it.effect(
      "index_signature",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { dictionary } from "./declarations.js";
dictionary.anything;`);
        expect(names).toContainEqual(["anything", "number"]);
      }),
    );

    it.effect(
      "expected_property",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { Options } from "./declarations.js";
new Options({ from: "x", where: ["a", 1] });`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["from", "(property) from: string"],
            ["where", "(property) where?: [string, number] | undefined"],
          ]),
        );
      }),
    );
  });

  describe("meanings", () => {
    it.effect(
      "merged_by_position",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { type Path, type Kind, Shape, measure } from "./declarations.js";
let path: Path;
let any: Path.Any;
let kind: Kind.Any;
let shape: Shape;
Shape.make();
let unit: measure.Unit;
measure();`);
        expect(names).toStrictEqual([
          ["Path", "interface Path<T extends string = string>\nnamespace Path"],
          [
            "Kind",
            "namespace Kind\ntype Kind<K extends string> = {\n    readonly kind: K;\n} | undefined",
          ],
          ["Shape", "const Shape: {\n    make(): Shape;\n}\ninterface Shape"],
          ["measure", "function measure(): void\nnamespace measure"],
          ["path", "let path: Path<string>"],
          ["Path", "interface Path<T extends string = string>"],
          ["any", "let any: Path.Any"],
          ["Path", "namespace Path"],
          ["Any", "type Path<T extends string = string>.Any = Path<string>"],
          ["kind", "let kind: Kind.Any"],
          ["Kind", "namespace Kind"],
          [
            "Any",
            "type Kind.Any = {\n    readonly kind: string;\n} | undefined",
          ],
          ["shape", "let shape: Shape"],
          ["Shape", "interface Shape"],
          ["Shape", "const Shape: {\n    make(): Shape;\n}"],
          ["make", "(method) make(): Shape"],
          ["unit", "let unit: string"],
          ["measure", "namespace measure"],
          ["Unit", "type measure.Unit = string"],
          ["measure", "function measure(): void"],
        ]);
      }),
    );

    it.effect(
      "merged_in_scope",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`interface Local { readonly a: 1 }
namespace Local { export type Any = Local; }
let any: Local.Any;`);
        expect(names).toStrictEqual([
          ["Local", "interface Local"],
          ["a", "(property) Local.a: 1"],
          ["Local", "namespace Local"],
          ["Any", "type Any = Local"],
          ["Local", "interface Local"],
          ["any", "let any: Local"],
          ["Local", "namespace Local"],
          ["Any", "type Local.Any = Local"],
        ]);
      }),
    );

    it.effect(
      "modules",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`import * as all from "./declarations.js";
import { Nested } from "./declarations.js";
all.single("text");
Nested.leaf;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["all", 'module "./declarations.js"'],
            ["single", "function single(value: string): string"],
            ["Nested", "namespace Nested"],
            ["leaf", "const leaf: number"],
          ]),
        );
      }),
    );

    it.effect(
      "unresolved",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`unknownName;
import { missing } from "missing-package";
missing;`);
        expect(names).toStrictEqual([]);
      }),
    );
  });

  describe("signatures", () => {
    it.effect(
      "declared_overloads",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { make, five } from "./declarations.js";
make; five;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            [
              "make",
              "function make<T>(value: T): Box<T>\nfunction make(): Box<never>",
            ],
            [
              "five",
              "function five(value: 1): 1\nfunction five(value: 2): 2\nfunction five(value: 3): 3\n// +2 more overloads",
            ],
          ]),
        );
      }),
    );

    it.effect(
      "declaration_names",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`function over(value: string): string;
function over(value: number): number;
function over(value: unknown) { return value; }`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["over", "function over(value: string): string"],
            ["over", "function over(value: number): number"],
            ["over", "function over(value: unknown): unknown"],
          ]),
        );
      }),
    );

    it.effect(
      "resolved_by_call",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { make, five, single, build, Thing, type Box } from "./declarations.js";
make(1); make(); five(4); single("text"); build(1);
new Thing(1);
declare const box: Box<number>;
box.map((value) => value);
box.pair();
function local<T>(value: T): T { return value; }`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["make", "function make<number>(value: number): Box<number>"],
            ["make", "function make(): Box<never>"],
            ["five", "function five(value: 4): 4"],
            ["single", "function single(value: string): string"],
            ["build", "const build: <number>(value: number) => Box<number>"],
            [
              "Thing",
              "constructor Thing<number>(value: number): Thing<number>",
            ],
            [
              "map",
              "(method) Box<number>.map<number>(transform: (value: number) => number): Box<number>",
            ],
            ["pair", "(method) Box<number>.pair(): readonly [number, number]"],
            ["local", "function local<T>(value: T): T"],
          ]),
        );
      }),
    );

    it.effect(
      "single_line_types",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { shaped, tuple } from "./declarations.js";
shaped; tuple;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            [
              "shaped",
              'function shaped<T extends string>(pair: [T, {\n    readonly inner: [T];\n}], mapped: { readonly [K in T]?: K; }, text: "é"): readonly [T, number]',
            ],
            [
              "tuple",
              "const tuple: readonly [string, {\n    readonly deep: [1, 2];\n}]",
            ],
          ]),
        );
      }),
    );
  });

  describe("declarations", () => {
    it.effect(
      "types",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { type Box, Thing, Abstract, type Pair } from "./declarations.js";
let box: Box<1>;
let thing: Thing<1>;
let abstract: Abstract;
let pair: Pair<1>;
const asserted = [1] as const;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["Box", "interface Box<T>"],
            ["Thing", "class Thing<T>"],
            ["Abstract", "abstract class Abstract<T extends object = {}>"],
            ["Pair", "type Pair<A, B = A> = readonly [A, B]"],
            ["const", "type const = readonly [1]"],
          ]),
        );
      }),
    );

    it.effect(
      "enums",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { Colour, Fixed } from "./declarations.js";
Colour.Red; Colour.Blue; Fixed.One;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["Colour", "enum Colour"],
            ["Red", "(enum member) Colour.Red"],
            ["Blue", '(enum member) Colour.Blue = "blue"'],
            ["Fixed", "const enum Fixed"],
            ["One", "(enum member) Fixed.One = 1"],
          ]),
        );
      }),
    );

    it.effect(
      "type_parameters",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`class Generic<T extends object = {}> { field!: T; }
type Lookup<T, K extends keyof T = keyof T> = T[K];
type Unwrap<T> = T extends { inner: infer Inner } ? Inner : never;
function generic<Input extends string>(input: Input): Input { return input; }`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            [
              "T",
              "(type parameter) T extends object in Generic<T extends object = {}>",
            ],
            [
              "K",
              "(type parameter) K extends keyof T in type Lookup<T, K extends keyof T = keyof T>",
            ],
            ["T", "(type parameter) (distributed) T in type Unwrap<T>"],
            ["Inner", "(type parameter) Inner"],
            [
              "Input",
              "(type parameter) Input extends string in generic<Input extends string>(input: Input): Input",
            ],
            ["field", "(property) Generic<T extends object = {}>.field: T"],
          ]),
        );
      }),
    );
  });
});
