/**
 * The explicit-input policy of a Draft program callback.
 *
 * Every operation that emits a value checks its requirements, including discarded let initializers and nested callback bodies. This policy belongs to the program boundary rather than Context: the constructor implementation can accept more values than a particular program permits.
 *
 * @module
 */
import type * as Expression from "../Program/Expression.js";
import type * as Input from "../Program/Inputs.js";
import type * as Scope from "../Program/Scope.js";
import type * as Structural from "../Program/Structural.js";
import type * as Type from "../Type.js";
import type * as Construction from "./Context.js";
import type { ReadonlyRecord } from "effect/Record";

/**
 * An input schema maps each program input's name to its type, as a type expression or structural shorthand.
 *
 * `BigInt`, `Number`, `String` and `Boolean` denote the primitive types, and records and arrays of definitions denote structs and tuples, as in `$.type`. Every enumerable own string key becomes an input handle. A symbol key cannot name an input, so TypeScript rejects one.
 */
export type Inputs = ReadonlyRecord<string, Structural.Definition>;

/** The semantic type of each entry of the schema `I`. */
type TypeInputs<I extends Inputs> = {
  readonly [K in keyof I]: Structural.Definition.Type<I[K]>;
};

/**
 * The input requirements of a program built from a schema, listing every entry as required with its semantic type.
 *
 * Entries the callback never uses, and entries whose every use supplies a default, remain required. A schema typed as a union of records requires the entries of every alternative, including an alternative with no entries.
 *
 * @example <caption>Type-only: a result keeps unused entries, and a discarded binding still needs its input declared.</caption>
 * ```ts
 * import { Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { program } from "@local/hashql/draft";
 * import { Result } from "effect";
 *
 * const built = Result.getOrThrow(
 *   program({ limit: BigInt, verbose: Boolean }, ($, { limit }) => $.let("limit", limit)),
 * );
 * type Whole = {
 *   readonly limit: Type.PrimitiveInteger;
 *   readonly verbose: Type.PrimitiveBoolean;
 * };
 * const whole: Program.Expression.Expression<Type.PrimitiveInteger, Whole> = built;
 * // @ts-expect-error The unused `verbose` entry stays required.
 * const partial: Program.Expression.Expression<Type.PrimitiveInteger, Pick<Whole, "limit">> = built;
 *
 * const outside = Program.Structural.input("outside", BigInt);
 * program({}, ($) => {
 *   // @ts-expect-error The schema does not declare `outside`.
 *   $.let("ignored", outside);
 *   return $.literal(true);
 * });
 * ```
 */
export type Requirements<I extends Inputs> = Input.Conservative<TypeInputs<I>>;

/** The input handle for the schema key `K` with the definition `D`, which references that input and requires `K`. */
export type Handle<
  K extends PropertyKey,
  D extends Structural.Definition,
> = Expression.Expression<
  Structural.Definition.Type<D>,
  Readonly<Record<K, Structural.Definition.Type<D>>>
>;

/**
 * The frozen record a program callback receives as its second argument, holding one input handle per schema key.
 *
 * Each handle emits an input reference without a default at every use.
 */
export type Handles<I extends Inputs> = {
  readonly [K in keyof I]: Handle<K, I[K]>;
};

/** The keys of the requirements `I` that the schema record `S` lacks or declares with another semantic type, over every alternative of `I`. */
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
 * It evaluates to `unknown`, which leaves an intersection unchanged, when every host-side alternative of the requirements fits. Otherwise it evaluates to `never`, which rejects the value it constrains. An input used with a default still needs a declaration. Erased requirements, such as those of `Expression.Expression.Any` or `Expression.Value.Any`, never fit, because they cannot show which inputs they need.
 */
export type Check<S, I> = [I] extends [never]
  ? never
  : [Mismatches<S, Input.Conservative<I>>] extends [never]
    ? // oxlint-disable-next-line typescript/no-restricted-types -- unknown is the identity of an accepted intersection constraint
      unknown
    : never;

/** Checks the inputs the expression `E` requires against the schema record `I`, as {@link Check} does. */
type Accept<I, E> = Check<I, Expression.Value.Inputs<E>>;

/**
 * The `$` argument of a program callback, which restricts the construction context to the program's input schema.
 *
 * `let` and `if` accept only values whose input requirements fit the schema, and `if`'s branch callbacks receive the same restricted view. The other members are the unrestricted Draft `Context.Context` operations. The unrestricted constructor implements this view, but the view is not assignable to `Context.Context`, so a helper typed with the unrestricted context cannot receive a program's `$`.
 */
export interface Context<S extends Scope.Scope.Any, I> extends Omit<
  Construction.Context<S>,
  "let" | "if"
> {
  /**
   * Binds a value to a HashQL name and returns a reference to the binding.
   *
   * `value` is an expression or host primitive whose input requirements fit the schema, and the reference keeps its semantic type and requirements.
   *
   * A `type` annotates the binding, and the reference takes the annotation's type, as `Context.let` describes.
   */
  readonly let: {
    <const E extends Expression.Value.Any>(
      name: string,
      value: E & Accept<I, E>,
    ): Expression.Expression<
      Expression.Value.Type<E>,
      Expression.Value.Inputs<E>
    >;
    <
      const E extends Expression.Value.Any,
      const D extends Structural.Definition,
    >(
      name: string,
      value: E & Accept<I, E>,
      type: D,
    ): Expression.Expression<
      Structural.Definition.Type<D>,
      Expression.Value.Inputs<E>
    >;
  };

  /**
   * Constructs a HashQL conditional from a Boolean condition and a record of branch callbacks.
   *
   * The condition and every branch must fit the schema, and the result combines their input requirements. HashQL decides the condition when the query runs, so construction always builds every branch. The callbacks run immediately, `then` first, whatever the condition's value. Each receives a fresh restricted context, and the `if` of `Context.Context` describes where its declarations belong. An exception thrown by a callback becomes a `CallbackException` failure on the returned expression and does not interrupt the enclosing callback.
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
   *   $.if(false, {
   *     then: (branch) => {
   *       visited.push("then");
   *       return branch.let("inside", 1n);
   *     },
   *     else: () => {
   *       visited.push("else");
   *       return 2n;
   *     },
   *   }),
   * );
   * assert.deepEqual(visited, ["then", "else"]);
   * assert.equal(
   *   Result.getOrThrow(Result.flatMap(choice, (root) => Program.compile(Program.program(root)))),
   *   '["::kernel::special_form::if",{"#literal":false},["::kernel::special_form::let","inside",{"#literal":1},"inside"],{"#literal":2}]',
   * );
   * ```
   *
   * @example <caption>Omit `else` to construct an `Option`.</caption>
   * ```ts
   * import assert from "node:assert/strict";
   * import { Program } from "@local/hashql";
   * import { program } from "@local/hashql/draft";
   * import { Result } from "effect";
   *
   * const maybe = program({ flag: Boolean }, ($, { flag }) => $.if(flag, { then: () => 1n }));
   * assert.equal(
   *   Result.getOrThrow(Result.flatMap(maybe, (root) => Program.compile(Program.program(root)))),
   *   '["::kernel::special_form::if",["::kernel::special_form::input","flag","::kernel::type::Boolean"],{"#literal":1}]',
   * );
   * ```
   */
  readonly if: {
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.Value.Any,
      const E extends Expression.Value.Any,
    >(
      condition: C & Accept<I, C>,
      branches: {
        readonly then: ($: Context<S, I>) => T & Accept<I, T>;
        readonly else: ($: Context<S, I>) => E & Accept<I, E>;
      },
    ): Construction.Conditional<C, T, E>;
    <
      const C extends Expression.Value<Type.PrimitiveBoolean>,
      const T extends Expression.Value.Any,
    >(
      condition: C & Accept<I, C>,
      branches: { readonly then: ($: Context<S, I>) => T & Accept<I, T> },
    ): Construction.Optional<C, T>;
  };
}

/**
 * The callback a Draft program runs with the restricted context and the input handles to obtain the root expression.
 *
 * The returned expression's input requirements must fit the schema. Returning anything other than an expression handle fails construction with `InvalidBodyResult`. The type rejects an asynchronous callback, and at runtime its promise fails construction the same way.
 */
export type Body<
  S extends Scope.Scope.Any,
  I extends Inputs,
  O extends Expression.Value.Any & Expression.Expression.Any,
> = (
  $: Context<S, Requirements<I>>,
  inputs: Handles<I>,
) => O & Check<NoInfer<Requirements<I>>, Expression.Value.Inputs<O>>;

/** A {@link Body} with its input handles already supplied. */
export type WithoutInputs<
  S extends Scope.Scope.Any,
  I extends Inputs,
  O extends Expression.Value.Any & Expression.Expression.Any,
> = ($: Context<S, Requirements<I>>) => ReturnType<Body<S, I, O>>;
