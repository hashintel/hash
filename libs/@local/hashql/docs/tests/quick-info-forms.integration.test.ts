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
export declare class Derived extends Thing<string> { own: number; }
export declare class Options {
  constructor(options: { readonly from: string; where?: [string, number] });
}
export interface First { a: number; b: string; }
export interface Second { a: number; c: number; }
export declare function either(value: First | Second): void;
export interface Circle { kind: "circle"; radius: number; }
export interface Square { kind: "square"; side: number; }
export declare function draw(shape: Circle | Square): void;
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
export default function fallback(): void;
`;

const nested = `
export declare const leaf: number;
`;

/** Each name in `code`, read as a module beside the declarations, with what an editor shows on hover over it. The module is TypeScript, or TSX where `extension` says so. */
const inspect = Effect.fnUntraced(function* (
  code: string,
  { extension = "ts" }: { readonly extension?: "ts" | "tsx" } = {},
) {
  const { file } = yield* Compiler.Fixture;
  const example = `${file}.example.${extension}`;
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
        const info = yield* Option.match(symbol, {
          onNone: () => QuickInfo.typeAt(name),
          onSome: (found) => QuickInfo.of(name, found),
        });
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

    it.effect(
      "expected_union",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { either, draw } from "./declarations.js";
either({ a: 1, b: "x" });
draw({ kind: "circle", radius: 1 });
draw({ kind: "square", side: 2 });`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["a", "(property) a: number"],
            ["b", "(property) First.b: string"],
            ["kind", '(property) Circle.kind: "circle"'],
            ["radius", "(property) Circle.radius: number"],
            ["kind", '(property) Square.kind: "square"'],
            ["side", "(property) Square.side: number"],
          ]),
        );
      }),
    );

    it.effect(
      "object_method",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`const literal = { method() { return 1; } };
literal.method();`);
        expect(names).toStrictEqual([
          ["literal", "const literal: {\n    method(): number;\n}"],
          ["method", "(method) method(): number"],
          ["literal", "const literal: {\n    method(): number;\n}"],
          ["method", "(method) method(): number"],
        ]);
      }),
    );

    it.effect(
      "disposable_bindings",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`declare const resource: any;
function sync() { using held = resource; return held; }
async function later() { await using awaited = resource; return awaited; }`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["held", "using held: any"],
            ["awaited", "await using awaited: any"],
          ]),
        );
      }),
    );

    it.effect(
      "inherited_holder",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import { type Derived, type Box } from "./declarations.js";
declare const derived: Derived;
declare const both: Box<string> & { extra: boolean };
derived.prop; both.value;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["prop", "(property) Thing<string>.prop: string"],
            ["value", "(property) Box<string>.value: string"],
          ]),
        );
      }),
    );

    it.effect(
      "holder_constraint",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`import type { Space } from "./declarations.js";
interface Boxed<T extends Space.Inner.Kind = Space.Inner.Kind> { value: T; }`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["Boxed", "interface Boxed<T extends string = string>"],
            [
              "value",
              "(property) Boxed<T extends Space.Inner.Kind = string>.value: T",
            ],
          ]),
        );
      }),
    );
  });

  describe("names read at another node", () => {
    it.effect(
      "import_meta",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`export {};
declare global { interface ImportMeta { readonly url: string } }
import.meta.url;`);
        expect(names).toStrictEqual([
          ["global", "namespace global"],
          ["ImportMeta", "interface ImportMeta"],
          ["url", "(property) ImportMeta.url: string"],
          ["meta", "interface ImportMeta"],
          ["url", "(property) ImportMeta.url: string"],
        ]);
      }),
    );
  });

  describe("names without a symbol", () => {
    it.effect(
      "tuple_labels",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`type Labelled = [first: string, second?: number, ...rest: boolean[]];
type Pair<T> = [left: T, right: readonly [inner: T]];`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["first", "string"],
            ["second", "number | undefined"],
            ["rest", "any"],
            ["left", "T"],
            ["right", "readonly [inner: T]"],
            ["inner", "T"],
          ]),
        );
      }),
    );

    it.effect(
      "untyped_members",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`declare const anything: any;
anything.member;
const { key: bound } = anything;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["member", "any"],
            ["key", "any"],
          ]),
        );
      }),
    );

    it.effect(
      "statement_labels",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`outer: for (;;) { break outer; }`);
        expect(names).toStrictEqual([]);
      }),
    );

    it.effect(
      "jsx_tags",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(
          `const plain = <div></div>;
const spaced = <svg:rect />;`,
          { extension: "tsx" },
        );
        expect(names).toStrictEqual([
          ["plain", "const plain: any"],
          ["div", "any"],
          ["div", "any"],
          ["spaced", "const spaced: any"],
        ]);
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
        expect(names).toStrictEqual([["unknownName", "any"]]);
      }),
    );

    it.effect(
      "import_alias",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`import * as all from "./declarations.js";
import Unit = all.measure.Unit;
import Merged = all.Shape;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["measure", "namespace measure"],
            ["Unit", "type measure.Unit = string"],
            [
              "Shape",
              "const Shape: {\n    make(): Merged;\n}\ninterface Shape",
            ],
          ]),
        );
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

    it.effect(
      "constructor_value",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`import { Thing } from "./declarations.js";
declare const ctor: new (value: string) => Thing<string>;
new ctor("x");`);
        expect(names).toStrictEqual([
          ["Thing", "class Thing<T>"],
          ["ctor", "const ctor: new (value: string) => Thing<string>"],
          ["value", "(parameter) value: string"],
          ["Thing", "class Thing<T>"],
          ["ctor", "const ctor: new (value: string) => Thing<string>"],
        ]);
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

    it.effect(
      "class_expression",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`const Made = class Named { static make() { return new Named(); } };
Made.make();`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["Named", "(local class) Named"],
            ["Named", "constructor Named(): Named"],
          ]),
        );
      }),
    );

    it.effect(
      "default_export",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(`import fallback from "./declarations.js";
fallback();`);
        expect(names).toStrictEqual(
          expect.arrayContaining([["fallback", "function fallback(): void"]]),
        );
      }),
    );

    it.effect(
      "construct_signatures",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names =
          yield* inspect(`interface Construct { new <T>(value: T): Construct; }
type Constructor = new <U>(value: U) => object;`);
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["T", "(type parameter) T in new new <T>(value: T): Construct"],
            ["U", "(type parameter) U in new <U>(value: U): object"],
          ]),
        );
      }),
    );

    it.effect(
      "enum_strings",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const names = yield* inspect(
          `enum Quoted { Said = "say \\"hi\\"", Back = "back\\\\slash", Bell = "\\u0007", Line = "a\\nb" }`,
        );
        expect(names).toStrictEqual(
          expect.arrayContaining([
            ["Said", String.raw`(enum member) Quoted.Said = "say \"hi\""`],
            ["Back", String.raw`(enum member) Quoted.Back = "back\\slash"`],
            ["Bell", String.raw`(enum member) Quoted.Bell = "\u0007"`],
            ["Line", String.raw`(enum member) Quoted.Line = "a\nb"`],
          ]),
        );
      }),
    );
  });
});
