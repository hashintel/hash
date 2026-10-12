import { Result } from "effect";

import * as JExpr from "../jexpr/index.js";
import * as AST from "./ast/index.js";

import type * as Type from "../type/index.js";
import type * as Expression from "./Expression.js";
import type * as Input from "./Inputs.js";

interface Comparison<T extends Type.Any, Inputs> {
  readonly eq: <const Other extends Expression.Value<T>>(
    other: Other,
  ) => Expression.Expression<
    Type.PrimitiveBoolean,
    Input.Merge<Inputs, Expression.Inputs<Other>>
  >;
  readonly ne: <const Other extends Expression.Value<T>>(
    other: Other,
  ) => Expression.Expression<
    Type.PrimitiveBoolean,
    Input.Merge<Inputs, Expression.Inputs<Other>>
  >;
}

interface BooleanOperations<Inputs> {
  readonly and: <const Other extends Expression.Value<Type.PrimitiveBoolean>>(
    other: Other,
  ) => Expression.Expression<
    Type.PrimitiveBoolean,
    Input.Merge<Inputs, Expression.Inputs<Other>>
  >;
  readonly or: <const Other extends Expression.Value<Type.PrimitiveBoolean>>(
    other: Other,
  ) => Expression.Expression<
    Type.PrimitiveBoolean,
    Input.Merge<Inputs, Expression.Inputs<Other>>
  >;
  readonly isTrue: () => Expression.Expression<Type.PrimitiveBoolean, Inputs>;
  readonly isFalse: () => Expression.Expression<Type.PrimitiveBoolean, Inputs>;
}

// oxlint-disable-next-line typescript/no-generated-empty-object-type -- inapplicable operations add no members
type Empty = Record<never, never>;

type Optional<T extends Type.Any, Inputs> =
  T extends Type.Union<infer Members>
    ? Extract<
        Members[number],
        Type.Opaque<"::core::option::None", Type.Any>
      > extends never
      ? Empty
      : {
          readonly isNone: () => Expression.Expression<
            Type.PrimitiveBoolean,
            Inputs
          >;
        }
    : Empty;

export type Operations<T extends Type.Any, Inputs> = Comparison<T, Inputs> &
  (T extends Type.PrimitiveBoolean ? BooleanOperations<Inputs> : Empty) &
  Optional<T, Inputs>;

interface Runtime {
  readonly eq: (other: Expression.AnyValue) => Expression.Any;
  readonly ne: (other: Expression.AnyValue) => Expression.Any;
  readonly and: (other: Expression.AnyValue) => Expression.Any;
  readonly or: (other: Expression.AnyValue) => Expression.Any;
  readonly isTrue: () => Expression.Any;
  readonly isFalse: () => Expression.Any;
  readonly isNone: () => Expression.Any;
}

type Factory = Pick<typeof Expression, "fromResult" | "fromJExpr" | "toJExpr">;

/** The expression proxy exposes only operations allowed by its semantic descriptor. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the expression implementation supplies factories to avoid a runtime import cycle
export const make = (self: Expression.Any, factory: Factory): Runtime => {
  const call = (
    path: string,
    ...args: readonly Expression.AnyValue[]
  ): Expression.Any =>
    factory.fromResult(
      Result.all(args.map(factory.toJExpr)).pipe(
        Result.map((args) => new AST.Expr(JExpr.call(path, ...args))),
      ),
    );

  return {
    eq: (other) => call("::core::cmp::eq", self, other),
    ne: (other) => call("::core::cmp::ne", self, other),
    and: (other) => call("::core::bool::and", self, other),
    or: (other) => call("::core::bool::or", self, other),
    isTrue: () =>
      call("::core::cmp::eq", self, factory.fromJExpr(JExpr.literal(true))),
    isFalse: () =>
      call("::core::cmp::eq", self, factory.fromJExpr(JExpr.literal(false))),
    isNone: () => call("::core::cmp::eq", self, call("::core::option::None")),
  };
};
