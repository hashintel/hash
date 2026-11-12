import { expect, layer } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";

import * as AST from "../src/AST/index.js";
import * as QuickInfo from "../src/QuickInfo.js";
import * as Api from "../src/TypeScript/Api.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as ParserFixture from "./fixtures/parser.js";

/** Each name in `code`, compiled as the example of a documented export, with the quick info the parse recorded for it. */
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
      Effect.map(QuickInfo.display(info), (text) => [name.text, text] as const),
  );
});

layer(Api.layer, { excludeTestServices: true })("quick info", (it) => {
  it.effect(
    "example_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names = yield* inspect(`const fixed = "text";
function run({ input }: { input: string }) { return input; }
run({ input: fixed });`);
      expect(names).toStrictEqual([
        ["fixed", 'const fixed: "text"'],
        ["run", "function run({ input }: {\n    input: string;\n}): string"],
        ["input", "(parameter) input: string"],
        ["input", "(property) input: string"],
        ["input", "(parameter) input: string"],
        ["run", "function run({ input }: {\n    input: string;\n}): string"],
        ["input", "(property) input: string"],
        ["fixed", 'const fixed: "text"'],
      ]);
    }),
  );

  it.effect(
    "example_unresolved",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const names = yield* inspect(`unknownName;
import { missing } from "missing-package";
missing;`);
      expect(names).toStrictEqual([]);
    }),
  );
});
