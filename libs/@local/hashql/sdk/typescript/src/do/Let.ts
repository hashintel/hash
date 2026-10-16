import { Result } from "effect";

import * as Ident from "../JExpr/Ident.js";
import * as Binding from "../Program/AST/Binding.js";
import { Let as AstLet } from "../Program/AST/Let.js";
import * as Expression from "../Program/Expression.js";
import * as Scope from "../Program/Scope.js";
import * as Node from "./Node.js";

import type * as Type from "../Type/index.js";
import type { Utilities } from "./Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

/**
 * Declares a value binding as a Do block step.
 *
 * When a block elaborates the step, it calls `initializer` with the utilities, values and types visible at that point. The block emits a HashQL `let` that binds `name` to the initializer around everything after this step. Later steps see `name` in their values environment as a reference with the initializer's semantic type and input requirements. A later binding with the same name shadows this one in the values environment only.
 *
 * The block emits the binding even when nothing refers to it, so its initializer's inputs stay in the program. Names that need quoting, such as `%`, appear quoted in the output. An invalid HashQL identifier fails construction with `InvalidBindingName` after the initializer has run, and the block skips its remaining callbacks.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a declaration step
export const Let = <
  In extends Scope.Scope,
  const Name extends string,
  T extends Type.Any,
  Inputs,
>(
  name: Name,
  initializer: (
    utilities: Utilities<In>,
    values: In["values"],
    types: In["types"],
  ) => Expression.Expression<T, Inputs>,
): Node.Node<
  In,
  Scope.Merge<
    In,
    { values: ReadonlyRecord<Name, Expression.Expression<T, Inputs>> }
  >,
  Inputs
> =>
  Node.make((utilities, scope) =>
    Result.gen(function* () {
      const value = yield* Expression.toNode(
        initializer(utilities, scope.values, scope.types),
      );
      const binding = yield* Binding.make(name, value);
      const reference = Expression.fromJExpr<T, Inputs>(
        Ident.compile(binding.name),
      );

      // SAFETY: the sole key is the literal name supplied by the caller.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a computed property widens its key to string
      const values = { [name]: reference } as ReadonlyRecord<
        Name,
        Expression.Expression<T, Inputs>
      >;

      return {
        scope: Scope.merge(scope, { values }),
        wrap: (child) => new AstLet(binding, child),
      };
    }),
  );
