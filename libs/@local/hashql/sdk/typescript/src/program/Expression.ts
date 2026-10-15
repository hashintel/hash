/**
 * Symbolic HashQL values with semantic types and input requirements.
 *
 * Handles build syntax rather than executing queries. Their descriptors select the available calls and projections. Rebinding retains those descriptors while replacing the referenced path, and construction failures remain attached to the handle.
 *
 * A projected field named `then` retains its HashQL meaning. Keep handles inside their construction Result rather than passing them to `await` or `Promise.resolve`.
 *
 * @module
 */
// oxlint-disable unicorn/no-array-method-this-argument -- Result.map and Result.flatMap are not array methods
import { Function, Predicate, Result, Schema, identity, pipe } from "effect";

import { Relocate } from "../internal/relocation.js";
import * as JExpr from "../jexpr/index.js";
import * as AST from "./ast/index.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as Type from "../type/index.js";
import type { Accessors, Callable, Conditional } from "./ExpressionType.js";
import type * as Input from "./Inputs.js";
import type { Types } from "effect";

export type { Conditional } from "./ExpressionType.js";

const TypeId = "~hashql/Expression";
const Binding: unique symbol = Symbol("~hashql/Expression");

interface Variance<T, Inputs> {
  readonly _T: Types.Invariant<T>;
  readonly _Inputs: Types.Contravariant<Inputs>;
}

export type Primitive = Type.Primitive["value"];

type InputAlternatives<E> = E extends Primitive
  ? Input.Empty
  : E extends {
        readonly [TypeId]: {
          readonly _Inputs: Types.Contravariant<infer Requirements>;
        };
      }
    ? [Requirements] extends [never]
      ? Input.Erased
      : // oxlint-disable-next-line typescript/no-restricted-types -- detects the top type in a caller annotation without erasing a value
        unknown extends Requirements
        ? Input.Erased
        : { readonly [Key in keyof Requirements]: Requirements[Key] }
    : Input.Erased;

/** The semantic input descriptors required by every host-side alternative, with defaults marked optional. */
export type Inputs<E> = Input.Conservative<InputAlternatives<E>>;

/** An expression with its semantic type erased, for syntax-only operations. */
export interface Any extends Relocatable<Any> {
  readonly [Binding]: Result.Result<AST.Node, ProgramError.Construction>;
}

export interface Handle<T extends Type.Any, Inputs> extends Any {
  readonly [TypeId]: Variance<T, Inputs>;
  readonly [Relocate]: Relocatable<Expression<T, Inputs>>[typeof Relocate];
}

export type AnyValue = Any | Primitive;

/** Accepts an exactly typed handle or the corresponding host primitive. */
/** Argument compatibility needs semantic metadata, not the original callable or rebinding signature. */
export type Value<T extends Type.Any> =
  | (Any & Pick<Handle<T, never>, typeof TypeId | typeof Binding>)
  | (T extends Type.Primitive ? T["value"] : never);

/**
 * Reads semantic metadata without constraining an adapted callable to its original host signature.
 *
 * Host numbers remain Number regardless of their emitted literal syntax.
 */
export type TypeOf<V extends AnyValue> = V extends {
  readonly [TypeId]: { readonly _T: Types.Invariant<infer T extends Type.Any> };
}
  ? T
  : V extends string
    ? Type.PrimitiveString
    : V extends boolean
      ? Type.PrimitiveBoolean
      : V extends bigint
        ? Type.PrimitiveInteger
        : V extends number
          ? Type.PrimitiveNumber
          : V extends null
            ? Type.PrimitiveNull
            : never;

class ExpressionImpl<T extends Type.Any, Inputs> {
  readonly [TypeId]: Variance<T, Inputs>;

  readonly #expr: Result.Result<AST.Node, ProgramError.Construction>;

  constructor(expr: Result.Result<AST.Node, ProgramError.Construction>) {
    this.#expr = expr;
    this[TypeId] = {
      _T: identity,
      // oxlint-disable-next-line typescript/strict-void-return -- only used for type variance
      _Inputs: identity,
    };
  }

  get [Binding](): Result.Result<AST.Node, ProgramError.Construction> {
    return this.#expr;
  }
}

/** A symbolic HashQL value with type-directed projection, indexing and calls. */
export type Expression<T extends Type.Any, Inputs> = Handle<T, Inputs> &
  Accessors<T, Inputs> &
  Callable<T, Inputs>;

/** Recognizes expression handles without checking their semantic types. */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isExpression = (value: unknown): value is Any =>
  Predicate.hasProperty(value, Binding);

const jexprParser = Schema.decodeResult(Schema.toType(JExpr.Schema));

const parseNode = (
  expression: JExpr.Expression,
): Result.Result<AST.Node, ProgramError.Construction> =>
  Result.mapBoth(jexprParser(expression), {
    onSuccess: (syntax) => new AST.Expr(syntax),
    onFailure: (cause) =>
      new ProgramError.Construction({
        reason: ProgramError.Reason.InvalidExpression({ cause }),
      }),
  });

export const toNode = (
  value: AnyValue,
): Result.Result<AST.Node, ProgramError.Construction> => {
  if (isExpression(value)) {
    return value[Binding];
  }
  return parseNode(JExpr.literal(value));
};

/** Extracts syntax without evaluating the represented value. */
export const toJExpr = (
  value: AnyValue,
): Result.Result<JExpr.Expression, ProgramError.Construction> =>
  Result.map(toNode(value), (node) => node.compile());

const make = <T extends Type.Any, Inputs>(
  impl: ExpressionImpl<T, Inputs>,
): Expression<T, Inputs> => {
  const target = Object.assign(
    (...args: readonly AnyValue[]) =>
      make(
        new ExpressionImpl(
          Result.map(
            Result.all({
              callee: impl[Binding],
              arguments: Result.all(args.map(toJExpr)),
            }),
            ({ callee, arguments: arguments_ }) =>
              new AST.Expr(JExpr.call(callee.compile(), ...arguments_)),
          ),
        ),
      ),
    {
      [TypeId]: impl[TypeId],
      [Binding]: impl[Binding],
      [Relocate]: (
        path: JExpr.Path.Path,
      ): Result.Result<Expression<T, Inputs>, ProgramError.Construction> =>
        pipe(
          impl[Binding],
          Result.map(() =>
            make(
              new ExpressionImpl<T, Inputs>(
                parseNode(JExpr.Path.compile(path)),
              ),
            ),
          ),
        ),
    },
  );

  const proxy = new Proxy(target, {
    get(
      target,
      property,
      receiver,
    ): // oxlint-disable-next-line typescript/no-restricted-types -- proxy property reads may return arbitrary host values
    unknown {
      if (property === "$index") {
        return (key: AnyValue) => {
          const expr = Result.map(
            Result.all({ value: target[Binding], key: toJExpr(key) }),
            ({ value, key }) => new AST.Expr(JExpr.index(value.compile(), key)),
          );
          const impl = new ExpressionImpl(expr);
          return make(impl);
        };
      }

      if (property === "$project") {
        return (key: string | number) => {
          const expr = Result.map(
            target[Binding],
            (node) => new AST.Expr(JExpr.access(node.compile(), key)),
          );
          const impl = new ExpressionImpl(expr);
          return make(impl);
        };
      }

      if (property === Binding) {
        return target[Binding];
      }

      if (property === TypeId) {
        return target[TypeId];
      }

      if (typeof property === "string" && /^\d+$/u.test(property)) {
        const index = Number(property);
        const expr = Result.map(
          target[Binding],
          (node) => new AST.Expr(JExpr.access(node.compile(), index)),
        );
        const impl = new ExpressionImpl(expr);
        return make(impl);
      }

      if (typeof property === "string") {
        const expr = Result.map(
          target[Binding],
          (node) => new AST.Expr(JExpr.access(node.compile(), property)),
        );
        const impl = new ExpressionImpl(expr);
        return make(impl);
      }

      return Reflect.get(target, property, receiver);
    },
  });

  const handle: Handle<T, Inputs> = proxy;

  // SAFETY: the handle retains T and Inputs. The traps supply their type-directed operations.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot derive conditional accessors and call signatures from proxy traps
  return handle as Expression<T, Inputs>;
};

export const fromResult = <T extends Type.Any, Inputs>(
  node: Result.Result<AST.Node, ProgramError.Construction>,
): Expression<T, Inputs> => make(new ExpressionImpl<T, Inputs>(node));

/**
 * Ascribes a semantic type to syntax supplied by a declaration or another trusted builder.
 *
 * The caller supplies the semantic type and input requirements. This operation validates syntax only.
 */
export const fromJExpr = <T extends Type.Any, Inputs>(
  expression: JExpr.Expression,
): Expression<T, Inputs> => fromResult(parseNode(expression));

export const fromNode = <T extends Type.Any, Inputs>(
  node: AST.Node,
): Expression<T, Inputs> => fromResult(Result.succeed(node));

/** A replacement call signature with the source expression's semantic metadata. */
export type Adapted<T extends Type.Any, I, C> = C &
  Pick<Handle<T, I>, typeof TypeId | typeof Binding> &
  Relocatable<Adapted<T, I, C>>;

/**
 * Adapts host arguments while preserving expression metadata and rebinding.
 *
 * The adapter must retain the represented function's meaning. It may accept additional host shorthand and normalize it before emitting a call. The factory receives the rebound expression on each relocation, so its calls cannot retain an earlier path. Metadata is copied explicitly because it need not be enumerable on a forwarding proxy.
 */
export const adaptCallable: {
  <T extends Type.Any, I, C extends (...args: never[]) => Any>(
    adapt: (self: Expression<T, I>) => C,
  ): (self: Expression<T, I>) => Adapted<T, I, C>;
  <T extends Type.Any, I, C extends (...args: never[]) => Any>(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Adapted<T, I, C>;
} = Function.dual(
  2,
  <T extends Type.Any, I, C extends (...args: never[]) => Any>(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Adapted<T, I, C> =>
    Object.assign(adapt(self), {
      [TypeId]: self[TypeId],
      [Binding]: self[Binding],
      [Relocate]: (
        path: JExpr.Path.Path,
      ): Result.Result<Adapted<T, I, C>, ProgramError.Construction> =>
        pipe(
          self[Relocate](path),
          Result.map((moved) => adaptCallable(moved, adapt)),
        ),
    }),
);

/**
 * Changes the SDK's type assumption without changing the query syntax.
 *
 * This performs no validation or conversion and emits no HashQL type assertion.
 */
export const assume =
  <T extends Type.Any>() =>
  <E extends AnyValue>(expression: E): Expression<T, Inputs<E>> =>
    fromResult<T, Inputs<E>>(toNode(expression));

export const literal = <const V extends Primitive>(
  value: V,
): Expression<TypeOf<V>, Input.Empty> => fromJExpr(JExpr.literal(value));

export const integer = (
  value: number | bigint,
): Expression<Type.PrimitiveInteger, Input.Empty> =>
  fromJExpr(JExpr.integer(value));

export const number = (
  value: number,
): Expression<Type.PrimitiveNumber, Input.Empty> =>
  fromJExpr(JExpr.literal(value));

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs an input from its name and type
export function input<const Name extends string, T extends Type.Any>(
  name: Name,
  type: TypeExpression.TypeExpression<T>,
  defaultValue?: undefined,
): Expression<T, Readonly<Record<Name, T>>>;
export function input<
  const Name extends string,
  T extends Type.Any,
  const Default extends Value<NoInfer<T>>,
>(
  name: Name,
  type: TypeExpression.TypeExpression<T>,
  defaultValue: Default,
): Expression<
  T,
  Input.Merge<Readonly<Partial<Record<Name, T>>>, Inputs<Default>>
>;
export function input<
  const Name extends string,
  T extends Type.Any,
  const Default extends Value<NoInfer<T>>,
>(
  name: Name,
  type: TypeExpression.TypeExpression<T>,
  defaultValue: Default | undefined,
): Expression<T, Input.Merge<Readonly<Record<Name, T>>, Inputs<Default>>>;
export function input<T extends Type.Any>(
  name: string,
  type: TypeExpression.TypeExpression<T>,
  defaultValue?: AnyValue,
): Expression<T, never> {
  return Result.gen(function* () {
    const syntax = yield* TypeExpression.toType(type);
    if (defaultValue === undefined) {
      return yield* toNode(fromJExpr(JExpr.input(name, syntax)));
    }

    const value = yield* toJExpr(defaultValue);
    return yield* toNode(fromJExpr(JExpr.input(name, syntax, value)));
  }).pipe(fromResult<T, never>);
}

/** Constructs a conditional whose result type combines its branch types. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the condition and branches construct a new expression
export const ifElse = <
  const Condition extends Value<Type.PrimitiveBoolean>,
  const Then extends AnyValue,
  const Else extends AnyValue,
>(
  condition: Condition,
  branches: {
    readonly then: Then;
    readonly else: Else;
  },
): Expression<
  Conditional<TypeOf<Then>, TypeOf<Else>>,
  Input.Merge<Inputs<Condition>, Input.Merge<Inputs<Then>, Inputs<Else>>>
> =>
  pipe(
    {
      condition: toNode(condition),
      consequent: toNode(branches.then),
      alternate: toNode(branches.else),
    },
    Result.all,
    Result.map(
      ({ condition, consequent, alternate }) =>
        new AST.If(condition, consequent, alternate),
    ),
    fromResult<
      Conditional<TypeOf<Then>, TypeOf<Else>>,
      Input.Merge<Inputs<Condition>, Input.Merge<Inputs<Then>, Inputs<Else>>>
    >,
  );
