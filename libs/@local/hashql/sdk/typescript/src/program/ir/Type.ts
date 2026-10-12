import { Result } from "effect";

import * as Binding from "../ast/Binding.js";
import { Type as AstType } from "../ast/Type.js";
import * as TypeExpression from "../TypeExpression.js";
import * as Node from "./Node.js";
import * as Scope from "./Scope.js";

import type * as Semantic from "../../type/index.js";
import type { Empty } from "../Inputs.js";
import type { Utilities } from "../Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

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
