/**
 * Typed construction operations inside a synchronous Draft callback.
 *
 * Context preserves each operation's semantic type and input requirements. It does not select an input policy: the program callback contract checks declarations against its explicit input schema. Nested callbacks receive fresh declaration collectors with the same prelude.
 *
 * @module
 */
// oxlint-disable import/max-dependencies -- a context names the operations of every construction module
import type { Relocatable, Relocate } from "../internal/relocation.js";
import type * as Expression from "../Program/Expression.js";
import type * as Import from "../Program/Import/index.js";
import type * as Inputs from "../Program/Inputs.js";
import type * as Module from "../Program/Module.js";
import type * as Namespace from "../Program/Namespace.js";
import type * as Operators from "../Program/Operators.js";
import type { Entity, Graph, QueryTemporalAxes } from "../Program/Query.js";
import type * as Scope from "../Program/Scope.js";
import type * as Structural from "../Program/Structural.js";
import type * as TypeExpression from "../Program/TypeExpression.js";
import type * as Type from "../Type.js";

/**
 * The call signature of a Draft nominal constructor: it wraps an exactly typed value of the underlying type `T` as the nominal type `N`.
 *
 * The argument can be an expression or structural shorthand, such as a record of host values and expressions for a struct. TypeScript rejects missing, extra and wrongly typed fields. The call emits the representation first and applies the constructor to it. The result requires the inputs the argument requires.
 */
export type NominalCall<N extends string, T extends Type.Any> = <
  const V extends Structural.Value<T> & Structural.Value.Any,
>(
  value: Structural.Value.Exact<T, V>,
) => Expression.Expression<Type.Opaque<N, T>, Structural.Value.Requirements<V>>;

/**
 * A Draft nominal constructor: an expression of function type that also accepts structural shorthand.
 *
 * Rebinding it, as an import or module export does, keeps both the call signature and the nominal identity. `Expression.adaptCallable` constructs it. It is an interface rather than that function's `Expression.Expression.Adapted` result, because TypeScript defers an interface's recursive rebinding until a comparison reaches it. That keeps comparisons of `newtype` signatures within TypeScript's instantiation depth.
 */
export interface NominalValue<N extends string, T extends Type.Any>
  extends
    Expression.Expression.Any,
    NominalCall<N, T>,
    Pick<
      Expression.Expression.Handle<
        Type.Function<readonly [T], Type.Opaque<N, T>>,
        Inputs.Empty
      >,
      Expression.TypeId
    > {
  readonly [Relocate]: Relocatable<NominalValue<N, T>>[typeof Relocate];
}

/** The result of `newtype`: one handle that is both the nominal type expression and its constructor. */
export type Nominal<N extends string, T extends Type.Any> = Namespace.Joined<
  NominalValue<N, T>,
  TypeExpression.TypeExpression<Type.Opaque<N, T>>
>;

/** HashQL's `Option<T>`: the `Some` newtype around `T`, or `None`. */
export type Option<T extends Type.Any> = Type.Union<
  readonly [
    Type.Opaque<"::core::option::Some", T>,
    Type.Opaque<"::core::option::None", Type.PrimitiveNull>,
  ]
>;

/** The expression `if` returns with both branches: its type combines the branch types, and its input requirements combine the condition's with both branches'. */
export type Conditional<
  C extends Expression.Value<Type.PrimitiveBoolean>,
  T extends Expression.Value.Any,
  E extends Expression.Value.Any,
> = Expression.Expression<
  Expression.Conditional<Expression.Value.Type<T>, Expression.Value.Type<E>>,
  Inputs.Merge<
    Expression.Value.Inputs<C>,
    Inputs.Merge<Expression.Value.Inputs<T>, Expression.Value.Inputs<E>>
  >
>;

/** The expression `if` returns without `else`: its type is an {@link Option} of the `then` branch's type, and it requires the condition's inputs and the branch's. */
export type Optional<
  C extends Expression.Value<Type.PrimitiveBoolean>,
  T extends Expression.Value.Any,
> = Expression.Expression<
  Option<Expression.Value.Type<T>>,
  Inputs.Merge<Expression.Value.Inputs<C>, Expression.Value.Inputs<T>>
>;

/**
 * A graph query under construction: the graph expression with `filter` and `collect`.
 *
 * It is an expression of the graph type. Binding it with `let` gives a reference without these methods, and {@link @local/hashql!Program.Query.filter | Query.filter} and {@link @local/hashql!Program.Query.collect | Query.collect} still take that reference.
 */
export interface Query<
  S extends Scope.Scope.Any,
  V extends Type.Any,
  I,
> extends Expression.Expression.Handle<Graph<V>, I> {
  /**
   * Keeps the vertices `predicate` accepts, constructing it now with a fresh context whose declarations stay inside the filter. Declarations made through a captured outer `$` belong to the outer callback instead.
   *
   * `name` becomes the filter closure's parameter and `vertex` refers to it, as in {@link @local/hashql!Program.Query.filter | Query.filter}, whose documentation also says when `predicate` does not run. `vertex` is valid inside the predicate alone, so using it in a declaration made through the outer `$` fails the program with the `StaleReference` reason. An exception it throws becomes a `CallbackException` failure on the returned query.
   */
  readonly filter: <const P extends Expression.Value<Type.PrimitiveBoolean>>(
    name: string,
    predicate: (
      $: Context<S>,
      vertex: Expression.Expression<V, Inputs.Empty>,
    ) => P,
  ) => Query<S, V, Inputs.Merge<I, Expression.Value.Inputs<P>>>;

  /** Ends the query as a list of its vertices. This is {@link @local/hashql!Program.Query.collect | Query.collect}. */
  readonly collect: () => Expression.Expression<Type.List<V>, I>;
}

/** `$.query`: starts a graph query from a graph expression, or from every entity with `entities`. */
export interface Queries<S extends Scope.Scope.Any> {
  <const G extends Expression.Expression.Any>(
    graph: G & Graph.Check<G>,
  ): Query<S, Graph.Vertex<G>, Expression.Value.Inputs<G>>;

  /** Starts a query from every entity at the temporal axes `axis`. This is {@link @local/hashql!Program.Query.entities | Query.entities}. */
  readonly entities: <const A extends Expression.Value<QueryTemporalAxes>>(
    axis: A,
  ) => Query<S, Entity, Expression.Value.Inputs<A>>;
}

/**
 * The unrestricted Draft construction context for the scope `S`.
 *
 * Its operations construct syntax and collect declarations, accepting values regardless of their input requirements. A program callback receives `Body.Context` instead, which restricts them to the program's input schema. The predicate constructors `eq`, `ne`, `and`, `or`, `not`, `isTrue`, `isFalse` and `isNone` are the standalone `Operators` functions.
 */
export interface Context<S extends Scope.Scope.Any>
  extends Operators.Operations {
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
   * Omitting `selection` imports every export. Given a name array, `import` selects those exports. Given an alias record, it imports each listed export under a new name, where `"_"` keeps the export's own name. The returned record joins same-named exports as `prelude()` does and refers to them by their local names. It leaves `prelude()` and `modules()` unchanged.
   *
   * Unlike the other declarations, a failed import interrupts the callback, because it cannot supply the handles it promises. An invalid alias stops the callback with an `InvalidImportName` failure. The failure stays with the callback's result even if the callback catches the interruption: the program for a program callback, and the conditional for a branch.
   */
  readonly import: {
    <M extends Module.Module.Any>(
      module: M & Import.Rebindable<M>,
    ): Namespace.Flatten<Import.Bindings.Bindings<M, "*">>;
    <
      M extends Module.Module.Any,
      const I extends Import.Selection<M, keyof I & (string | number)>,
    >(
      module: M & Import.Rebindable<M>,
      selection: I & Import.Selection.Valid<M, I>,
    ): Namespace.Flatten<Import.Bindings.Bindings<M, I>>;
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

  /**
   * Binds a value to a HashQL name and returns a reference to the binding.
   *
   * Pass `type`, a type expression or structural shorthand as `$.type` takes it, to annotate the binding as in `let name: type = value`. The reference then has the annotation's type, which widens the value's. Draft does not check the value against the annotation, as with `assume`, and the HashQL compiler does.
   */
  readonly let: {
    <const E extends Expression.Value.Any>(
      name: string,
      value: E,
    ): Expression.Expression<
      Expression.Value.Type<E>,
      Expression.Value.Inputs<E>
    >;
    <
      const E extends Expression.Value.Any,
      const D extends Structural.Definition,
    >(
      name: string,
      value: E,
      type: D,
    ): Expression.Expression<
      Structural.Definition.Type<D>,
      Expression.Value.Inputs<E>
    >;
  };

  /**
   * Declares a type alias and returns a reference to it.
   *
   * `definition` is a type expression or structural shorthand. `BigInt`, `Number`, `String` and `Boolean` denote the primitive types, and records and arrays of definitions denote structs and tuples.
   */
  readonly type: <const D extends Structural.Definition>(
    name: string,
    definition: D,
  ) => TypeExpression.TypeExpression<Structural.Definition.Type<D>>;

  /**
   * Declares a nominal type and returns one handle that is both the type and its constructor.
   *
   * The handle is a type expression for `Type.Opaque<N, T>`, where `N` is the declared name and `T` is the definition's type, and a constructor from an exactly typed value of `T`, including structural shorthand such as `Foo({ foo: true })`. Calling it emits a call to the declared name. TypeScript tells newtypes apart by name, so `name` must be a string literal.
   */
  readonly newtype: <
    const N extends string,
    const D extends Structural.Definition,
  >(
    name: string extends N ? never : N,
    definition: D,
  ) => Nominal<N, Structural.Definition.Type<D>>;

  /**
   * Constructs a HashQL conditional from a Boolean condition and a record of branch callbacks.
   *
   * The callbacks run immediately, `then` first, whatever the condition's value, each with a fresh context whose declarations stay inside that branch. Declarations made through a captured outer `$` belong to the outer callback instead. Without `else`, the conditional is an {@link Option}: `Some` of the `then` branch when the condition holds, and `None` otherwise. An exception thrown by a callback becomes a `CallbackException` failure on the returned expression and does not interrupt the enclosing callback.
   */
  readonly if: {
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.Value.Any,
      const E extends Expression.Value.Any,
    >(
      condition: C,
      branches: {
        readonly then: ($: Context<S>) => T;
        readonly else: ($: Context<S>) => E;
      },
    ): Conditional<C, T, E>;
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.Value.Any,
    >(
      condition: C,
      branches: { readonly then: ($: Context<S>) => T },
    ): Optional<C, T>;
  };

  /** Starts a graph query from a graph expression, such as a call to a graph function from the prelude or an import, or from every entity with `$.query.entities(axis)`. */
  readonly query: Queries<S>;
}
