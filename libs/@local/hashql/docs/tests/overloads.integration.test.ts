import { expect, layer } from "@effect/vitest";
import { Array, Effect, Option, Result } from "effect";

import * as AST from "../src/AST/index.js";
import * as Catalogue from "../src/Catalogue.js";
import * as Entry from "../src/Entry.js";
import * as Parts from "../src/internal/parts.js";
import * as Overloads from "../src/Overloads.js";
import * as Tree from "../src/Tree/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

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
/** First.
 * @throws \`Failure\` When invalid.
 */
export function narrow(value: Value): void;
/** Second.
 * @throws \`Failure\` When invalid.
 * @throws \`Failure\` When negative.
 */
export function narrow(value: number): void;
/** Third. */
export function narrow(): void;
/** First documented.
 * @param value - Keep this source.
 */
export function partial(value: Value): void;
export function partial(value: number): void;
/** Identity.
 * @param value - The input.
 * @typeParam T - The payload.
 */
export function identity<T>(value: T): T;
export function identity(other: string): string;
export class Members {
  static value: string;
  value: number;
}
`;

const at = <A>(values: readonly A[], index: number): A =>
  Array.get(values, index).pipe(Option.getOrThrow);

const entryOf = (
  reference: Reference.Reference,
  name: string,
): Catalogue.Entry =>
  Catalogue.lookup(reference.document.catalogue, {
    entrypoint: "@scope/pkg",
    path: name.split("."),
  }).pipe(Option.getOrThrow);

/** The overloads of the exports `names`, numbered together. */
const collect = (
  reference: Reference.Reference,
  ...names: readonly string[]
): Overloads.Overloads => {
  const { ast } = reference.document.catalogue;

  return Overloads.collect(
    Array.flatMap(names, (name) => Parts.of(ast, entryOf(reference, name))),
    Entry.contextOf(ast),
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
  reference: Reference.Reference,
  form: Tree.Callable.Form<Origin>,
): readonly Option.Option<AST.Target.Interned>[] =>
  Array.map(
    TypeScript.Node.identifiers(form.type),
    Entry.contextOf(reference.document.catalogue.ast).names,
  );

/** The AST nodes the local targets of a form's names point at. */
const localsOf = <Origin>(
  reference: Reference.Reference,
  form: Tree.Callable.Form<Origin>,
): readonly AST.Node.Interned[] =>
  Array.filter(
    Array.getSomes(targetsOf(reference, form)),
    (target) =>
      !AST.ExternalItem.isExternalItem(
        reference.document.catalogue.ast.get(target),
      ),
  );

/** Whether `node` is a declaration the package keeps private: in the AST, and in no public path. */
const isPrivate = (
  reference: Reference.Reference,
  node: AST.Node.Interned,
): boolean => {
  const { catalogue } = reference.document;

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

layer(Reference.layer({ source, configuration: "render-tsdoc.json" }), {
  excludeTestServices: true,
})("overloads", (it) => {
  it.effect(
    "shared_forms",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "choose");
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
    }),
  );

  it.effect(
    "nested_call_comments",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "callable");
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
    }),
  );

  it.effect(
    "independent_parts",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "Pair");
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
    }),
  );

  it.effect(
    "inherited_comment",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "partial");
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
    }),
  );

  it.effect(
    "inherited_undeclared_names",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "identity");
      expect(descriptions(at(model.typeParameters, 0))).toStrictEqual([
        applied("The payload.", [1]),
      ]);
      expect(descriptions(at(model.parameters, 0))).toStrictEqual([
        applied("The input.", [1]),
      ]);
    }),
  );

  it.effect(
    "description_destinations",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const parameter = at(collect(reference, "links").parameters, 0);
      expect(
        Array.map(parameter.descriptions, ({ applies }) => applies.overloads),
      ).toStrictEqual([[1, 3], [2]]);
      expect(
        Array.map(parameter.forms, ({ applies }) => applies.overloads),
      ).toStrictEqual([[1, 3], [2]]);
    }),
  );

  it.effect(
    "type_destinations",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "A.run", "B.run");
      const parameter = at(model.parameters, 0).forms;
      const returns = Option.getOrThrow(model.returns).forms;
      const items = [applied("Item", [1]), applied("Item", [2])];
      expect([
        types({ forms: parameter }),
        types({ forms: returns }),
      ]).toStrictEqual([items, items]);
      expect(targetsOf(reference, at(parameter, 0))).not.toStrictEqual(
        targetsOf(reference, at(parameter, 1)),
      );
      expect(targetsOf(reference, at(returns, 0))).not.toStrictEqual(
        targetsOf(reference, at(returns, 1)),
      );
    }),
  );

  it.effect(
    "private_type_destinations",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { forms } = at(
        collect(reference, "A.hidden", "B.hidden").parameters,
        0,
      );
      expect(types({ forms })).toStrictEqual([
        applied("Hidden", [1]),
        applied("Hidden", [2]),
      ]);
      const locals = Array.map(forms, (form) => localsOf(reference, form));
      expect(Array.map(locals, (nodes) => nodes.length)).toStrictEqual([1, 1]);
      expect(at(locals, 0)).not.toStrictEqual(at(locals, 1));
      expect(
        Array.map(Array.flatten(locals), (node) => isPrivate(reference, node)),
      ).toStrictEqual([true, true]);
    }),
  );

  it.effect(
    "type_operators",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* Reference.success({
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
      const model = Overloads.collect(
        Parts.of(ast, entry),
        Entry.contextOf(ast),
      ).pipe(Result.getOrThrow);
      expect(types(at(model.parameters, 0))).toStrictEqual([
        applied("keyof string[]", [1]),
        applied("readonly string[]", [2]),
      ]);
    }),
  );

  it.effect(
    "optional_parameter",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const model = collect(reference, "optional");
      const parameter = at(model.parameters, 0);
      expect([parameter.name, parameter.optional, model.returns]).toStrictEqual(
        ["input", true, Option.none()],
      );
    }),
  );

  it.effect(
    "duplicate_throw_number",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { throws } = collect(reference, "duplicate");
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
    }),
  );

  it.effect(
    "throw_forms",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { throws } = collect(reference, "choose");
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
    }),
  );

  it.effect(
    "throw_description_scope",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const thrown = at(collect(reference, "narrow").throws, 0);
      expect([
        thrown.applies.overloads,
        Tree.Callable.isEvery(thrown.applies),
      ]).toStrictEqual([[1, 2], false]);
      expect(
        Array.map(thrown.descriptions, ({ children, applies }) => [
          Tree.Prose.plain(children),
          applies.overloads,
          Tree.Callable.isEvery(applies),
        ]),
      ).toStrictEqual([
        [Option.some("When invalid."), [1, 2], true],
        [Option.some("When negative."), [2], false],
      ]);
    }),
  );

  it.effect(
    "linked_throw",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const thrown = at(collect(reference, "linked").throws, 0);
      expect(thrown.error).toMatchObject(
        Option.some({
          type: "link",
          destination: entryOf(reference, "Failure").id,
          children: [{ type: "inlineCode", value: "Failure" }],
        }),
      );
      expect(descriptions(thrown)).toStrictEqual([
        applied("When broken.", [1]),
      ]);
    }),
  );
});
