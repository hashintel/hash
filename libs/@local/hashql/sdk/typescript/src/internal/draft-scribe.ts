/**
 * Nominal construction helpers used by the draft scribe.
 *
 * @module
 */
import { Result, pipe } from "effect";

import * as AST from "../Program/AST/index.js";
import * as Expression from "../Program/Expression.js";
import * as StructuralSyntax from "./structural.js";

import type * as Context from "../Draft/Context.js";
import type * as Inputs from "../Program/Inputs.js";
import type * as Structural from "../Program/Structural.js";
import type * as Type from "../Type.js";
import type * as Referential from "./referential.js";

/** A newtype's binding and the id of its constructor. */
export interface NominalBinding {
  readonly binding: AST.Binding.Type;
  readonly valueReference: Referential.ReferenceId<"value">;
}

/** Adds structural argument normalization without losing the nominal identity on relocation.
 *
 * @internal
 */
export const nominalValue = <N extends string, T extends Type.Any>(
  expression: Expression.Expression<
    Type.Function<readonly [T], Type.Opaque<N, T>>,
    Inputs.Empty
  >,
): Context.NominalValue<N, T> =>
  Expression.adaptCallable(
    expression,
    (self): Context.NominalCall<N, T> =>
      <const V extends Structural.Value<T> & Structural.Value.Any>(
        value: Structural.Value.Exact<T, V>,
      ): Expression.Expression<
        Type.Opaque<N, T>,
        Structural.Value.Requirements<V>
      > =>
        pipe(
          {
            callee: Expression.toNode(self),
            argument: pipe(
              value,
              StructuralSyntax.valueNode,
              Result.flatMap(AST.validate),
            ),
          },
          Result.all,
          Result.map(
            ({ callee, argument }) => new AST.Call(callee, [argument]),
          ),
          Expression.fromResult<
            Type.Opaque<N, T>,
            Structural.Value.Requirements<V>
          >,
        ),
  );
