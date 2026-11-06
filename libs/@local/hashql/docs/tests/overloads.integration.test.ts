import { Array, Option, Result } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Catalogue from "../src/Catalogue.js";
import * as Content from "../src/Content.js";
import * as Parts from "../src/internal/parts.js";
import * as Overloads from "../src/Overloads.js";
import * as Tree from "../src/Tree/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

import type * as AST from "../src/AST/index.js";

const source = `
export interface Value { value: string; }
export interface Failure { message: string; }
/** First form.
 * @param value - The input.
 * @typeParam T - The payload.
 * @returns A result.
 * @throws \`Failure\` When invalid.
 * @throws No reason given.
 */
export function choose<T>(value: Value, other: T): Value;
/** Second form.
 * @param value - The input.
 * @returns A result.
 * @throws \`Failure\` When invalid.
 */
export function choose(value?: Value): Value;
/** Container docs.
 * @param values - Outer inputs.
 */
export const callable: {
  /** Call docs.
   * @param values - Inner inputs.
   * @returns First result.
   */
  (...values: Value[]): Value;
  (...values: Value[]): number;
  readonly flag: true;
};
/** Type side.
 * @typeParam T - Type payload.
 */
export type Pair<T> = T;
/** Value side. */
export const Pair: number;
/** First.
 * @param input - {@link Value} only.
 */
export function links(input: Value): void;
/** Second.
 * @param input - {@link Failure | \`Value\`} only.
 */
export function links(input: Failure): void;
/** Third.
 * @param input - {@link Value} only.
 */
export function links(input: Value): void;
export namespace A {
  interface Item { a: true; }
  interface Hidden { secret: true; }
  /** Hidden input. @param input - Hidden. */
  function hidden(input: Hidden): void;
  /** First.
   * @param input - An item.
   * @returns An item.
   */
  function run(input: Item): Item;
  export { Item, run, hidden };
}
export namespace B {
  interface Item { b: true; }
  interface Hidden { other: true; }
  /** Hidden input. @param input - Hidden. */
  function hidden(input: Hidden): void;
  /** Second.
   * @param input - An item.
   * @returns An item.
   */
  function run(input: Item): Item;
  export { Item, run, hidden };
}
/** Optional. @param input - An input. */
export function optional(input?: Value): void;
/** Duplicate failures.
 * @throws \`Failure\` One cause.
 * @throws \`Failure\` Another cause.
 */
export function duplicate(): void;
/** Throws linked.
 * @throws {@link Failure} When broken.
 */
export function linked(): void;
/** First documented.
 * @param value - Keep this source.
 */
export function partial(value: Value): void;
export function partial(value: number): void;
export class Members {
  static value: string;
  value: number;
}
`;

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

const at = <A>(values: readonly A[], index: number): A =>
  Array.get(values, index).pipe(Option.getOrThrow);

const entryOf = (name: string): Catalogue.Entry =>
  Catalogue.lookup(reference().document.catalogue, {
    entrypoint: "@scope/pkg",
    path: name.split("."),
  }).pipe(Option.getOrThrow);

/** The overloads of the exports `names`, numbered together. */
const collect = (...names: readonly string[]): Overloads.Overloads => {
  const { ast } = reference().document.catalogue;

  return Overloads.collect(
    Array.flatMap(names, (name) => Parts.of(ast, entryOf(name))),
    { ast, prose: Content.contextOf(ast) },
  ).pipe(Result.getOrThrow);
};

interface Applied {
  readonly text: Option.Option<string>;
  readonly overloads: readonly number[];
}

const descriptions = <Origin>({
  descriptions: described,
}: {
  readonly descriptions: readonly Tree.Callable.Described<Origin>[];
}): readonly Applied[] =>
  Array.map(described, ({ children, applies }) => ({
    text: Tree.Prose.plain(children),
    overloads: applies.overloads,
  }));

const types = <Origin>({
  forms,
}: {
  readonly forms: readonly Tree.Callable.Form<Origin>[];
}): readonly Applied[] =>
  Array.map(forms, ({ type, applies }) => ({
    text: Option.some(type.getText()),
    overloads: applies.overloads,
  }));

/** What each name in a form's type refers to. */
const targetsOf = <Origin>(
  form: Tree.Callable.Form<Origin>,
): readonly Option.Option<AST.Reference.Reference.Target>[] =>
  Array.map(TypeScript.Node.identifiers(form.type), (name) =>
    Option.map(
      reference().document.catalogue.ast.referenceAt(name),
      ({ target }) => target,
    ),
  );

/** The AST nodes the local targets of a form's names point at. */
const localsOf = <Origin>(
  form: Tree.Callable.Form<Origin>,
): readonly AST.Node.Interned[] =>
  Array.flatMap(Array.getSomes(targetsOf(form)), (target) => {
    if (target._tag !== "Local") {
      return [];
    }

    return [target.node];
  });

/** Whether `node` is a declaration the package keeps private: in the AST, and in no public path. */
const isPrivate = (node: AST.Node.Interned): boolean => {
  const { catalogue } = reference().document;

  return (
    Option.isSome(
      catalogue.ast.narrow(node, (value) => value._tag === "Declaration"),
    ) && !Array.some(catalogue.entries, ({ id }) => id === node)
  );
};

const applied = (text: string, overloads: readonly number[]): Applied => ({
  text: Option.some(text),
  overloads,
});

describe("overloads", () => {
  beforeAll(async () => {
    loaded = await Reference.success({
      source,
      configuration: "render-tsdoc.json",
    });
  });

  test("shared_forms", () => {
    expect.hasAssertions();
    const model = collect("choose");
    expect(Array.map(model.entries, ({ index }) => index)).toStrictEqual([
      1, 2,
    ]);
    const parameter = at(model.parameters, 0);
    expect([
      parameter.name,
      types(parameter),
      descriptions(parameter),
    ]).toStrictEqual([
      "value",
      [applied("Value", [1, 2])],
      [applied("The input.", [1, 2])],
    ]);
    const returns = Option.getOrThrow(model.returns);
    expect([types(returns), descriptions(returns)]).toStrictEqual([
      [applied("Value", [1, 2])],
      [applied("A result.", [1, 2])],
    ]);
    const typeParameter = at(model.typeParameters, 0);
    expect([typeParameter.name, descriptions(typeParameter)]).toStrictEqual([
      "T",
      [applied("The payload.", [1])],
    ]);
  });

  test("nested_call_comments", () => {
    expect.hasAssertions();
    const model = collect("callable");
    const [first, second] = model.entries;
    expect(model.entries).toHaveLength(2);
    expect(first?.part).toBe(second?.part);
    const parameter = at(model.parameters, 0);
    expect([
      parameter.name,
      parameter.rest,
      descriptions(parameter),
    ]).toStrictEqual([
      "values",
      true,
      [applied("Inner inputs.", [1]), applied("Outer inputs.", [2])],
    ]);
    const returns = Option.getOrThrow(model.returns);
    expect([types(returns), descriptions(returns)]).toStrictEqual([
      [applied("Value", [1]), applied("number", [2])],
      [applied("First result.", [1])],
    ]);
  });

  test("independent_parts", () => {
    expect.hasAssertions();
    const model = collect("Pair");
    expect(
      Array.map(model.entries, ({ call }) => Option.isNone(call)),
    ).toStrictEqual([true, true]);
    expect([model.parameters, model.returns]).toStrictEqual([
      [],
      Option.none(),
    ]);
    expect(descriptions(at(model.typeParameters, 0))).toStrictEqual([
      applied("Type payload.", [1]),
    ]);
    expect(
      Array.map(model.entries, ({ comment }) =>
        Option.map(comment, ({ source }) => source.emitAsTsdoc()),
      ),
    ).toStrictEqual([
      Option.some(
        "/**\n * Type side.\n *\n * @typeParam T - Type payload.\n */\n",
      ),
      Option.some("/**\n * Value side.\n */\n"),
    ]);
  });

  test("inherited_comment", () => {
    expect.hasAssertions();
    const model = collect("partial");
    expect(at(model.entries, 1).comment).toStrictEqual(
      at(model.entries, 0).comment,
    );
    const parameter = at(model.parameters, 0);
    expect(descriptions(parameter)).toStrictEqual([
      applied("Keep this source.", [1, 2]),
    ]);
    expect(types(parameter)).toStrictEqual([
      applied("Value", [1]),
      applied("number", [2]),
    ]);
  });

  test("description_destinations", () => {
    expect.hasAssertions();
    const parameter = at(collect("links").parameters, 0);
    expect(
      Array.map(parameter.descriptions, ({ applies }) => applies.overloads),
    ).toStrictEqual([[1, 3], [2]]);
    expect(
      Array.map(parameter.forms, ({ applies }) => applies.overloads),
    ).toStrictEqual([[1, 3], [2]]);
  });

  test("type_destinations", () => {
    expect.hasAssertions();
    const model = collect("A.run", "B.run");
    const parameter = at(model.parameters, 0).forms;
    const returns = Option.getOrThrow(model.returns).forms;
    const items = [applied("Item", [1]), applied("Item", [2])];
    expect([
      types({ forms: parameter }),
      types({ forms: returns }),
    ]).toStrictEqual([items, items]);
    expect(targetsOf(at(parameter, 0))).not.toStrictEqual(
      targetsOf(at(parameter, 1)),
    );
    expect(targetsOf(at(returns, 0))).not.toStrictEqual(
      targetsOf(at(returns, 1)),
    );
  });

  test("private_type_destinations", () => {
    expect.hasAssertions();
    const { forms } = at(collect("A.hidden", "B.hidden").parameters, 0);
    expect(types({ forms })).toStrictEqual([
      applied("Hidden", [1]),
      applied("Hidden", [2]),
    ]);
    const locals = Array.map(forms, localsOf);
    expect(Array.map(locals, (nodes) => nodes.length)).toStrictEqual([1, 1]);
    expect(at(locals, 0)).not.toStrictEqual(at(locals, 1));
    expect(Array.map(Array.flatten(locals), isPrivate)).toStrictEqual([
      true,
      true,
    ]);
  });

  test("type_operators", async () => {
    expect.hasAssertions();
    const result = await Reference.success({
      source: `
      /** First. @param value - The input. */
      export function run(value: keyof string[]): void;
      /** Second. @param value - The input. */
      export function run(value: readonly string[]): void;
    `,
    });
    const { ast } = result.document.catalogue;
    const entry = Catalogue.lookup(result.document.catalogue, {
      entrypoint: "@scope/pkg",
      path: ["run"],
    }).pipe(Option.getOrThrow);
    const model = Overloads.collect(Parts.of(ast, entry), {
      ast,
      prose: Content.contextOf(ast),
    }).pipe(Result.getOrThrow);
    expect(types(at(model.parameters, 0))).toStrictEqual([
      applied("keyof string[]", [1]),
      applied("readonly string[]", [2]),
    ]);
  });

  test("optional_parameter", () => {
    expect.hasAssertions();
    const model = collect("optional");
    const parameter = at(model.parameters, 0);
    expect([parameter.name, parameter.optional, model.returns]).toStrictEqual([
      "input",
      true,
      Option.none(),
    ]);
  });

  test("duplicate_throw_number", () => {
    expect.hasAssertions();
    const { throws } = collect("duplicate");
    expect(throws).toHaveLength(1);
    const thrown = at(throws, 0);
    expect([
      Option.map(thrown.error, ({ type }) => type),
      thrown.applies.overloads,
      descriptions(thrown),
    ]).toStrictEqual([
      Option.some("inlineCode"),
      [1],
      [applied("One cause.", [1]), applied("Another cause.", [1])],
    ]);
  });

  test("throw_forms", () => {
    expect.hasAssertions();
    const { throws } = collect("choose");
    expect(throws).toHaveLength(2);
    expect(at(throws, 0)).toMatchObject({
      applies: { overloads: [1, 2] },
      error: Option.some({ type: "inlineCode", value: "Failure" }),
    });
    expect(descriptions(at(throws, 0))).toStrictEqual([
      applied("When invalid.", [1, 2]),
    ]);
    expect([at(throws, 1).error, descriptions(at(throws, 1))]).toStrictEqual([
      Option.none(),
      [applied("No reason given.", [1])],
    ]);
  });

  test("linked_throw", () => {
    expect.hasAssertions();
    const thrown = at(collect("linked").throws, 0);
    expect(thrown.error).toMatchObject(
      Option.some({
        type: "link",
        destination: { target: { _tag: "Local", node: entryOf("Failure").id } },
        children: [{ type: "inlineCode", value: "Failure" }],
      }),
    );
    expect(descriptions(thrown)).toStrictEqual([applied("When broken.", [1])]);
  });
});
