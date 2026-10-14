/**
 * Shared completed programs and their J-Expr serialization.
 *
 * @module
 */
import { Result } from "effect";

import * as JExpr from "../jexpr/index.js";
import * as Expression from "./Expression.js";

import type * as Type from "../type/index.js";
import type * as ProgramError from "./ProgramError.js";

export interface Program<T extends Type.Any, Requirements> {
  readonly root: Expression.Expression<T, Requirements>;
}

export type Inputs<P> = P extends { readonly root: infer Root }
  ? Expression.Inputs<Root>
  : never;

export const program = <T extends Type.Any, Inputs>(
  root: Expression.Expression<T, Inputs>,
): Program<T, Inputs> => Object.freeze({ root });

export const compile = <T extends Type.Any, Inputs>(
  self: Program<T, Inputs>,
): Result.Result<string, ProgramError.Construction> =>
  Result.map(Expression.toJExpr(self.root), JExpr.compile);
