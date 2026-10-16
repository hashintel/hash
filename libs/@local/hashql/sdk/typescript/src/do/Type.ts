import { Result } from "effect";

import * as Binding from "../Program/AST/Binding.js";
import { Type as AstType } from "../Program/AST/Type.js";
import * as Scope from "../Program/Scope.js";
import * as TypeExpression from "../Program/TypeExpression.js";
import * as Node from "./Node.js";

import type { Empty } from "../Program/Inputs.js";
import type * as Semantic from "../Type/index.js";
import type { Utilities } from "./Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

/**
 * Declares a type alias as a Do block step.
 *
 * When a block elaborates the step, it calls `definition` with the utilities and the types visible at that point. The block emits a HashQL `type` declaration around everything after this step. Later steps see `name` in their types environment as a reference to the alias, carrying the definition's semantic type, so TypeScript treats the alias as that type. Use `Newtype` for a distinct nominal type. A value or module with the same name stays visible.
 *
 * A name that is not a valid HashQL identifier fails construction with `InvalidBindingName`, and the block skips its remaining callbacks.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- constructs a type declaration step
export const Type = <
  In extends Scope.Scope,
  const Name extends string,
  T extends Semantic.Any,
>(
  name: Name,
  definition: (
    utilities: Utilities<In>,
    types: In["types"],
  ) => TypeExpression.TypeExpression<T>,
): Node.Node<
  In,
  Scope.Merge<
    In,
    { types: ReadonlyRecord<Name, TypeExpression.TypeExpression<T>> }
  >,
  Empty
> =>
  Node.make((utilities, scope) =>
    Result.gen(function* () {
      const binding = yield* Binding.make(
        name,
        yield* TypeExpression.toType(definition(utilities, scope.types)),
      );

      const reference = TypeExpression.reference<T>({
        rooted: false,
        segments: [binding.name],
      });

      // SAFETY: the sole key is the literal name supplied by the caller.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a computed property widens its key to string
      const types = { [name]: reference } as ReadonlyRecord<
        Name,
        TypeExpression.TypeExpression<T>
      >;

      return {
        scope: Scope.merge(scope, { types }),
        wrap: (child) => new AstType(binding, child),
      };
    }),
  );
