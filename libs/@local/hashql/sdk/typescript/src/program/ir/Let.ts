import { Result } from "effect";

import * as Ident from "../../jexpr/Ident.js";
import * as Binding from "../ast/Binding.js";
import { Let as AstLet } from "../ast/Let.js";
import * as Expression from "../Expression.js";
import * as Node from "./Node.js";
import * as Scope from "./Scope.js";

import type * as Type from "../../type/index.js";
import type { Utilities } from "../Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

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
