/**
 * Synchronous program construction with an explicit input schema.
 *
 * {@link program} runs one callback that receives a construction context `$` and typed handles for the inputs its schema declares. Draft emits the declarations made through `$`, such as `$.let`, `$.type`, `$.newtype` and `$.import`, around the callback's returned expression in call order, including declarations that nothing refers to. Every emitted initializer and nested body must fit the schema, and {@link Body.Requirements} gives the inputs the result requires. `$.query` starts a graph query from any graph expression, and `$.query.entities(axis)` from every entity, then builds it with the query's `filter` and `collect`.
 *
 * Each declaration returns a handle that HashQL resolves by name, so the handle is valid only where its name still means that declaration. Using it where a later declaration or a filter's parameter of the same name shadows it, outside the branch that declared it, or in another program fails the program with the `StaleReference` reason. Draft assumes that every module record matches HashQL's module. With a malformed record, a program Draft admits may fail to compile, or one of its names may resolve to a different binding than its handle. Apart from `$.import`, a declaration whose name, value or definition is invalid does not interrupt the callback, but Draft records the failure and the program fails.
 *
 * {@link program} uses `Prelude.builtin`. {@link withPrelude} creates a program constructor for custom declarations instead, replacing the default and retaining their exact export keys. The `Body` namespace names the types of a program callback, and a helper that receives `$` takes `Body.Context`. The `Context` namespace names the unrestricted construction operations.
 *
 * @example <caption>Bind a computed value and compare it with an input.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const atLimit = program({ count: BigInt }, ($, { count }) => {
 *   const { add } = $.prelude();
 *   const next = $.let("next", add(count, 1n));
 *   return $.eq(next, 10n);
 * });
 * assert.equal(
 *   Result.getOrThrow(Result.flatMap(atLimit, (root) => Program.compile(Program.program(root)))),
 *   '["::kernel::special_form::let","next",["::core::math::add",["::kernel::special_form::input","count","::kernel::type::Integer"],{"#literal":1}],["::core::cmp::eq","next",{"#literal":10}]]',
 * );
 * ```
 *
 * @module
 */

import { Record } from "effect";

import * as Prelude from "../Program/Prelude.js";
import * as Scope from "../Program/Scope.js";
import * as Structural from "../Program/Structural.js";
import * as Scribe from "./Scribe.js";

import type { StringKeyed } from "../internal/record.js";
import type * as Expression from "../Program/Expression.js";
import type * as Namespace from "../Program/Namespace.js";
import type * as ProgramError from "../Program/ProgramError.js";
import type * as Body from "./Body.js";
import type { Result } from "effect";

export type * as Body from "./Body.js";
export type * as Context from "./Context.js";

/**
 * A Draft program constructor whose callbacks see the scope `S`.
 *
 * It takes an input schema and a callback, and returns the root expression or a construction failure. The result requires every schema entry. {@link program} documents the callback's timing and failure contract, which every constructor from {@link withPrelude} shares.
 */
export type Draft<S extends Scope.Scope.Any> = <
  const I extends Body.Inputs,
  const O extends Expression.Value.Any & Expression.Expression.Any,
>(
  inputs: I & StringKeyed<I>,
  draft: Body.Body<S, I, O>,
) => Result.Result<
  Expression.Expression<Expression.Value.Type<O>, Body.Requirements<I>>,
  ProgramError.Construction
>;

/** References one schema entry, checked against its own key and definition rather than the whole schema. */
function inputHandle<K extends string, D extends Structural.Definition>(
  name: K,
  definition: D,
): Body.Handle<K, D>;
function inputHandle(
  name: string,
  definition: Structural.Definition,
): Expression.Expression.Any {
  return Structural.input(name, definition);
}

/** Creates each handle at the same schema key and semantic type, including its own input name. */
const inputHandles = <I extends Body.Inputs>(schema: I): Body.Handles<I> => {
  const handles: Partial<Body.Handles<I>> = {};
  const member = <K extends keyof I & string>(name: K): Body.Handles<I>[K] =>
    inputHandle<K, I[K]>(name, schema[name]);

  for (const name of Record.keys(schema)) {
    Object.defineProperty(handles, name, {
      value: member(name),
      enumerable: true,
    });
  }

  // SAFETY: the loop fills every enumerable own string key with the handle for that exact key and semantic type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot establish completion of a generic mapped record
  return Object.freeze(handles as Body.Handles<I>);
};

/** Creates a program constructor whose callbacks see `scope` as their prelude and receive the handles of their schema's inputs. */
const fromScope =
  <S extends Scope.Scope.Any>(scope: S & Namespace.Rebindable<S>): Draft<S> =>
  <
    const I extends Body.Inputs,
    const O extends Expression.Value.Any & Expression.Expression.Any,
  >(
    inputs: I,
    draft: Body.Body<S, I, O>,
  ) => {
    const handles = inputHandles(inputs);
    return Scribe.evaluate<S, I, O>(scope, (context) =>
      draft(context, handles),
    );
  };

/**
 * Creates a program constructor whose callbacks see a custom prelude instead of the built-in one.
 *
 * The prelude's optional `modules`, `types` and `values` records replace `Prelude.builtin` entirely, without widening the supplied export tables. A callback reaches them through `$.prelude()`, which joins same-named exports into one handle, and `$.modules()`. A module from `Module.define` is a valid prelude. Seeding emits no HashQL, because each export already refers to its declaration.
 *
 * `withPrelude` copies the records' enumerable own string-keyed exports when you call it. Later changes to the records do not reach the returned constructor. The parameter type requires each export to be a rebindable SDK producer, such as a module, type expression or expression handle, under a string key.
 *
 * @example <caption>Use a module as the whole prelude.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { withPrelude } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * type Add = Type.Function<
 *   readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
 *   Type.PrimitiveInteger
 * >;
 * const math = Result.getOrThrow(
 *   Program.Module.define("::core::math", { values: { add: Program.Module.value<Add>() } }),
 * );
 * const { program } = withPrelude(math);
 *
 * const sum = program({}, ($) => {
 *   const names = $.prelude();
 *   assert.equal("Uuid" in names, false);
 *   return names.add(1n, 2n);
 * });
 * assert.equal(
 *   Result.getOrThrow(Result.flatMap(sum, (root) => Program.compile(Program.program(root)))),
 *   '["::core::math::add",{"#literal":1},{"#literal":2}]',
 * );
 * ```
 */
export const withPrelude = <const D extends Scope.Definition.Any>(
  prelude: D & Namespace.Rebindable<D>,
): { readonly program: Draft<Scope.Scope<D>> } => {
  // `Namespace.Rebindable` already rejects symbol keys, and the broad definition lets `Scope.merge` accept a generic prelude without proving that again.
  const tables: Scope.Definition.Any = prelude;
  // SAFETY: merging into the empty scope copies each enumerable string-keyed export of `prelude` unchanged into the table of the same name, so every table keeps the rebindable exports `Scope.Scope<D>` names.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the merged scope cannot carry the rebindability of a generic definition's exports
  const scope = Scope.merge(Scope.empty, tables) as Scope.Scope<D> &
    Namespace.Rebindable<Scope.Scope<D>>;

  return Object.freeze({ program: fromScope<Scope.Scope<D>>(scope) });
};

/**
 * Constructs a program's root expression with the built-in prelude.
 *
 * The callback runs synchronously with a construction context and typed input handles. Its operations build syntax rather than executing a query. {@link Body.Requirements} gives the inputs the root expression requires.
 *
 * Conditional branch callbacks construct syntax, regardless of the condition's value. Host-side effects in those callbacks happen during construction.
 *
 * Use {@link withPrelude} to supply custom declarations.
 *
 * @param inputs - The input names and their types, as type expressions or structural shorthand such as `Boolean`.
 * @param draft - A synchronous construction callback returning an expression handle.
 * @returns The root expression or a construction failure. Synchronous callback exceptions become `CallbackException` failures retaining the thrown value. Expected construction failures retain their original reasons.
 *
 * @example <caption>Construct and serialize a program.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * let calls = 0;
 * const result = program({}, ($) => {
 *   calls += 1;
 *   return $.literal("ready");
 * });
 * assert.equal(calls, 1);
 * assert.equal(
 *   Result.getOrThrow(Result.flatMap(result, (root) => Program.compile(Program.program(root)))),
 *   '{"#literal":"ready"}',
 * );
 * ```
 *
 * @example <caption>Inspect a callback failure.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const result = program({}, () => {
 *   throw new Error("Missing application configuration");
 * });
 * assert.ok(Result.isFailure(result));
 * assert.equal(result.failure.reason._tag, "CallbackException");
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the schema and callback construct a new program
export const program: Draft<Prelude.Builtin> = fromScope(Prelude.builtin);
