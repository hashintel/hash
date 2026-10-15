// oxlint-disable import/max-dependencies -- nominal declarations introduce both a type and a value constructor
import { Result } from "effect";

import * as Ident from "../jexpr/Ident.js";
import * as Binding from "../program/ast/Binding.js";
import { Newtype as AstNewtype } from "../program/ast/Newtype.js";
import * as Expression from "../program/Expression.js";
import * as Scope from "../program/Scope.js";
import * as TypeExpression from "../program/TypeExpression.js";
import * as Node from "./Node.js";

import type * as Inputs from "../program/Inputs.js";
import type * as Type from "../type/index.js";
import type { Utilities } from "./Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

/** The names a `Newtype` step adds: the nominal type and its constructor, both under the declared name. */
export interface Exports<
  Name extends string,
  Identity extends symbol,
  T extends Type.Any,
> {
  /** The nominal type, an opaque type over `T` distinguished by `Identity`. */
  readonly types: ReadonlyRecord<
    Name,
    TypeExpression.TypeExpression<Type.Opaque<Identity, T>>
  >;
  /** The constructor, a function from the underlying type `T` to the nominal type. */
  readonly values: ReadonlyRecord<
    Name,
    Expression.Expression<
      Type.Function<readonly [T], Type.Opaque<Identity, T>>,
      Inputs.Empty
    >
  >;
}

/**
 * Declares a nominal type and its constructor as a Do block step.
 *
 * When a block elaborates the step, it calls `definition` with the utilities and the types visible at that point, then emits a HashQL `newtype` declaration around everything after this step. Later steps see `name` in two environments: as the opaque type `Type.Opaque<Identity, T>` among their types, and as its constructor among their values. The constructor takes a value of the underlying type `T` and emits a call to `name`. A value of the nominal type does not convert back to `T` implicitly.
 *
 * `identity` must have a `unique symbol` type. It exists only for TypeScript and is never emitted: two declarations with the same name but different symbols produce incompatible types, and a symbol widened to `symbol` is a type error. A name that is not a valid HashQL identifier fails construction with `InvalidBindingName`, and the block skips its remaining callbacks.
 *
 * @example <caption>Declare a nominal identifier and construct a value.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Module, Program } from "@local/hashql";
 * import type { Type } from "@local/hashql";
 * import { Import, Let, Newtype, withPrelude } from "@local/hashql/do";
 * import { Result } from "effect";
 *
 * const kernel = Result.getOrThrow(
 *   Module.define("::kernel::type", {
 *     types: { Integer: Module.type<Type.PrimitiveInteger>() },
 *   }),
 * );
 * const userId: unique symbol = Symbol("UserId");
 * const { Do } = withPrelude({ modules: { kernel } });
 *
 * const owner = Do(
 *   Import((_, { kernel }) => kernel, ["Integer"]),
 *   Newtype("UserId", userId, (_, { Integer }) => Integer),
 *   Let("owner", (_, { UserId }) => UserId(1n)),
 *   (_, { owner }) => owner,
 * );
 * assert.equal(
 *   Result.getOrThrow(Result.flatMap(owner, (root) => Program.compile(Program.program(root)))),
 *   '["::kernel::special_form::use","::kernel::type",{"#tuple":["Integer"]},["::kernel::special_form::newtype","UserId","Integer",["::kernel::special_form::let","owner",["UserId",{"#literal":1}],"owner"]]]',
 * );
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a nominal declaration step
export const Newtype = <
  In extends Scope.Scope,
  const Name extends string,
  const Identity extends symbol,
  T extends Type.Any,
>(
  name: Name,
  _identity: Identity & (symbol extends Identity ? never : Identity),
  definition: (
    utilities: Utilities<In>,
    types: In["types"],
  ) => TypeExpression.TypeExpression<T>,
): Node.Node<In, Scope.Merge<In, Exports<Name, Identity, T>>, Inputs.Empty> =>
  Node.make((utilities, scope) =>
    Result.gen(function* () {
      const binding = yield* Binding.make(
        name,
        yield* TypeExpression.toType(definition(utilities, scope.types)),
      );
      const reference = TypeExpression.reference<Type.Opaque<Identity, T>>({
        rooted: false,
        segments: [binding.name],
      });

      const constructor = Expression.fromJExpr<
        Type.Function<readonly [T], Type.Opaque<Identity, T>>,
        Inputs.Empty
      >(Ident.compile(binding.name));

      const entries = {
        types: { [name]: reference },
        values: { [name]: constructor },
      };

      // SAFETY: both universes bind the same name, with the nominal type and its constructor respectively.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- computed properties widen their keys to string
      const exports = entries as Exports<Name, Identity, T>;
      return {
        scope: Scope.merge(scope, exports),
        wrap: (child) => new AstNewtype(binding, child),
      };
    }),
  );
