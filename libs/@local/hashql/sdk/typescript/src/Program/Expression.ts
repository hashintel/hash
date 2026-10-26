/**
 * Symbolic HashQL values with semantic types and input requirements.
 *
 * Handles build syntax rather than executing queries. Their descriptors select the available calls and projections. Rebinding retains those descriptors while replacing the referenced path, and construction failures remain attached to the handle.
 *
 * A projected field named `then` retains its HashQL meaning. Keep handles inside their construction Result rather than passing them to `await` or `Promise.resolve`.
 *
 * @module
 */
// oxlint-disable max-lines -- expression constructors and their API examples belong with the private handle metadata and proxy machinery
import {
  Function,
  Pipeable,
  Predicate,
  Result,
  Schema,
  SchemaParser,
  identity,
  pipe,
} from "effect";

import { Relocate } from "../internal/relocation.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as ProgramError from "./ProgramError.js";
import * as TypeExpression from "./TypeExpression.js";

import type { Relocatable } from "../internal/relocation.js";
import type * as Type from "../Type.js";
import type {
  Accessors,
  Arguments,
  Callable,
  Conditional,
} from "./ExpressionType.js";
import type * as Input from "./Inputs.js";
import type { Types } from "effect";

export type { Conditional } from "./ExpressionType.js";

const TypeId = "~hashql/Expression";
const Binding: unique symbol = Symbol("~hashql/Expression");

interface Variance<T, Inputs> {
  readonly _T: Types.Invariant<T>;
  readonly _Inputs: Types.Contravariant<Inputs>;
}

/** Host literals accepted without an explicit expression wrapper: strings, numbers, bigints, booleans and null. */
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

/** Semantic metadata and stored construction result shared by expressions and adapted callables. */
export interface Handle<T extends Type.Any, Inputs> extends Expression.Any {
  readonly [TypeId]: Variance<T, Inputs>;
  readonly [Relocate]: Relocatable<Expression<T, Inputs>>[typeof Relocate];
}

/**
 * An exactly typed handle or the host primitive corresponding to its semantic descriptor.
 *
 * Argument compatibility uses the semantic metadata that adapted callables retain. Integer operands accept bigint and Integer handles. TypeScript rejects a host number at that position rather than widening its descriptor.
 */
export type Value<T extends Type.Any> =
  | (Expression.Any & Pick<Handle<T, never>, typeof TypeId | typeof Binding>)
  | (T extends Type.Primitive ? T["value"] : never);

export declare namespace Value {
  /** An expression or host literal accepted by syntax-only operations such as {@link toJExpr}. */
  export type Any = Expression.Any | Primitive;
}

/**
 * Reads semantic metadata without constraining an adapted callable to its original host signature.
 *
 * Host numbers remain Number regardless of their emitted literal syntax.
 */
export type TypeOf<V extends Value.Any> = V extends {
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

/**
 * A symbolic HashQL value with type-directed projection, indexing and calls.
 *
 * `T` describes the represented value, not its host wrapper. `Inputs` records the inputs needed to evaluate it. Fields and tuple positions project to new expressions. Use `$project` for fields whose names collide with SDK operations. Lists and dictionaries expose `$index`, whose result includes Null for a missing entry. Callable descriptors expose a host call that constructs HashQL call syntax.
 *
 * Property access and calls construct syntax without reading data or executing the represented function. Extract that syntax or its retained construction failure with {@link toJExpr}.
 *
 * @example <caption>Project a field from a typed input.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Option, Result } from "effect";
 *
 * const { Expression, TypeExpression } = Program;
 * const accountType = TypeExpression.fromType<
 *   Type.Struct<{ readonly active: Type.PrimitiveBoolean }>
 * >(Option.getOrThrow(JExpr.Type.reference("::example::Account")));
 * const account = Expression.input("account", accountType);
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(account.active)),
 *   Result.getOrThrow(Expression.toJExpr(account.$project("active"))),
 * );
 * ```
 */
export type Expression<T extends Type.Any, Inputs> = [T] extends [Type.Any]
  ? Expression.Shape<T, Inputs>
  : never;

export declare namespace Expression {
  /** The structural type underlying {@link Expression}, including its descriptor-selected operations. */
  export type Shape<T extends Type.Any, Inputs> = Handle<T, Inputs> &
    Accessors<T, Inputs> &
    Callable<T, Inputs>;

  /** An expression with its semantic type erased, for syntax-only operations. */
  export interface Any extends Relocatable<Any>, Pipeable.Pipeable {
    readonly [Binding]: Result.Result<AST.Node, ProgramError.Construction>;
  }
}

/**
 * Recognizes the private expression marker without checking the stored result or semantic type.
 *
 * Use this to distinguish SDK handles from host literals, not to validate untrusted objects.
 */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isExpression = (value: unknown): value is Expression.Any =>
  Predicate.hasProperty(value, Binding);

const jexprParser = SchemaParser.decodeResult(Schema.toType(JExpr.Schema));

const parseNode = (
  expression: JExpr.Expression,
): Result.Result<AST.Node, ProgramError.Construction> =>
  Result.mapBoth(jexprParser(expression), {
    onSuccess: (syntax) => new AST.Expr(syntax),
    onFailure: (cause) =>
      ProgramError.Construction.make({
        reason: ProgramError.Reason.make({ _tag: "InvalidExpression", cause }),
      }),
  });

/**
 * Extracts a handle's stored AST result or validates a host literal into an AST node.
 *
 * Existing construction failures pass through unchanged. Invalid primitive syntax, including non-finite numbers, returns an `InvalidExpression` failure. Prefer {@link toJExpr} when consuming J-Expr syntax rather than builder nodes.
 */
export const toNode = (
  value: Value.Any,
): Result.Result<AST.Node, ProgramError.Construction> => {
  if (isExpression(value)) {
    return value[Binding];
  }

  return parseNode(JExpr.literal(value));
};

/**
 * Extracts J-Expr syntax without evaluating the represented value.
 *
 * A failed handle returns its stored construction error. Host literals undergo the same syntax validation as {@link literal}. Serialize the resulting structured syntax with `JExpr.compile`.
 */
export const toJExpr = (
  value: Value.Any,
): Result.Result<JExpr.Expression, ProgramError.Construction> =>
  toNode(value).pipe(Result.map(AST.compile));

const make = <T extends Type.Any, Inputs>(
  impl: ExpressionImpl<T, Inputs>,
): Expression<T, Inputs> => {
  const target: Handle<T, Inputs> = Object.assign(
    (...args: Arguments.Any) =>
      make(
        new ExpressionImpl(
          Result.all({
            callee: impl[Binding],
            arguments: Result.all(args.map(toJExpr)),
          }).pipe(
            Result.map(
              ({ callee, arguments: arguments_ }) =>
                new AST.Expr(JExpr.call(callee.compile(), ...arguments_)),
            ),
          ),
        ),
      ),
    {
      [TypeId]: impl[TypeId],
      [Binding]: impl[Binding],
      [Relocate]: (
        path: JExpr.Path.Path,
      ): Result.Result<Expression<T, Inputs>, ProgramError.Construction> =>
        impl[Binding].pipe(
          Result.map(() =>
            make(
              new ExpressionImpl<T, Inputs>(
                parseNode(JExpr.Path.compile(path)),
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
      if (property === "$index") {
        return (key: Value.Any) => {
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

  // SAFETY: the handle retains T and Inputs. The traps supply their type-directed operations.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot derive conditional accessors and call signatures from proxy traps
  return proxy as Expression<T, Inputs>;
};

/**
 * Wraps an AST construction result while retaining either its node or its failure.
 *
 * This low-level builder operation trusts the caller to establish `T`, `Inputs` and the node's validity. Use {@link fromJExpr} when syntax needs validation.
 */
export const fromResult = <T extends Type.Any, Inputs>(
  node: Result.Result<AST.Node, ProgramError.Construction>,
): Expression<T, Inputs> => make(new ExpressionImpl<T, Inputs>(node));

/**
 * Ascribes a semantic type to syntax supplied by a declaration or another trusted builder.
 *
 * The caller supplies the semantic type and input requirements. This operation validates syntax only and stores an `InvalidExpression` construction failure if validation fails. Extract it with {@link toJExpr}. It does not resolve names or infer requirements from the syntax.
 */
export const fromJExpr = <T extends Type.Any, Inputs>(
  expression: JExpr.Expression,
): Expression<T, Inputs> => parseNode(expression).pipe(fromResult<T, Inputs>);

/** Wraps an already constructed AST node without validation, using caller-supplied semantic metadata as in {@link fromResult}. */
export const fromNode = <T extends Type.Any, Inputs>(
  node: AST.Node,
): Expression<T, Inputs> => Result.succeed(node).pipe(fromResult<T, Inputs>);

/** A replacement call signature with the source expression's semantic metadata. */
export type Adapted<T extends Type.Any, I, C> = C &
  Pick<Handle<T, I>, typeof TypeId | typeof Binding> &
  Relocatable<Adapted<T, I, C>>;

/**
 * Adapts host arguments while preserving expression metadata and rebinding.
 *
 * The adapter must retain the represented function's meaning. It may accept additional host shorthand and normalize it before emitting a call. The factory runs immediately and again with the new source expression on each relocation. Build the returned callable from that argument rather than capturing an older expression. Exceptions from the factory or returned callable propagate to their caller.
 *
 * Both `adaptCallable(source, factory)` and `adaptCallable(factory)(source)` preserve the source's semantic type and input metadata. The replacement host signature comes from the factory.
 *
 * @example <caption>Accept trimmed host text when constructing a lookup call.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Result, pipe } from "effect";
 *
 * const { Expression } = Program;
 * const lookup = Expression.fromJExpr<
 *   Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
 *   Program.Inputs.Empty
 * >("lookup");
 * const trimmedLookup = Expression.adaptCallable(lookup, (source) =>
 *   (name: string) => source(name.trim()),
 * );
 * const pipedLookup = pipe(lookup, Expression.adaptCallable((source) =>
 *   (name: string) => source(name.trim()),
 * ));
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(trimmedLookup(" Ada "))),
 *   ["lookup", { "#literal": "Ada" }],
 * );
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(pipedLookup(" Ada "))),
 *   Result.getOrThrow(Expression.toJExpr(trimmedLookup(" Ada "))),
 * );
 * ```
 */
export const adaptCallable: {
  <T extends Type.Any, I, C extends (...args: never[]) => Expression.Any>(
    adapt: (self: Expression<T, I>) => C,
  ): (self: Expression<T, I>) => Adapted<T, I, C>;
  <T extends Type.Any, I, C extends (...args: never[]) => Expression.Any>(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Adapted<T, I, C>;
} = Function.dual(
  2,
  <T extends Type.Any, I, C extends (...args: never[]) => Expression.Any>(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Adapted<T, I, C> =>
    Object.assign(adapt(self), {
      [TypeId]: self[TypeId],
      [Binding]: self[Binding],
      [Relocate]: (
        path: JExpr.Path.Path,
      ): Result.Result<Adapted<T, I, C>, ProgramError.Construction> =>
        self[Relocate](path).pipe(Result.map(adaptCallable(adapt))),
    }),
);

/**
 * Changes an expression's semantic type assumption while preserving its syntax and input requirements.
 *
 * The caller establishes the semantic type `T` through a trusted declaration or other knowledge outside the SDK. The returned function accepts an expression or host primitive without validating that semantic type at runtime or converting the value. It emits no HashQL type assertion. The HashQL compiler still checks the resulting program.
 *
 * @example <caption>Annotate an identifier whose meaning the application establishes.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Option, Result } from "effect";
 *
 * const { Expression, TypeExpression } = Program;
 * type UserId = Type.Opaque<"example::UserId", Type.PrimitiveString>;
 * const string = TypeExpression.fromType<Type.PrimitiveString>(
 *   Option.getOrThrow(JExpr.Type.reference("::kernel::type::String")),
 * );
 * const text = Expression.input("userId", string);
 * const userId = Expression.assume<UserId>()(text);
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(userId)),
 *   Result.getOrThrow(Expression.toJExpr(text)),
 * );
 * ```
 */
export const assume =
  <T extends Type.Any>() =>
  <E extends Value.Any>(expression: E): Expression<T, Inputs<E>> =>
    toNode(expression).pipe(fromResult<T, Inputs<E>>);

/**
 * Constructs a typed host literal with no input requirements.
 *
 * Use a string to construct a string literal rather than a name reference. A host number has the Number descriptor even when its emitted syntax is integral. Bigints have the Integer descriptor. Non-finite numbers produce an `InvalidExpression` failure retained until {@link toJExpr}. Objects and arrays need structural construction instead.
 */
export const literal = <const V extends Primitive>(
  value: V,
): Expression<TypeOf<V>, Input.Empty> => fromJExpr(JExpr.literal(value));

/**
 * Constructs an Integer literal from a bigint or integral host number.
 *
 * Fractions and non-finite numbers produce an `InvalidExpression` construction failure. Use bigint when the original integer exceeds the safe number range, because a number has already undergone JavaScript rounding. See {@link toJExpr} to inspect success or failure.
 */
export const integer = (
  value: number | bigint,
): Expression<Type.PrimitiveInteger, Input.Empty> =>
  fromJExpr(JExpr.integer(value));

/** Constructs a Number literal, retaining non-finite values as construction failures as in {@link literal}. */
export const number = (
  value: number,
): Expression<Type.PrimitiveNumber, Input.Empty> =>
  fromJExpr(JExpr.literal(value));

/**
 * References a program input, optionally supplying its default expression.
 *
 * The inferred {@link Inputs} record requires the input when you omit the default or pass `undefined`. A definitely present default makes this occurrence optional, but another required use of the same name takes precedence. If the default's type includes `undefined`, the input remains required. Requirements of the default expression also contribute to the result.
 *
 * @param name - The input name emitted into the program.
 * @param type - The input's HashQL type, which also constrains the default.
 * @param defaultValue - The value or expression used when the input is absent at query execution.
 * @returns A symbolic reference. Use {@link toJExpr} to extract the syntax or its construction failure.
 *
 * @example <caption>Supply a default page size.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Option, Result } from "effect";
 *
 * const { Expression, TypeExpression } = Program;
 * const integer = TypeExpression.fromType<Type.PrimitiveInteger>(
 *   Option.getOrThrow(JExpr.Type.reference("::kernel::type::Integer")),
 * );
 * const pageSize = Expression.input("pageSize", integer, 10n);
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(pageSize))),
 *   '["::kernel::special_form::input","pageSize","::kernel::type::Integer",{"#literal":10}]',
 * );
 * ```
 */
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
  defaultValue?: Value.Any,
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

/**
 * Constructs a conditional whose result type combines its branch types.
 *
 * The caller constructs all three operands before this call, without host short-circuiting. The result retains the condition's requirements and those of both branches, even for a literal condition. Either branch can contribute a construction failure. Equal branch descriptors remain equal, while distinct descriptors form a normalized union.
 *
 * @example <caption>Select a label in the represented program.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression } = Program;
 * const label = Expression.ifElse(true, { then: "enabled", else: "disabled" });
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(label))),
 *   '["::kernel::special_form::if",{"#literal":true},{"#literal":"enabled"},{"#literal":"disabled"}]',
 * );
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the condition and branches construct a new expression
export const ifElse = <
  const Condition extends Value<Type.PrimitiveBoolean>,
  const Then extends Value.Any,
  const Else extends Value.Any,
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
