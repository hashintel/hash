/**
 * Synchronous program construction with an explicit input schema.
 *
 * The callback receives typed input handles and a prelude-specific construction context. Every emitted initializer and nested body must fit that schema, so the result can retain unused declared inputs without overlooking discarded declarations. Custom preludes replace the default and retain their exact export keys.
 *
 * @module
 */
import { Result, pipe } from "effect";

import * as Expression from "../program/Expression.js";
import * as Prelude from "../program/Prelude.js";
import * as ProgramError from "../program/ProgramError.js";
import * as Scope from "../program/Scope.js";
import * as Scribe from "./Scribe.js";

import type { Relocatable } from "../internal/relocation.js";
import type { Type, TypeExpression } from "../main.js";
import type * as Namespace from "../program/Namespace.js";
import type * as Body from "./Body.js";

export type * as Context from "./Context.js";

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

/** Replaces the default declarations without widening the supplied export tables. */
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

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the schema and callback construct a new program
export const program: Program<Prelude.Builtin> = withPrelude(
  Prelude.builtin,
).program;
