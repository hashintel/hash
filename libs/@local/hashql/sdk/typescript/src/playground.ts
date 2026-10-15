import { Option } from "effect";

import * as Scan from "./internal/scan.js";
import * as Ident from "./jexpr/Ident.js";
import * as JExpr from "./jexpr/index.js";

import type * as Type from "./type/index.js";

const Binding: unique symbol = Symbol("Expression.binding");
class ExpressionBinding<T extends Type.Any> {
  /** Phantom result type. The binding stores no runtime type descriptor. */
  declare readonly type: T;
  readonly #expr: JExpr.Expression;

  constructor(expr: JExpr.Expression) {
    this.#expr = expr;
  }

  get expression(): JExpr.Expression {
    return this.#expr;
  }

  push<U extends Type.Any>(
    fn: (expr: JExpr.Expression) => JExpr.Expression,
  ): ExpressionBinding<U> {
    return new ExpressionBinding<U>(fn(this.#expr));
  }
}

interface ExpressionHandle<T extends Type.Any> {
  readonly [Binding]: ExpressionBinding<T>;
}

/**
 * A symbolic result, with field access preserving the selected field's type.
 *
 * The binding remains outside the conditional view so generic functions can infer `T`.
 */
export type Expression<T extends Type.Any> = ExpressionHandle<T> &
  (T extends Type.Struct<infer Fields>
    ? {
        readonly [Field in Extract<keyof Fields, string | number>]: Expression<
          Fields[Field]
        >;
      }
    : T extends Type.Tuple.Any
      ? {
          readonly [Index in Extract<
            keyof T["fields"],
            `${number}`
          >]: Expression<T["fields"][Index]>;
        }
      : Record<never, never>);

/** Encodes one property name, including quoted identifiers and tuple positions. */
const accessProperty = (
  expr: JExpr.Expression,
  property: string,
): JExpr.Expression => {
  if (/^(?:0|[1-9]\d*)$/u.test(property)) {
    return JExpr.call("access", expr, JExpr.integer(BigInt(property)));
  }

  const identifier = Option.orElse(Scan.scanIdentExact(property), () =>
    Scan.scanIdentExact(`\`${property}\``),
  );

  if (Option.isNone(identifier) || identifier.value.value !== property) {
    throw new Error(`Invalid HashQL field name: ${property}`);
  }

  return JExpr.access(expr, Ident.compile(Ident.fromScanned(identifier.value)));
};

const project = <T extends Type.Any>(
  binding: ExpressionBinding<T>,
): Expression<T> => {
  const target: ExpressionHandle<T> = { [Binding]: binding };
  const proxy = new Proxy(target, {
    get(
      target,
      property,
    ): ExpressionBinding<T> | ExpressionHandle<Type.Any> | undefined {
      if (property === Binding) {
        return target[Binding];
      }

      if (typeof property === "symbol") {
        return undefined;
      }

      return project(
        target[Binding].push<Type.Any>((expr) =>
          accessProperty(expr, property),
        ),
      );
    },
  });

  // SAFETY: The target retains T's binding, and the trap creates expression bindings for projected fields. The raw-AST constructor supplies the type ascription.
  return proxy as Expression<T>;
};

/**
 * Wraps a J-Expr expression with an unchecked result-type ascription.
 *
 * The caller must ensure that `initial` produces `T`. The binding carries no runtime type descriptor, so the proxy cannot check this claim.
 */
export const makeExpression = <T extends Type.Any>(
  initial: JExpr.Expression,
): Expression<T> => project(new ExpressionBinding<T>(initial));

/** Extracts the AST without evaluating the expression. */
export const toJExpr = (
  expression: ExpressionHandle<Type.Any>,
): JExpr.Expression => expression[Binding].expression;

/**
 * Constructs a dictionary lookup that returns null for an absent key.
 *
 * Dictionary keys are invariant, so a narrower key type is not enough.
 */
export const get = <Dictionary extends Type.Dict.Any, Index extends Type.Any>(
  dictionary: ExpressionHandle<Dictionary>,
  key: ExpressionHandle<Index> &
    ([NoInfer<Dictionary["key"]>] extends [NoInfer<Index>]
      ? ExpressionHandle<NoInfer<Dictionary["key"]>>
      : never),
): Expression<Dictionary["value"] | Type.PrimitiveNull> =>
  project(
    dictionary[Binding].push<Dictionary["value"] | Type.PrimitiveNull>((expr) =>
      JExpr.index(expr, toJExpr(key)),
    ),
  );
