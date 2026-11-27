/**
 * Symbolic HashQL values with semantic types and input requirements.
 *
 * Handles build syntax rather than executing queries. Their descriptors select the available calls and projections. Rebinding retains those descriptors while replacing the referenced path. A construction failure stays attached to the handle until {@link toJExpr} reads it.
 *
 * A projected field named `then` retains its HashQL meaning. Keep handles inside their construction Result rather than passing them to `await` or `Promise.resolve`.
 *
 * Members a handle inherits from `Function.prototype` and `Object.prototype`, such as `toString` and `call`, keep their JavaScript meaning. Use `$project` for a field with one of those names.
 *
 * @since 0.1.0
 * @module
 */
// oxlint-disable max-lines -- expression constructors and their API examples belong in one module
// oxlint-disable max-dependencies -- the constructors lower host values, structural shorthand and type definitions into syntax and AST nodes
import { Function, Pipeable, Result, Struct, pipe } from "effect";

import * as internal from "../internal/expression.js";
import { Relocate } from "../internal/relocation.js";
import * as StructuralSyntax from "../internal/structural.js";
import * as JExpr from "../JExpr/index.js";
import * as AST from "./AST/index.js";
import * as Structural from "./Structural.js";
import * as TAST from "./TAST/index.js";

import type { Binding, TypeId } from "../internal/expression.js";
import type { Bound, Relocatable } from "../internal/relocation.js";
import type * as Type from "../Type.js";
import type { Accessors, Callable, Conditional } from "./ExpressionType.js";
import type * as Input from "./Inputs.js";
import type * as ProgramError from "./ProgramError.js";
import type { Types } from "effect";
import type { ReadonlyRecord } from "effect/Record";

export type { Conditional } from "./ExpressionType.js";

/**
 * The string key that marks an expression handle, which {@link isExpression} checks.
 *
 * @category Type IDs
 * @since 0.1.0
 */
export type TypeId = typeof TypeId;

interface Variance<T, Inputs> {
  readonly _T: Types.Invariant<T>;
  readonly _Inputs: Types.Contravariant<Inputs>;
}

/**
 * Host literals accepted without an explicit expression wrapper: strings, numbers, bigints, booleans and null.
 *
 * @category Models
 * @since 0.1.0
 */
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

/**
 * An exactly typed handle or the host primitive corresponding to its semantic descriptor.
 *
 * Argument compatibility uses the semantic metadata that adapted callables retain. {@link Type.PrimitiveInteger} operands accept bigint and Integer handles. TypeScript rejects a host number at that position rather than widening its descriptor.
 *
 * @category Models
 * @since 0.1.0
 */
export type Value<T extends Type.Any> =
  | (Expression.Any &
      Pick<Expression.Handle<T, never>, typeof TypeId | typeof Binding>)
  | (T extends Type.Primitive ? T["value"] : never);

export declare namespace Value {
  /** An expression or host literal accepted by syntax-only operations such as {@link toJExpr}. */
  export type Any = Expression.Any | Primitive;

  /**
   * Reads semantic metadata without constraining an adapted callable to its original host signature.
   *
   * Host numbers remain {@link Type.PrimitiveNumber} regardless of their emitted literal syntax.
   */
  export type Type<V extends Any> = V extends {
    readonly [TypeId]: {
      readonly _T: Types.Invariant<infer T extends Type.Any>;
    };
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

  /** The semantic input descriptors required by every host-side alternative, with defaults marked optional. */
  export type Inputs<E> = Input.Conservative<InputAlternatives<E>>;
}

/**
 * A symbolic HashQL value with type-directed projection, indexing and calls.
 *
 * `T` describes the represented value, not its host wrapper. `Inputs` records the inputs needed to evaluate it. Fields and tuple positions project to new expressions. Use `$project` for fields whose names collide with SDK operations or with inherited JavaScript members such as `toString`. Lists and dictionaries expose `$index`. Its result includes {@link Type.PrimitiveNull} for a missing entry. Callable descriptors expose a host call that constructs HashQL call syntax.
 *
 * `$projectUnsafe` and `$indexUnsafe` bypass descriptor restrictions and return an Unknown expression. They retain input requirements, including the index expression's requirements. They do not establish that the access is valid in HashQL.
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
 *
 * @category Models
 * @since 0.1.0
 */
export type Expression<T extends Type.Any, Inputs> = [T] extends [Type.Any]
  ? Expression.Base<T, Inputs>
  : never;

export declare namespace Expression {
  /** The structural type underlying {@link Expression}, including its descriptor-selected operations. */
  export type Base<T extends Type.Any, Inputs> = Handle<T, Inputs> &
    Accessors<T, Inputs> &
    Callable<T, Inputs>;

  /** An expression with its semantic type erased, for syntax-only operations. */
  export interface Any extends Relocatable<Any>, Pipeable.Pipeable {
    readonly [Binding]: Result.Result<AST.Node.Any, ProgramError.Construction>;
  }

  /** Semantic metadata and stored construction result shared by expressions and adapted callables. */
  export interface Handle<T extends Type.Any, Inputs> extends Any {
    readonly [TypeId]: Variance<T, Inputs>;
    readonly [Relocate]: Relocatable<Expression<T, Inputs>>[typeof Relocate];
  }

  /** A replacement call signature with the source expression's semantic metadata. */
  export type Adapted<T extends Type.Any, I, C> = C & Adapted.Metadata<T, I, C>;

  export namespace Adapted {
    /** The expression an adapted callable remains, relocating to an adapted callable rather than to its source. */
    export interface Metadata<T extends Type.Any, I, C> extends Any {
      readonly [TypeId]: Variance<T, I>;
      readonly [Relocate]: Relocatable<Adapted<T, I, C>>[typeof Relocate];
    }
  }
}

/**
 * Recognizes the private expression marker without checking the stored result or semantic type.
 *
 * Use this to distinguish SDK handles from host literals, not to validate untrusted objects.
 *
 * @category Guards
 * @since 0.1.0
 */
// oxlint-disable-next-line typescript/no-restricted-types -- the guard accepts unchecked host values
export const isExpression: (value: unknown) => value is Expression.Any =
  internal.isExpression;

/**
 * Extracts a handle's stored AST result or validates a host literal into an AST node.
 *
 * Existing construction failures pass through unchanged. Invalid primitive syntax, including a non-finite number, returns a {@link ProgramError.Construction} with the `InvalidExpression` reason. A host record that carries the {@link TypeId} key without being a handle fails with the same reason. Prefer {@link toJExpr} when consuming J-Expr syntax rather than builder nodes.
 *
 * @category Conversions
 * @since 0.1.0
 */
export const toNode: (
  value: Value.Any,
) => Result.Result<AST.Node.Any, ProgramError.Construction> = internal.toNode;

/**
 * Extracts J-Expr syntax without evaluating the represented value.
 *
 * A failed handle returns its stored construction error. Host literals undergo the same syntax validation as {@link literal}. Serialize the resulting structured syntax with {@link JExpr.compile}.
 *
 * @category Conversions
 * @since 0.1.0
 */
export const toJExpr = (
  value: Value.Any,
): Result.Result<JExpr.Expression, ProgramError.Construction> =>
  pipe(value, toNode, Result.map(AST.compile));

/**
 * Wraps an AST construction result while retaining either its node or its failure.
 *
 * This low-level builder operation trusts the caller to establish `T`, `Inputs` and the node's validity. Use {@link fromJExpr} when syntax needs validation.
 *
 * @category Conversions
 * @since 0.1.0
 */
export const fromResult: <T extends Type.Any, Inputs>(
  node: Result.Result<AST.Node.Any, ProgramError.Construction>,
) => Expression<T, Inputs> = internal.fromResult;

/**
 * Ascribes a semantic type to syntax supplied by a declaration or another trusted builder.
 *
 * The caller supplies the semantic type and input requirements. This operation validates syntax only. Invalid syntax stores a {@link ProgramError.Construction} with the `InvalidExpression` reason. Extract it with {@link toJExpr}. It does not resolve names or infer requirements from the syntax.
 *
 * @category Conversions
 * @since 0.1.0
 */
export const fromJExpr = <T extends Type.Any, Inputs>(
  expression: JExpr.Expression,
): Expression<T, Inputs> =>
  pipe(expression, internal.parseNode, fromResult<T, Inputs>);

/**
 * Wraps an already constructed AST node without validation, using caller-supplied semantic metadata as in {@link fromResult}.
 *
 * @category Conversions
 * @since 0.1.0
 */
export const fromNode = <T extends Type.Any, Inputs>(
  node: AST.Node.Any,
): Expression<T, Inputs> => pipe(node, Result.succeed, fromResult<T, Inputs>);

/**
 * Adapts host arguments while preserving expression metadata and rebinding.
 *
 * The adapter must retain the represented function's meaning. It may accept additional host shorthand and normalize it before emitting a call. The factory runs immediately and again with the new source expression on each relocation. Build the returned callable from that argument rather than capturing an older expression. The factory returns a host function rather than an expression, so returning the source unchanged is a type error. Exceptions from the factory or returned callable propagate to their caller.
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
 *
 * @category Combinators
 * @since 0.1.0
 */
export const adaptCallable: {
  <
    T extends Type.Any,
    I,
    C extends ((...args: never[]) => Expression.Any) & {
      readonly [TypeId]?: never;
    },
  >(
    adapt: (self: Expression<T, I>) => C,
  ): (self: Expression<T, I>) => Expression.Adapted<T, I, C>;
  <
    T extends Type.Any,
    I,
    C extends ((...args: never[]) => Expression.Any) & {
      readonly [TypeId]?: never;
    },
  >(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Expression.Adapted<T, I, C>;
} = Function.dual(
  2,
  <
    T extends Type.Any,
    I,
    C extends ((...args: never[]) => Expression.Any) & {
      readonly [TypeId]?: never;
    },
  >(
    self: Expression<T, I>,
    adapt: (self: Expression<T, I>) => C,
  ): Expression.Adapted<T, I, C> => {
    // The markers go on a fresh function, because `adapt` may return an object that other code holds, such as `self` itself. Assigning to that object would make its relocation call itself.
    const adapted = adapt(self);
    // SAFETY: the forwarder passes its arguments to `adapted` and returns its result, so it has `C`'s call signatures.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- TypeScript cannot give a forwarding function the call signatures of a generic `C`
    const callable = ((...args: never[]) => adapted(...args)) as C;

    return Object.assign(callable, {
      [internal.TypeId]: self[internal.TypeId],
      [internal.Binding]: self[internal.Binding],
      [Relocate]: (
        path: JExpr.Path.Path,
        bound?: Bound,
      ): Result.Result<
        Expression.Adapted<T, I, C>,
        ProgramError.Construction
      > => self[Relocate](path, bound).pipe(Result.map(adaptCallable(adapt))),
      ...Pipeable.Prototype,
    });
  },
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
 *
 * @category Combinators
 * @since 0.1.0
 */
export const assume =
  <T extends Type.Any>() =>
  <E extends Value.Any>(expression: E): Expression<T, Value.Inputs<E>> =>
    pipe(expression, toNode, fromResult<T, Value.Inputs<E>>);

/**
 * Asserts that an expression has the type `type`, which emits the `as` special form.
 *
 * The expression can be structural shorthand, such as a record of values. `type` can be a definition, as {@link Structural."type"} takes it. The result has the asserted type and keeps the expression's input requirements. The HashQL compiler checks the assertion rather than the SDK, and accepts one that keeps the expression's type or widens it to a supertype, never one that narrows it. Unlike {@link assume}, which changes only the SDK's type, `as` puts the assertion into the program. Call it as `as(expression, type)`, or as `as(type)` inside a `pipe`.
 *
 * A construction failure already stored in `expression` or `type` passes through.
 *
 * @example <caption>Widen an Integer to a Number.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression } = Program;
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(Expression.as(2n, Number)))),
 *   '["::kernel::special_form::as",{"#literal":2},"::kernel::type::Number"]',
 * );
 * ```
 *
 * @category Combinators
 * @since 0.1.0
 */
export const as: (<const T extends Structural.Definition>(
  type: T,
) => <const E extends Structural.Value.Any>(
  expression: E & Structural.Value.FixedLength<E>,
) => Expression<
  Structural.Definition.Type<T>,
  Structural.Value.Requirements<E>
>) &
  (<
    const E extends Structural.Value.Any,
    const T extends Structural.Definition,
  >(
    expression: E & Structural.Value.FixedLength<E>,
    type: T,
  ) => Expression<
    Structural.Definition.Type<T>,
    Structural.Value.Requirements<E>
  >) = Function.dual(
  2,
  <E extends Structural.Value.Any, T extends Structural.Definition>(
    expression: E,
    type: T,
  ): Expression<
    Structural.Definition.Type<T>,
    Structural.Value.Requirements<E>
  > =>
    pipe(
      {
        value: StructuralSyntax.valueNode(expression),
        type: Structural.type(type).pipe(Result.flatMap(Struct.get(TAST.Node))),
      },
      Result.all,
      Result.map(({ value, type }) => new AST.As(value, type)),
      fromResult<
        Structural.Definition.Type<T>,
        Structural.Value.Requirements<E>
      >,
    ),
);

/**
 * Constructs a typed host literal with no input requirements.
 *
 * Use a string to construct a string literal rather than a name reference. A host number has the {@link Type.PrimitiveNumber} descriptor even when its emitted syntax is integral. Bigints have the {@link Type.PrimitiveInteger} descriptor. A non-finite number stores a {@link ProgramError.Construction} with the `InvalidExpression` reason, which {@link toJExpr} returns. Objects and arrays need structural construction instead.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const literal = <const V extends Primitive>(
  value: V,
): Expression<Value.Type<V>, Input.Empty> => fromJExpr(JExpr.literal(value));

/**
 * Constructs an Integer literal from a bigint or integral host number.
 *
 * A fraction or a non-finite number stores a {@link ProgramError.Construction} with the `InvalidExpression` reason. Use bigint when the original integer exceeds the safe number range, because a number has already undergone JavaScript rounding. See {@link toJExpr} to inspect success or failure.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const integer = (
  value: number | bigint,
): Expression<Type.PrimitiveInteger, Input.Empty> =>
  fromJExpr(JExpr.integer(value));

/**
 * Constructs a Number literal, retaining non-finite values as construction failures as in {@link literal}.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const number = (
  value: number,
): Expression<Type.PrimitiveNumber, Input.Empty> =>
  fromJExpr(JExpr.literal(value));

/** A default that may be `undefined`. */
type InputArguments = readonly [defaultValue: Structural.Value.Any | undefined];

/** Checks each defined alternative without rejecting an explicitly absent default. */
type ExactDefault<T extends Type.Any, V> = V extends undefined
  ? V
  : V extends Structural.Value.Any
    ? Structural.Value.Exact<T, V>
    : never;

type ExactDefaults<T extends Type.Any, D extends InputArguments> = {
  readonly [K in keyof D]: ExactDefault<T, D[K]>;
};

/** The input's own entry, optional when the default is definitely present, merged with the default's requirements. */
type DefaultedInputs<
  Name extends string,
  T extends Type.Any,
  D extends InputArguments,
> = [D[0]] extends [undefined]
  ? Readonly<Record<Name, T>>
  : Input.Merge<
      undefined extends D[0]
        ? Readonly<Record<Name, T>>
        : Readonly<Partial<Record<Name, T>>>,
      Structural.Value.Requirements<Exclude<D[0], undefined>>
    >;

/**
 * References a program input, optionally supplying its default.
 *
 * The inferred {@link Value.Inputs} record requires the input when you omit the default or pass `undefined`. A definitely present default makes this occurrence optional, but another required use of the same name takes precedence. If the default's type includes `undefined`, the input remains required. Requirements of the default also contribute to the result.
 *
 * The default is an expression or structural shorthand, and it must match `type` exactly, including nested fields and tuple positions. Use constructed expressions for list, dictionary and nominal defaults.
 *
 * @param name - The input name emitted into the program.
 * @param type - The input's HashQL type, as a type expression or structural shorthand that {@link Structural."type"} takes, which also constrains the default.
 * @param defaultValue - The value used when the input is absent at query execution.
 * @returns A symbolic reference. Use {@link toJExpr} to extract the syntax or its construction failure.
 *
 * @example <caption>Supply a default page size.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr, Program } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const { Expression } = Program;
 * const pageSize = Expression.input("pageSize", BigInt, 10n);
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(pageSize))),
 *   '["::kernel::special_form::input","pageSize","::kernel::type::Integer",{"#literal":10}]',
 * );
 * ```
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs an input from its name and type
export function input<
  const Name extends string,
  const T extends Structural.Definition,
>(
  name: Name,
  type: T,
  defaultValue?: undefined,
): Expression<
  Structural.Definition.Type<T>,
  ReadonlyRecord<Name, Structural.Definition.Type<T>>
>;
export function input<
  const Name extends string,
  const T extends Structural.Definition,
  const Defaults extends InputArguments,
>(
  name: Name,
  type: T,
  ...defaults: Defaults &
    ExactDefaults<NoInfer<Structural.Definition.Type<T>>, Defaults>
): Expression<
  Structural.Definition.Type<T>,
  DefaultedInputs<Name, Structural.Definition.Type<T>, Defaults>
>;
export function input<T extends Structural.Definition>(
  name: string,
  type: T,
  defaultValue?: Structural.Value.Any,
): Expression<Structural.Definition.Type<T>, never> {
  return Result.gen(function* () {
    const ident = yield* AST.decodeInputName(name);
    const typeExpr = yield* Structural.type(type);
    const node = yield* typeExpr[TAST.Node];

    if (defaultValue === undefined) {
      return new AST.Input(ident, node, undefined);
    }

    const value = yield* StructuralSyntax.valueNode(defaultValue);
    return new AST.Input(ident, node, value);
  }).pipe(fromResult<Structural.Definition.Type<T>, never>);
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
 * const branches = { then: "enabled", else: "disabled" };
 * const label = Expression.ifElse(true, branches);
 * const piped = Expression.literal(true).pipe(Expression.ifElse(branches));
 * assert.equal(
 *   JExpr.compile(Result.getOrThrow(Expression.toJExpr(label))),
 *   '["::kernel::special_form::if",{"#literal":true},{"#literal":"enabled"},{"#literal":"disabled"}]',
 * );
 * assert.deepEqual(
 *   Result.getOrThrow(Expression.toJExpr(piped)),
 *   Result.getOrThrow(Expression.toJExpr(label)),
 * );
 * ```
 *
 * @category Constructors
 * @since 0.1.0
 */
export const ifElse: {
  <const Then extends Value.Any, const Else extends Value.Any>(branches: {
    readonly then: Then;
    readonly else: Else;
  }): <const Condition extends Value<Type.PrimitiveBoolean>>(
    condition: Condition,
  ) => Expression<
    Conditional<Value.Type<Then>, Value.Type<Else>>,
    Input.Merge<
      Value.Inputs<Condition>,
      Input.Merge<Value.Inputs<Then>, Value.Inputs<Else>>
    >
  >;
  <
    const Condition extends Value<Type.PrimitiveBoolean>,
    const Then extends Value.Any,
    const Else extends Value.Any,
  >(
    condition: Condition,
    branches: { readonly then: Then; readonly else: Else },
  ): Expression<
    Conditional<Value.Type<Then>, Value.Type<Else>>,
    Input.Merge<
      Value.Inputs<Condition>,
      Input.Merge<Value.Inputs<Then>, Value.Inputs<Else>>
    >
  >;
} = Function.dual(
  2,
  <
    const Condition extends Value<Type.PrimitiveBoolean>,
    const Then extends Value.Any,
    const Else extends Value.Any,
  >(
    condition: Condition,
    branches: { readonly then: Then; readonly else: Else },
  ): Expression<
    Conditional<Value.Type<Then>, Value.Type<Else>>,
    Input.Merge<
      Value.Inputs<Condition>,
      Input.Merge<Value.Inputs<Then>, Value.Inputs<Else>>
    >
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
        Conditional<Value.Type<Then>, Value.Type<Else>>,
        Input.Merge<
          Value.Inputs<Condition>,
          Input.Merge<Value.Inputs<Then>, Value.Inputs<Else>>
        >
      >,
    ),
);
