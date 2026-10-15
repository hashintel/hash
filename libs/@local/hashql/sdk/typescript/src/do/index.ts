/**
 * Authors typed HashQL expressions as blocks of ordered declaration steps.
 *
 * A block lists declaration steps and ends with a body callback. {@link Let}, {@link Type}, {@link Newtype} and {@link Import} construct the steps, and {@link Do} runs them in order. Each step's callback sees the modules, values and types that earlier steps introduced, and each step emits a declaration around the rest of the block. The result is a construction `Result` holding the block's expression, whose input requirements TypeScript infers from every step and the body. Callbacks construct syntax and never execute a query.
 *
 * {@link withPrelude} seeds a block's environments with existing declarations, such as modules from `Module.define`. Every callback's `$` argument, described by `Utilities`, holds expression constructors, conditionals, queries and nested blocks. Draft, at `@local/hashql/draft`, builds the same expressions from one callback and an explicit input schema.
 *
 * @example <caption>Import a function and bind its result.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Module, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Import, Let, withPrelude } from "@local/hashql/do";
 * import { Result } from "effect";
 *
 * type Add = Type.Function<
 *   readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
 *   Type.PrimitiveInteger
 * >;
 * const math = Result.getOrThrow(
 *   Module.define("::core::math", { values: { add: Module.value<Add>() } }),
 * );
 * const { Do } = withPrelude({ modules: { math } });
 *
 * const total = Do(
 *   Import((_, { math }) => math, ["add"]),
 *   Let("total", (_, { add }) => add(1n, 2n)),
 *   (_, { total }) => total,
 * );
 * assert.equal(
 *   Result.getOrThrow(Result.flatMap(total, (root) => Program.compile(Program.program(root)))),
 *   '["::kernel::special_form::use","::core::math",{"#tuple":["add"]},["::kernel::special_form::let","total",["add",{"#literal":1},{"#literal":2}],"total"]]',
 * );
 * ```
 *
 * @module
 */

import * as Scope from "../program/Scope.js";
import { Import } from "./Import.js";
import { Let } from "./Let.js";
import { Newtype } from "./Newtype.js";
import { Type } from "./Type.js";
import { Block as Builder } from "./Utilities.js";

import type * as Expression from "../program/Expression.js";
import type * as ProgramError from "../program/ProgramError.js";
import type { Do as Block } from "./Do.js";
import type { BuildStep } from "./Utilities.js";
import type { Result } from "effect";

export { Import } from "./Import.js";
export { Let } from "./Let.js";
export { Newtype } from "./Newtype.js";
export { Type } from "./Type.js";
export type { Utilities } from "./Utilities.js";

/**
 * The constructors {@link withPrelude} returns for one prelude.
 *
 * Only `Do` depends on the prelude. `Let`, `Type`, `Newtype` and `Import` are this module's step constructors, returned unchanged so that one destructuring supplies the whole vocabulary.
 */
export interface Context<S extends Scope.Scope> {
  /** Constructs blocks that start in the scope the prelude seeded. */
  readonly Do: Block<S>;
  readonly Let: typeof Let;
  readonly Type: typeof Type;
  readonly Newtype: typeof Newtype;
  readonly Import: typeof Import;
}

/**
 * Binds {@link Do} to a prelude of existing module, value and type declarations.
 *
 * The prelude's optional `modules`, `values` and `types` records seed every block's environments. Step callbacks and bodies receive those environments as arguments, and `$.ref` holds the modules. A module from `Module.define` is itself a valid prelude. Seeding emits no HashQL, because a prelude export already refers to its declaration, typically by absolute path. The returned `Do` includes nothing from `Prelude.builtin` unless the prelude supplies it.
 *
 * `withPrelude` copies the records' own string-keyed exports when you call it, so later additions or replacements in them do not reach the returned `Do`.
 */
export const withPrelude = <const Prelude extends Scope.Definition>(
  prelude: Prelude,
): Context<Scope.From<Prelude>> => {
  // SAFETY: the empty scope contributes no names to any namespace.
  const initial = Scope.merge(
    Scope.empty,
    prelude,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- merging into empty retains precisely the supplied namespace types
  ) as Scope.From<Prelude>;

  const construct = (
    ...steps: readonly BuildStep[]
  ): Result.Result<Expression.Any, ProgramError.Construction> =>
    Builder.build(initial, steps);

  // oxlint-disable-next-line typescript/no-restricted-types -- this is the heterogeneous driver boundary
  const erased: unknown = construct;

  // SAFETY: the overloads check every transition before this driver erases its scope parameters.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- restores the per-step scopes checked by the overloads
  const Do = erased as Block<Scope.From<Prelude>>;
  return Object.freeze({
    Do,
    Let,
    Type,
    Newtype,
    Import,
  });
};

const context: Context<Scope.Empty> = withPrelude({});

/**
 * Constructs an expression from ordered declaration steps and a final body, starting with empty environments.
 *
 * `Do(step1, ..., stepN, body)` runs synchronously. It elaborates each step in argument order, running the step's callback with the scope the earlier steps produced, then runs `body` with the final scope. Nested blocks, conditionals and query predicates inside those callbacks also run during the call, and `$.if` runs both of its branch callbacks. The returned expression nests the declarations in step order around the body's expression. Its input requirements combine every step's with the body's, including the requirements of bindings that nothing refers to.
 *
 * `Do` returns construction failures rather than throwing them. The first failing step stops construction, so later callbacks and the body do not run. An exception thrown by a callback becomes a failure whose reason is `CallbackException`, with the thrown value as the cause of its `Cause.UnknownError`. Arguments that TypeScript rejects fail at runtime with `MissingBlockBody` when the last argument is not a callback, `MisplacedBlockBody` when an earlier argument is a callback and `InvalidBlockStep` for another value in a step position. A body that returns anything other than an expression handle fails with `InvalidBodyResult`.
 *
 * Use {@link withPrelude} to start blocks with declarations in scope. The positional form accepts up to eight steps. Continue in a nested block, started from a callback's `$`, for more.
 *
 * @example <caption>Observe callback order after a failed step.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Do, Let } from "@local/hashql/do";
 * import { Result } from "effect";
 *
 * const calls: string[] = [];
 * const result = Do(
 *   Let("not a name", ($) => {
 *     calls.push("first");
 *     return $.integer(1);
 *   }),
 *   Let("later", ($) => {
 *     calls.push("later");
 *     return $.integer(2);
 *   }),
 *   (_, { later }) => later,
 * );
 * assert.deepEqual(calls, ["first"]);
 * assert.ok(Result.isFailure(result));
 * assert.equal(result.failure.reason._tag, "InvalidBindingName");
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- composes ordered steps and a final expression callback
export const Do: Block<Scope.Empty> = context.Do;
