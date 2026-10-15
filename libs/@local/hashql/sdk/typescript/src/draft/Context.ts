/**
 * Typed construction operations inside a synchronous Draft callback.
 *
 * Context preserves each operation's semantic type and input requirements. It does not select an input policy: the program callback contract checks declarations against its explicit input schema. Nested callbacks receive fresh declaration collectors with the same prelude.
 *
 * @module
 */
import type { Relocatable, Relocate } from "../internal/relocation.js";
import type {
  Expression,
  Inputs,
  Module,
  Operators,
  Type,
  TypeExpression,
} from "../main.js";
import type { ArgumentInputs, Arguments } from "../program/ExpressionType.js";
import type * as Import from "../program/Import.js";
import type * as Namespace from "../program/Namespace.js";
import type * as QueryTypes from "../program/Query.js";
import type * as Scope from "../program/Scope.js";
import type * as Structural from "../program/Structural.js";

/**
 * The call signature of a Draft nominal constructor: it wraps an exactly typed value of the underlying type `T` as the nominal type.
 *
 * The argument can be an expression or structural shorthand, such as a record of expressions and primitives for a struct. TypeScript rejects missing, extra and wrongly typed fields. The result requires the inputs the argument requires.
 */
export type NominalCall<N extends symbol, T extends Type.Any> = <
  const V extends Structural.Value<T> & Structural.AnyValue,
>(
  value: Structural.Exact<T, V>,
) => Expression.Expression<Type.Opaque<N, T>, Structural.Requirements<V>>;

/**
 * A Draft nominal constructor: an expression of function type that also accepts structural shorthand.
 *
 * Rebinding it, as an import or module export does, keeps both the call signature and the nominal identity. Each constructor has one rebinding result rather than an intersection of recursive overloads.
 */
export interface NominalValue<N extends symbol, T extends Type.Any>
  extends Expression.Any, NominalCall<N, T> {
  readonly "~hashql/Expression": Expression.Handle<
    Type.Function<readonly [T], Type.Opaque<N, T>>,
    Inputs.Empty
  >["~hashql/Expression"];
  readonly [Relocate]: Relocatable<NominalValue<N, T>>[typeof Relocate];
}

/** The result of `newtype`: one handle that is both the nominal type expression and its constructor. */
export type Nominal<N extends symbol, T extends Type.Any> = Namespace.Joined<
  NominalValue<N, T>,
  TypeExpression.TypeExpression<Type.Opaque<N, T>>
>;

/**
 * A graph query under construction with the unrestricted context: an expression of the graph type with `filter` and `collect`.
 *
 * Binding it with `let` produces a plain expression without those methods.
 */
export type Query<
  S extends Scope.Scope,
  T extends Type.Any,
  V extends Type.Any,
  I,
> = Expression.Expression<T, I> & {
  /**
   * Adds a filter and constructs its predicate now, in its own declaration scope.
   *
   * `name` becomes the filter closure's parameter. `predicate` does not run when the query already carries a failure, or when `name` is not a valid HashQL identifier, which fails construction with `InvalidParameterName`. Otherwise `predicate` runs once, immediately, with a fresh context and the vertex expression. The filter closure contains the declarations made through that context. An exception the predicate throws becomes a `CallbackException` failure on the returned query.
   */
  readonly filter: <const P extends Expression.Value<Type.PrimitiveBoolean>>(
    name: string,
    predicate: (
      $: Context<S>,
      vertex: Expression.Expression<V, Inputs.Empty>,
    ) => P,
  ) => Query<S, T, V, Inputs.Merge<I, Expression.Inputs<P>>>;
  /** Ends the query, emitting `::graph::tail::collect`, as a list of its vertices. */
  readonly collect: () => Expression.Expression<Type.List<V>, I>;
};

/** The argument, result, vertex and input types of the scope's `entities` function, or `never` when it has none returning a graph. */
export type EntityFunction<S extends Scope.Scope> =
  QueryTypes.EntityFunction<S>;

/** The `entities` entry point: calls the scope's `entities` function and returns a query over its vertex type. */
export type Entities<S extends Scope.Scope> = <
  const A extends readonly Expression.AnyValue[] &
    Arguments<EntityFunction<S>["args"]>,
>(
  ...args: A
) => Query<
  S,
  EntityFunction<S>["returns"],
  EntityFunction<S>["vertex"],
  Inputs.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
>;

/** The query entry points of a context: `entities` when the scope declares a graph-returning `entities` function, otherwise none. */
export type QueryContext<S extends Scope.Scope> = [EntityFunction<S>] extends [
  never,
]
  ? // oxlint-disable-next-line typescript/no-generated-empty-object-type -- a scope without a graph declaration supplies no query entry point
    Record<never, never>
  : { readonly entities: Entities<S> };

/** The branch arguments of `if`: one record of values that already exist, or two callbacks that each construct a branch in its own context. */
export type Branches<
  S extends Scope.Scope,
  T extends Expression.AnyValue,
  E extends Expression.AnyValue,
> =
  | readonly [branches: { readonly then: T; readonly else: E }]
  | readonly [then: ($: Context<S>) => T, otherwise: ($: Context<S>) => E];

/** The expression `if` returns: its type combines the branch types, and its input requirements combine the condition's with both branches'. */
export type Conditional<
  C extends Expression.Value<Type.PrimitiveBoolean>,
  T extends Expression.AnyValue,
  E extends Expression.AnyValue,
> = Expression.Expression<
  Expression.Conditional<Expression.TypeOf<T>, Expression.TypeOf<E>>,
  Inputs.Merge<
    Expression.Inputs<C>,
    Inputs.Merge<Expression.Inputs<T>, Expression.Inputs<E>>
  >
>;

/**
 * The unrestricted Draft construction context for the scope `S`.
 *
 * Its operations construct syntax and collect declarations, accepting values regardless of their input requirements. Draft emits each declaration around the declaring callback's returned expression, in call order. Draft programs give their callbacks a view of this interface restricted to the program's input schema. That view is not assignable to this interface, and a callback written against this interface is not accepted as a program body. The predicate constructors `eq`, `ne`, `and`, `or`, `not`, `isTrue`, `isFalse` and `isNone` are the standalone `Operators` functions.
 */
export interface Context<S extends Scope.Scope> extends Operators.Operations {
  /**
   * Returns the prelude's exports as one record.
   *
   * Same-named module, type and value exports become one handle that keeps each capability. The record does not change when the callback imports a module.
   */
  readonly prelude: () => Namespace.Flatten<S>;
  /** Returns the prelude's modules, each with its child exports also available directly as properties. */
  readonly modules: () => Namespace.Modules<S>;
  /**
   * Imports a module's exports into the declaring callback and returns them as handles.
   *
   * Draft emits the import around the callback's returned expression, in call order with its other declarations. Omitting `selection` imports every export. Given a name array, `import` selects those exports. Given an alias record, it imports each listed export under a new name, where `"_"` keeps the export's own name. The returned record joins same-named exports as `prelude()` does and refers to them by their local names. It leaves `prelude()`, `modules()` and `query` unchanged.
   *
   * Unlike the other declarations, a failed import interrupts the callback, because it cannot supply the handles it promises. An invalid alias and a symbol key in the alias record both stop the callback with an `InvalidImportName` failure. The program returns the failure even if the callback catches the interruption.
   */
  readonly import: {
    <M extends Module.Any>(
      module: M & Import.Rebindable<M>,
    ): Namespace.Flatten<Import.Imported<M, "*">>;
    <M extends Module.Any, const I extends Import.Selection<M>>(
      module: M & Import.Rebindable<M>,
      selection: I,
    ): Namespace.Flatten<Import.Imported<M, I>>;
  };
  /** Lifts a host primitive to an expression whose type follows the host type. This is `Expression.literal`. */
  readonly literal: typeof Expression.literal;
  /** Constructs an Integer literal, failing construction for a fractional or non-finite number. This is `Expression.integer`. */
  readonly integer: typeof Expression.integer;
  /** Constructs a Number literal. This is `Expression.number`. */
  readonly number: typeof Expression.number;
  /** Changes an expression's semantic type assumption without validating that semantic type. This is `Expression.assume`. */
  readonly assume: typeof Expression.assume;
  /** References a program input, optionally with a default. This is `Expression.input`. */
  readonly input: typeof Expression.input;
  /** Graph query entry points, present when the prelude declares an `entities` function that returns a `::graph::Graph` opaque type. */
  readonly query: QueryContext<S>;
  /**
   * Binds a value to a HashQL name and returns a reference to the binding.
   *
   * Draft emits the binding around the declaring callback's returned expression, in call order with its other declarations, even when nothing refers to it. An invalid name, or a value whose construction failed, does not interrupt the callback, but Draft records the failure and the program fails. The reference is the binding's bare name, so carrying it out of the declaring callback leaves it without its binding.
   */
  readonly let: <const E extends Expression.AnyValue>(
    name: string,
    value: E,
  ) => Expression.Expression<Expression.TypeOf<E>, Expression.Inputs<E>>;
  /**
   * Declares a type alias and returns a reference to it.
   *
   * `definition` is a type expression or structural shorthand. `BigInt`, `Number`, `String` and `Boolean` denote the primitive types, and records and arrays of definitions denote structs and tuples. Draft emits the alias around the declaring callback's returned expression, in call order with its other declarations. An invalid name or definition leaves the callback running, but Draft records the failure and the program fails.
   */
  readonly type: <const D extends Structural.Definition>(
    name: string,
    definition: D,
  ) => TypeExpression.TypeExpression<Structural.TypeOf<D>>;
  /**
   * Declares a nominal type and returns one handle that is both the type and its constructor.
   *
   * The handle is a type expression for `Type.Opaque<N, T>`, where `T` is the definition's type, and a constructor from an exactly typed value of `T`, including structural shorthand. Calling it emits a call to the declared name. `identity` must have a `unique symbol` type. It distinguishes declarations in TypeScript, and the output never contains it. Draft emits the declaration and records its failures as for `type`.
   */
  readonly newtype: <
    const N extends symbol,
    const D extends Structural.Definition,
  >(
    name: string,
    identity: symbol extends N ? never : N,
    definition: D,
  ) => Nominal<N, Structural.TypeOf<D>>;
  /**
   * Constructs a HashQL conditional from a Boolean condition and two branches.
   *
   * A `{ then, else }` record supplies values that already exist and creates no declaration scope. A pair of callbacks constructs the branches instead. Both run immediately, `then` first, whatever the condition's value, each with a fresh context whose declarations stay inside that branch. An exception thrown by a callback becomes a `CallbackException` failure on the returned expression and does not interrupt the enclosing callback.
   */
  readonly if: <
    const C extends Expression.Value<Type.PrimitiveBoolean>,
    const T extends Expression.AnyValue,
    const E extends Expression.AnyValue,
  >(
    condition: C,
    ...branches: Branches<S, T, E>
  ) => Conditional<C, T, E>;
}
