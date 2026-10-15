// oxlint-disable import/max-dependencies -- nominal declarations introduce both a type and a value constructor
import { Result } from "effect";

import * as Ident from "../../jexpr/Ident.js";
import * as Binding from "../ast/Binding.js";
import { Newtype as AstNewtype } from "../ast/Newtype.js";
import * as Expression from "../Expression.js";
import * as TypeExpression from "../TypeExpression.js";
import * as Node from "./Node.js";
import * as Scope from "./Scope.js";

import type * as Type from "../../type/index.js";
import type * as Inputs from "../Inputs.js";
import type { Utilities } from "../Utilities.js";
import type { ReadonlyRecord } from "effect/Record";

export interface Exports<
  Name extends string,
  Identity extends symbol,
  T extends Type.Any,
> {
  readonly types: ReadonlyRecord<
    Name,
    TypeExpression.TypeExpression<Type.Opaque<Identity, T>>
  >;
  readonly values: ReadonlyRecord<
    Name,
    Expression.Expression<
      Type.Function<readonly [T], Type.Opaque<Identity, T>>,
      Inputs.Empty
    >
  >;
}

/** The unique symbol distinguishes declarations even when their query names coincide. */
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
