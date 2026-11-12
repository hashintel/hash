import { expect, layer } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as QuickInfo from "../src/QuickInfo.js";
import * as Api from "../src/TypeScript/Api.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as ParserFixture from "./fixtures/parser.js";

/** Each name in `code`, compiled as an example, with what an editor shows on hover over it. */
const inspect = Effect.fnUntraced(function* (code: string) {
  const comment = Array.map(code.split("\n"), (line) => ` * ${line}`).join(
    "\n",
  );
  const ast = yield* ParserFixture.success({
    source: `/** Example.\n * @example\n * \`\`\`ts\n${comment}\n * \`\`\`\n */ export const sample: string;`,
  });
  const program = pipe(
    Array.fromIterable(ast.nodes()),
    Array.filter(AST.Documentation.isDocumentation),
    Array.flatMap(({ examples }) => examples),
    Array.head,
    Option.flatMap(ast.programOf),
    Option.getOrThrow,
  );

  return yield* Effect.forEach(
    Array.flatMap(TypeScript.Node.identifiers(program), (name) =>
      pipe(
        ast.nameOf(name),
        Option.flatMap(({ quickInfo }) => quickInfo),
        Option.map((info) => [name, info] as const),
        Option.toArray,
      ),
    ),
    ([name, info]) =>
      Effect.map(
        QuickInfo.display(info, name),
        (text) => [name.text, text] as const,
      ),
  );
});

layer(Api.layer, { excludeTestServices: true })("quick info", (it) => {
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
          ["nested", "(property) nested: string"],
        ]),
      );
    }),
  );

  it.effect(
    "declarations",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names = yield* inspect(`type Text = string;
type Wrapped = { value: string };
interface Box<T> { value: T }
class Model<T> { run(value: T): T { return value; } }
namespace Space { export const value = 1; }
function overloaded(value: string): string;
function overloaded(value: number): number;
function overloaded(value: boolean): boolean;
function overloaded(value: unknown) { return value; }
function single(value: string) { return value; }
type Choice = Text;
let box: Box<Text>;
let model: Model<Text>;
model.run("value");
Space.value; overloaded("value"); single("value");`);
      expect(names).toStrictEqual(
        expect.arrayContaining([
          ["Text", "type Text = string"],
          ["Wrapped", "type Wrapped = {\n    value: string;\n}"],
          ["Box", "interface Box<T>"],
          ["Model", "class Model<T>"],
          ["Space", "namespace Space"],
          [
            "overloaded",
            "function overloaded(value: string): string (+2 overloads)",
          ],
          ["single", "function single(value: string): string"],
          ["run", "(method) run(value: string): string"],
        ]),
      );
    }),
  );

  it.effect(
    "accessors",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names = yield* inspect(`class Box {
  get current(): number { return 1; }
  set current(value: number) {}
  get fixed(): string { return "text"; }
}
let box: Box;
box.current = box.current + 1; box.fixed;`);
      expect(names).toStrictEqual(
        expect.arrayContaining([
          ["current", "(accessor) current: number"],
          ["fixed", "(accessor) fixed: string"],
        ]),
      );
    }),
  );

  it.effect(
    "type_parameters",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names =
        yield* inspect(`type Make<T extends string = "a"> = (value: T) => T;
interface Box<T extends string = "a"> { value: T }
class Counter<T extends number> { run(value: T): T { return value; } }
let make: Make;
let box: Box;
let counter: Counter<1>;`);
      expect(names).toStrictEqual(
        expect.arrayContaining([
          ["Make", 'type Make<T extends string = "a"> = (value: T) => T'],
          ["Box", 'interface Box<T extends string = "a">'],
          ["Counter", "class Counter<T extends number>"],
        ]),
      );
    }),
  );

  it.effect(
    "unsupported_and_unknown",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names = yield* inspect(`enum Colour { Red }
Colour.Red;
unknownName;
import { missing } from "missing-package";
missing;`);
      expect(names).toStrictEqual([]);
    }),
  );
});
