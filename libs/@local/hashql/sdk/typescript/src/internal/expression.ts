import {
  Pipeable,
  Predicate,
  Result,
  Schema,
  SchemaIssue,
  SchemaParser,
  identity,
  pipe,
} from "effect";

import * as JExpr from "../JExpr/index.js";
import * as AST from "../Program/AST/index.js";
import * as ProgramError from "../Program/ProgramError.js";
import * as Relocation from "./relocation.js";

import type { Expression, Value, Variance } from "../Program/Expression.js";
import type { Arguments } from "../Program/ExpressionType.js";
import type * as Type from "../Type.js";

export type { Expression, Value } from "../Program/Expression.js";

/** @internal */
export const TypeId = "~hashql/Expression";

/** @internal */
export const Binding: unique symbol = Symbol("~hashql/Expression");

class ExpressionImpl<T extends Type.Any, Inputs> {
  readonly [TypeId]: Variance<T, Inputs>;

  readonly #expr: Result.Result<AST.Node.Any, ProgramError.Construction>;

  constructor(expr: Result.Result<AST.Node.Any, ProgramError.Construction>) {
    this.#expr = expr;
    this[TypeId] = {
      _T: identity,
      // oxlint-disable-next-line typescript/strict-void-return -- only used for type variance
      _Inputs: identity,
    };
  }

  get [Binding](): Result.Result<AST.Node.Any, ProgramError.Construction> {
    return this.#expr;
  }
}

const projectionKey = (
  key: string | number,
): Result.Result<string | number, ProgramError.Construction> => {
  if (typeof key === "string") {
    return Result.succeed(key);
  }

  // `JExpr.access` writes a numeric key as an Integer literal without checking it. Parsing that literal stores a fraction or a non-finite number as a failure, as an `$index` key does.
  return pipe(
    key,
    JExpr.integer,
    // oxlint-disable-next-line no-use-before-define -- make is defined before any exports
    parseNode,
    Result.map(() => key),
  );
};

const access = (
  value: Result.Result<AST.Node.Any, ProgramError.Construction>,
  key: string | number,
): Result.Result<AST.Node.Any, ProgramError.Construction> =>
  pipe(
    { value, key: projectionKey(key) },
    Result.all,
    Result.map(({ value, key }) => new AST.Access(value, key)),
  );

const make = <T extends Type.Any, Inputs>(
  impl: ExpressionImpl<T, Inputs>,
): Expression<T, Inputs> => {
  const target: Expression.Handle<T, Inputs> = Object.assign(
    (...args: Arguments.Any) =>
      make(
        new ExpressionImpl(
          pipe(
            {
              callee: impl[Binding],
              // oxlint-disable-next-line no-use-before-define -- `make` is right next to the expression impl it guards
              arguments: Result.all(args.map(toNode)),
            },
            Result.all,
            Result.map(
              ({ callee, arguments: arguments_ }) =>
                new AST.Call(callee, arguments_),
            ),
          ),
        ),
      ),
    {
      [TypeId]: impl[TypeId],
      [Binding]: impl[Binding],
      [Relocation.Relocate]: (
        path: JExpr.Path.Path,
        bound?: Relocation.Bound,
      ): Result.Result<Expression<T, Inputs>, ProgramError.Construction> =>
        impl[Binding].pipe(
          Result.map(() =>
            make(
              new ExpressionImpl<T, Inputs>(
                Result.succeed(
                  new AST.Path(path, Relocation.head(path, "value", bound)),
                ),
              ),
            ),
          ),
        ),
      ...Pipeable.Prototype,
    },
  );

  const proxy = new Proxy(target, {
    get(
      target,
      property,
      receiver,
    ): // oxlint-disable-next-line typescript/no-restricted-types -- proxy property reads may return arbitrary host values
    unknown {
      if (property === "pipe") {
        return Reflect.get(target, property, receiver);
      }

      if (property === "$index" || property === "$indexUnsafe") {
        return (key: Value.Any) => {
          const expr = pipe(
            // oxlint-disable-next-line no-use-before-define -- `make` is right next to the expression impl it guards
            { value: target[Binding], key: toNode(key) },
            Result.all,
            Result.map(({ value, key }) => new AST.Subscript(value, key)),
          );
          const impl = new ExpressionImpl(expr);
          return make(impl);
        };
      }

      if (property === "$project" || property === "$projectUnsafe") {
        return (key: string | number) =>
          make(new ExpressionImpl(access(target[Binding], key)));
      }

      if (property === Binding) {
        return target[Binding];
      }

      if (property === TypeId) {
        return target[TypeId];
      }

      if (property in target && !Object.hasOwn(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      if (typeof property === "string" && /^\d+$/u.test(property)) {
        return make(
          new ExpressionImpl(access(target[Binding], Number(property))),
        );
      }

      if (typeof property === "string") {
        return make(new ExpressionImpl(access(target[Binding], property)));
      }

      return Reflect.get(target, property, receiver);
    },
  });

  // SAFETY: the handle retains T and Inputs. The traps supply their type-directed operations.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot derive conditional accessors and call signatures from proxy traps
  return proxy as Expression<T, Inputs>;
};

/** @internal */
// oxlint-disable-next-line typescript/no-restricted-types -- type guard
export const isExpression = (value: unknown): value is Expression.Any =>
  Predicate.hasProperty(value, TypeId);

const jexprParser = SchemaParser.decodeResult(Schema.toType(JExpr.Schema));

/** @internal */
export const parseNode = (
  expression: JExpr.Expression,
): Result.Result<AST.Node.Any, ProgramError.Construction> =>
  Result.mapBoth(jexprParser(expression), {
    onSuccess: (syntax) => new AST.Expr(syntax),
    onFailure: (cause) => ProgramError.Construction.invalidExpression(cause),
  });

/** @internal */
export const toNode = (
  value: Value.Any,
): Result.Result<AST.Node.Any, ProgramError.Construction> => {
  if (isExpression(value)) {
    if (Predicate.hasProperty(value, Binding)) {
      return value[Binding];
    }

    // The marker is a string key, so a data record can carry it. Only a handle stores a result.
    return Result.fail(
      ProgramError.Construction.invalidExpression(
        new SchemaIssue.InvalidValue(
          { message: `A record with the "${TypeId}" key is not an expression` },
          value,
        ),
      ),
    );
  }

  return parseNode(JExpr.literal(value));
};

/** @internal */
export const fromResult = <T extends Type.Any, Inputs>(
  node: Result.Result<AST.Node.Any, ProgramError.Construction>,
): Expression<T, Inputs> => make(new ExpressionImpl<T, Inputs>(node));
