/**
 * The explicit-input policy of a Draft program callback.
 *
 * Every operation that emits a value checks its requirements, including discarded let initializers and nested callback bodies. This policy belongs to the program boundary rather than Context: the constructor implementation can accept more values than a particular program permits. The result conservatively requires the entire supplied schema, including unused entries.
 *
 * @module
 */
import type * as Expression from "../Program/Expression.js";
import type { ArgumentInputs, Arguments } from "../Program/ExpressionType.js";
import type * as Input from "../Program/Inputs.js";
import type * as Scope from "../Program/Scope.js";
import type * as TypeExpression from "../Program/TypeExpression.js";
import type * as Type from "../Type/index.js";
import type * as Construction from "./Context.js";
import type { ReadonlyRecord } from "effect/Record";

/**
 * An input schema maps each program input's name to the input's type expression.
 *
 * Every own string key, including a non-enumerable one, becomes an input handle. A symbol key from an unchecked caller fails construction with `SymbolInputName` before the callback runs.
 */
export type Inputs = ReadonlyRecord<string, TypeExpression.Any>;
type TypeInputs<I extends Inputs> = {
  readonly [K in keyof I]: I[K] extends TypeExpression.TypeExpression<infer T>
    ? T
    : never;
};
/**
 * The input requirements of a program built from a schema, listing every entry as required with its semantic type.
 *
 * Entries the callback never uses, and entries whose every use supplies a default, remain required. A schema typed as a union of records requires the entries of every alternative, including an alternative with no entries.
 *
 * @example <caption>Type-only: a result keeps unused entries, and a discarded binding still needs its input declared.</caption>
 * ```ts
 * import { Expression, Prelude } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const { Integer } = Prelude.builtin.types;
 * const schema = { limit: Integer, verbose: Prelude.builtin.types.Boolean };
 * const built = Result.getOrThrow(program(schema, ($, { limit }) => $.let("limit", limit)));
 * type Whole = {
 *   readonly limit: Type.PrimitiveInteger;
 *   readonly verbose: Type.PrimitiveBoolean;
 * };
 * const whole: Expression.Expression<Type.PrimitiveInteger, Whole> = built;
 * // @ts-expect-error The unused `verbose` entry stays required.
 * const partial: Expression.Expression<Type.PrimitiveInteger, Pick<Whole, "limit">> = built;
 *
 * const outside = Expression.input("outside", Integer);
 * program({}, ($) => {
 *   // @ts-expect-error The schema does not declare `outside`.
 *   $.let("ignored", outside);
 *   return $.literal(true);
 * });
 * ```
 */
export type Requirements<I extends Inputs> = Input.Conservative<TypeInputs<I>>;
/** The input handle for the schema key `K` with the type expression `D`, which references that input and requires `K`. */
export type Handle<K extends PropertyKey, D extends TypeExpression.Any> =
  D extends TypeExpression.TypeExpression<infer T>
    ? Expression.Expression<T, Readonly<Record<K, T>>>
    : never;
/**
 * The frozen record a program callback receives as its second argument, holding one input handle per schema key.
 *
 * Each handle emits an input reference without a default at every use.
 */
export type Handles<I extends Inputs> = {
  readonly [K in keyof I]: Handle<K, I[K]>;
};

// oxlint-disable-next-line typescript/no-restricted-types -- distributes the check over host alternatives without erasing any input record
type Mismatches<S, I> = I extends unknown
  ? {
      [K in keyof I]-?: K extends keyof S
        ? [S[K]] extends [Exclude<I[K], undefined>]
          ? [Exclude<I[K], undefined>] extends [S[K]]
            ? never
            : K
          : K
        : K;
    }[keyof I]
  : never;

/**
 * Accepts input requirements when the schema record `S` declares each of them with the same semantic type.
 *
 * It evaluates to `unknown`, which leaves an intersection unchanged, when every host-side alternative of the requirements fits. Otherwise it evaluates to `never`, which rejects the value it constrains. An input used with a default still needs a declaration. Erased requirements, such as those of `Expression.Any` or `Expression.Value`, never fit, because they cannot show which inputs they need.
 */
export type Check<S, I> = [I] extends [never]
  ? never
  : [Mismatches<S, Input.Conservative<I>>] extends [never]
    ? // oxlint-disable-next-line typescript/no-restricted-types -- unknown is the identity of an accepted intersection constraint
      unknown
    : never;
type Accept<I, E> = Check<I, Expression.Inputs<E>>;

/**
 * A graph query under construction in a program callback, whose arguments and predicates must fit the program's schema.
 *
 * The query is an expression of the graph type with `filter` and `collect`. Binding it with `let` produces a plain expression without those methods.
 */
type Query<
  S extends Scope.Scope,
  I,
  T extends Type.Any,
  V extends Type.Any,
  R,
> = Expression.Expression<T, R> & {
  /**
   * Adds a filter and constructs its predicate now, in its own declaration scope.
   *
   * `name` becomes the filter closure's parameter. `predicate` does not run when the query already carries a failure, or when `name` is not a valid HashQL identifier, which fails construction with `InvalidParameterName`. Otherwise `predicate` runs once, immediately, with a fresh restricted context and the vertex expression. The filter closure contains the declarations made through that context. The predicate returns a Boolean expression or host boolean whose input requirements fit the schema. An exception it throws becomes a `CallbackException` failure on the returned query.
   */
  readonly filter: <const P extends Expression.Value<Type.PrimitiveBoolean>>(
    name: string,
    predicate: (
      $: Context<S, I>,
      vertex: Expression.Expression<V, Input.Empty>,
    ) => P & Accept<I, P>,
  ) => Query<S, I, T, V, Input.Merge<R, Expression.Inputs<P>>>;
  /** Ends the query, emitting `::graph::tail::collect`, as a list of its vertices. */
  readonly collect: () => Expression.Expression<Type.List<V>, R>;
};

type EntityFunction<S extends Scope.Scope> = Construction.EntityFunction<S>;
type QueryContext<S extends Scope.Scope, I> = [EntityFunction<S>] extends [
  never,
]
  ? // oxlint-disable-next-line typescript/no-generated-empty-object-type -- no graph declaration means no query entry point
    Record<never, never>
  : {
      /** Starts a graph query by calling the prelude's `entities` function, with arguments whose input requirements fit the schema. */
      readonly entities: <
        const A extends readonly Expression.AnyValue[] &
          Arguments<EntityFunction<S>["args"]>,
      >(
        ...args: A &
          Check<I, Input.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>>
      ) => Query<
        S,
        I,
        EntityFunction<S>["returns"],
        EntityFunction<S>["vertex"],
        Input.Merge<EntityFunction<S>["inputs"], ArgumentInputs<A>>
      >;
    };

/**
 * The `$` argument of a program callback, which restricts the construction context to the program's input schema.
 *
 * `let`, `if` and `query` accept only values whose input requirements fit the schema, and branch and predicate callbacks receive the same restricted view. The other members are the unrestricted Draft `Context.Context` operations. The unrestricted constructor implements this view, but the view is not assignable to `Context.Context`, so a helper typed with the unrestricted context cannot receive a program's `$`.
 */
export interface Context<S extends Scope.Scope, I> extends Omit<
  Construction.Context<S>,
  "let" | "if" | "query"
> {
  /**
   * Binds a value to a HashQL name and returns a reference to the binding.
   *
   * Draft emits the binding around this callback's returned expression, in call order with its other declarations, even when nothing refers to it. `value` is an expression or host primitive whose input requirements fit the schema, and the reference keeps its semantic type and requirements. An invalid name, or a value whose construction failed, does not interrupt the callback, but Draft records the failure and the program fails. The reference is the binding's bare name, so carrying it out of this callback leaves it without its binding.
   */
  readonly let: <const E extends Expression.AnyValue>(
    name: string,
    value: E & Accept<I, E>,
  ) => Expression.Expression<Expression.TypeOf<E>, Expression.Inputs<E>>;
  /**
   * Graph query entry points, present when the prelude declares an `entities` function that returns a `::graph::Graph` opaque type.
   *
   * The function's result type determines the vertex type that filter predicates receive. Query arguments and predicate results must fit the schema.
   *
   * @example <caption>Filter a declared graph with a predicate-local binding.</caption>
   * ```ts
   * import assert from "node:assert/strict";
   * import { Module, Program } from "@local/hashql";
   * import type { Type } from "@local/hashql";
   * import { withPrelude } from "@local/hashql/draft";
   * import { Result } from "effect";
   *
   * type Vertex = Type.Struct<{ readonly archived: Type.PrimitiveBoolean }>;
   * type Graph = Type.Opaque<"::graph::Graph", Type.Struct<{ readonly "'marker": Vertex }>>;
   * const graph = Result.getOrThrow(
   *   Module.define("::example::graph", {
   *     values: { entities: Module.value<Type.Function<readonly [], Graph>>() },
   *   }),
   * );
   * const { program } = withPrelude(graph);
   *
   * let predicates = 0;
   * const live = program({}, ($) =>
   *   $.query
   *     .entities()
   *     .filter("vertex", (predicate, vertex) => {
   *       predicates += 1;
   *       const archived = predicate.let("archived", vertex.archived);
   *       return predicate.isFalse(archived);
   *     })
   *     .collect(),
   * );
   * assert.equal(predicates, 1);
   * assert.equal(
   *   Result.getOrThrow(Result.flatMap(live, (root) => Program.compile(Program.program(root)))),
   *   '["::graph::tail::collect",["::graph::body::filter",["::example::graph::entities"],["fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",["::kernel::special_form::let","archived",["::kernel::special_form::access","vertex","archived"],["::core::cmp::eq","archived",{"#literal":false}]]]]]',
   * );
   * ```
   */
  readonly query: QueryContext<S, I>;
  /**
   * Constructs a HashQL conditional from a Boolean condition and two branches.
   *
   * The condition and both branches must fit the schema, and the result combines their input requirements. HashQL decides the condition when the query runs, so construction always builds both branches.
   *
   * @example <caption>Construct both branches, one with a branch-local binding.</caption>
   * ```ts
   * import assert from "node:assert/strict";
   * import { Program } from "@local/hashql";
   * import { program } from "@local/hashql/draft";
   * import { Result } from "effect";
   *
   * const visited: string[] = [];
   * const choice = program({}, ($) =>
   *   $.if(
   *     false,
   *     (branch) => {
   *       visited.push("then");
   *       return branch.let("inside", 1n);
   *     },
   *     () => {
   *       visited.push("else");
   *       return 2n;
   *     },
   *   ),
   * );
   * assert.deepEqual(visited, ["then", "else"]);
   * assert.equal(
   *   Result.getOrThrow(Result.flatMap(choice, (root) => Program.compile(Program.program(root)))),
   *   '["::kernel::special_form::if",{"#literal":false},["::kernel::special_form::let","inside",{"#literal":1},"inside"],{"#literal":2}]',
   * );
   * ```
   */
  readonly if: {
    /** Uses values that already exist as the branches. No callback runs, and the branches get no declaration scope of their own. */
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.AnyValue,
      const E extends Expression.AnyValue,
    >(
      condition: C & Accept<I, C>,
      branches: {
        readonly then: T & Accept<I, T>;
        readonly else: E & Accept<I, E>;
      },
    ): Construction.Conditional<C, T, E>;
    /**
     * Constructs each branch with a callback in its own declaration scope.
     *
     * Both callbacks run immediately, `then` first, whatever the condition's value. Each receives a fresh restricted context, and that branch contains the declarations made through it. Declarations made through a captured outer `$` belong to the outer callback instead. An exception thrown by a callback becomes a `CallbackException` failure on the returned expression and does not interrupt the enclosing callback.
     */
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.AnyValue,
      const E extends Expression.AnyValue,
    >(
      condition: C & Accept<I, C>,
      then: ($: Context<S, I>) => T & Accept<I, T>,
      otherwise: ($: Context<S, I>) => E & Accept<I, E>,
    ): Construction.Conditional<C, T, E>;
  };
}

/**
 * The callback a Draft program runs with the restricted context and the input handles to obtain the root expression.
 *
 * The returned expression's input requirements must fit the schema. Returning anything other than an expression handle fails construction with `InvalidBodyResult`. The type rejects an asynchronous callback, and at runtime its promise fails construction the same way.
 */
export type Body<
  S extends Scope.Scope,
  I extends Inputs,
  O extends Expression.AnyValue & Expression.Any,
> = (
  $: Context<S, Requirements<I>>,
  inputs: Handles<I>,
) => O & Check<NoInfer<Requirements<I>>, Expression.Inputs<O>>;

export type WithoutInputs<
  S extends Scope.Scope,
  I extends Inputs,
  O extends Expression.AnyValue & Expression.Any,
> = ($: Context<S, Requirements<I>>) => ReturnType<Body<S, I, O>>;
