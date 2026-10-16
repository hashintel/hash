/**
 * Synchronous program construction with an explicit input schema.
 *
 * {@link program} runs one callback that receives a construction context `$` and typed handles for the inputs its schema declares. Draft emits the declarations made through `$`, such as `$.let`, `$.type`, `$.newtype` and `$.import`, around the callback's returned expression in call order. Every emitted initializer and nested body must fit the schema, so the result can retain unused declared inputs without overlooking discarded declarations. Branch and query-predicate callbacks receive their own contexts, whose declarations stay inside that branch or predicate.
 *
 * {@link program} uses `Prelude.builtin`. {@link withPrelude} creates a program constructor for custom declarations instead, replacing the default and retaining their exact export keys. The `Context` namespace names the construction operation types. Do, at `@local/hashql/do`, builds the same expressions from ordered declaration steps and infers input requirements rather than declaring them.
 *
 * @example <caption>Bind a computed value and compare it with an input.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Prelude, Program } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const atLimit = program({ count: Prelude.builtin.types.Integer }, ($, { count }) => {
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
import { Result, pipe } from "effect";

import * as Expression from "../Program/Expression.js";
import * as Prelude from "../Program/Prelude.js";
import * as ProgramError from "../Program/ProgramError.js";
import * as Scope from "../Program/Scope.js";
import * as Scribe from "./Scribe.js";

import type { Relocatable } from "../internal/relocation.js";
import type { Type, TypeExpression } from "../main.js";
import type * as Namespace from "../Program/Namespace.js";
import type * as Body from "./Body.js";

export type * as Context from "./Context.js";

/**
 * A Draft program constructor whose callbacks see the scope `S`.
 *
 * It takes an input schema and a callback, and returns the root expression or a construction failure. The result requires every schema entry. {@link program} documents the callback's timing and failure contract, which every constructor from {@link withPrelude} shares.
 */
export type Program<S extends Scope.Scope> = <
  const I extends Body.Inputs,
  const O extends Expression.AnyValue & Expression.Any,
>(
  inputs: I,
  draft: Body.Body<S, I, O>,
) => Result.Result<
  Expression.Expression<Expression.TypeOf<O>, Body.Requirements<I>>,
  ProgramError.Construction
>;

function inputHandle<K extends string, D extends TypeExpression.Any>(
  name: K,
  type: D,
): Body.Handle<K, D>;
function inputHandle<K extends string, T extends Type.Any>(
  name: K,
  type: TypeExpression.TypeExpression<T>,
): Expression.Expression<T, Readonly<Record<K, T>>> {
  return Expression.input(name, type);
}

/** Creates each handle at the same schema key and semantic type, including its own input name. */
const inputHandles = <I extends Body.Inputs>(
  schema: I,
): Result.Result<Body.Handles<I>, ProgramError.Construction> => {
  const [symbol] = Object.getOwnPropertySymbols(schema);
  if (symbol !== undefined) {
    return Result.fail(ProgramError.Construction.symbolInputName(symbol));
  }

  const handles: Partial<Body.Handles<I>> = {};
  const member = <K extends keyof I & string>(name: K): Body.Handles<I>[K] =>
    inputHandle<K, I[K]>(name, schema[name]);

  for (const name of Object.getOwnPropertyNames(schema)) {
    Object.defineProperty(handles, name, {
      value: member(name),
      enumerable: true,
    });
  }

  // SAFETY: the loop fills every own string key with the handle for that exact key and semantic type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot establish completion of a generic mapped record
  return Result.succeed(Object.freeze(handles as Body.Handles<I>));
};

type Rebindings<E> = {
  readonly [K in keyof E]: E[K] extends undefined
    ? undefined
    : Relocatable<E[K]>;
};

/**
 * Creates a program constructor whose callbacks see a custom prelude instead of the built-in one.
 *
 * The prelude's optional `modules`, `types` and `values` records replace `Prelude.builtin` entirely, without widening the supplied export tables. A callback reaches them through `$.prelude()`, which joins same-named exports into one handle, and `$.modules()`. A `values.entities` function that returns a `::graph::Graph` opaque type enables `$.query.entities`. A module from `Module.define` is a valid prelude. Seeding emits no HashQL, because each export already refers to its declaration.
 *
 * `withPrelude` copies the records' own string-keyed exports, including non-enumerable ones, when you call it. Later changes to the records do not reach the returned constructor, and `withPrelude` does not freeze them. The parameter type requires each export to be a rebindable SDK producer, such as a module, type expression or expression handle. A symbol-keyed export from an unchecked caller makes every program call return a `SymbolExportName` failure before its callback runs.
 *
 * @example <caption>Use a module as the whole prelude.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Module, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { withPrelude } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * type Add = Type.Function<
 *   readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
 *   Type.PrimitiveInteger
 * >;
 * const math = Result.getOrThrow(
 *   Module.define("::core::math", { values: { add: Module.value<Add>() } }),
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
export function withPrelude<const S extends Scope.Definition>(
  prelude: S & Namespace.Rebindable<S>,
): { readonly program: Program<Scope.From<S>> };
export function withPrelude<
  M extends Scope.Scope["modules"] & Rebindings<M>,
  T extends Scope.Scope["types"] & Rebindings<T>,
  V extends Scope.Scope["values"] & Rebindings<V>,
>(prelude: {
  readonly modules?: M;
  readonly types?: T;
  readonly values?: V;
}): {
  readonly program: Program<{
    readonly modules: Readonly<M> | Scope.Empty["modules"];
    readonly types: Readonly<T> | Scope.Empty["types"];
    readonly values: Readonly<V> | Scope.Empty["values"];
  }>;
} {
  const scope = Object.freeze({
    modules: Scope.snapshot(prelude.modules ?? {}),
    types: Scope.snapshot(prelude.types ?? {}),
    values: Scope.snapshot(prelude.values ?? {}),
  });

  const validate = (): Result.Result<
    typeof scope,
    ProgramError.Construction
  > => {
    for (const table of [scope.modules, scope.types, scope.values]) {
      const [name] = Object.getOwnPropertySymbols(table);
      if (name !== undefined) {
        return Result.fail(ProgramError.Construction.symbolExportName(name));
      }
    }

    return Result.succeed(scope);
  };

  const validated = validate();
  const program: Program<typeof scope> = <
    const I extends Body.Inputs,
    const O extends Expression.AnyValue & Expression.Any,
  >(
    inputs: I,
    draft: Body.Body<typeof scope, I, O>,
  ) =>
    pipe(
      Result.all({ scope: validated, handles: inputHandles<I>(inputs) }),
      Result.flatMap(({ scope: accepted, handles }) =>
        Scribe.evaluate<typeof scope, I, O>(accepted, (context) =>
          draft(context, handles),
        ),
      ),
    );

  return Object.freeze({ program });
}

/**
 * Constructs a program's root expression with the built-in prelude.
 *
 * The callback runs synchronously with a construction context and typed input handles. Its operations build syntax rather than executing a query. The root expression retains every declared input requirement, including unused schema entries. A symbol input name causes a construction failure before the callback runs.
 *
 * Both conditional branch callbacks construct syntax, regardless of the condition's value. Host-side effects in those callbacks happen during construction.
 *
 * Use {@link withPrelude} to supply custom declarations.
 *
 * @param inputs - The input names and their semantic type expressions.
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
export const program: Program<Prelude.Builtin> = withPrelude(
  Prelude.builtin,
).program;
