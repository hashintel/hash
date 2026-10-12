/**
 * Builds typed programs with separate module, value and type environments.
 *
 * Construction evaluates the step callbacks once. The resulting syntax tree owns its children and compiles without an authoring environment.
 *
 * @module
 */
import { Result } from "effect";

import * as JExpr from "../jexpr/index.js";
import * as Expression from "./Expression.js";
import * as IR from "./ir/index.js";
import { Block as Builder } from "./Utilities.js";

import type * as Type from "../type/index.js";
import type { Do as Block } from "./Do.js";
import type * as ProgramError from "./ProgramError.js";
import type { BuildStep } from "./Utilities.js";

export { assume, ifElse as If } from "./Expression.js";
export { Import } from "./ir/Import.js";
export { Let } from "./ir/Let.js";
export { Newtype } from "./ir/Newtype.js";
export { Type } from "./ir/Type.js";
export type { Utilities } from "./Utilities.js";

export interface Program<T extends Type.Any, Requirements> {
  readonly root: Expression.Expression<T, Requirements>;
}

export type Inputs<P> = P extends { readonly root: infer Root }
  ? Expression.Inputs<Root>
  : never;

export interface Context<S extends IR.Scope.Scope> {
  readonly Do: Block<S>;
  readonly Let: typeof IR.Let;
  readonly Type: typeof IR.Type;
  readonly Newtype: typeof IR.Newtype;
  readonly Import: typeof IR.Import;
}

export const withPrelude = <const Prelude extends IR.Scope.Definition>(
  prelude: Prelude,
): Context<IR.Scope.From<Prelude>> => {
  // SAFETY: the empty scope contributes no names to any namespace.
  const initial = IR.Scope.merge(
    IR.Scope.empty,
    prelude,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- merging into empty retains precisely the supplied namespace types
  ) as IR.Scope.From<Prelude>;

  const construct = (
    ...steps: readonly BuildStep[]
  ): Result.Result<Expression.Any, ProgramError.Construction> =>
    Builder.build(initial, steps);

  // oxlint-disable-next-line typescript/no-restricted-types -- this is the heterogeneous driver boundary
  const erased: unknown = construct;

  // SAFETY: the overloads check every transition before this driver erases its scope parameters.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- restores the per-step scopes checked by the overloads
  const Do = erased as Block<IR.Scope.From<Prelude>>;
  return Object.freeze({
    Do,
    Let: IR.Let,
    Type: IR.Type,
    Newtype: IR.Newtype,
    Import: IR.Import,
  });
};

const context: Context<IR.Scope.Empty> = withPrelude({});

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- composes ordered steps and a final expression callback
export const Do: Block<IR.Scope.Empty> = context.Do;

export const program = <T extends Type.Any, Inputs>(
  root: Expression.Expression<T, Inputs>,
): Program<T, Inputs> => Object.freeze({ root });

export const compile = <T extends Type.Any, Inputs>(
  self: Program<T, Inputs>,
): Result.Result<string, ProgramError.Construction> =>
  Result.map(Expression.toJExpr(self.root), JExpr.compile);
