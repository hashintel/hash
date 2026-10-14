/**
 * Authors typed expressions with ordered declaration steps and scoped callbacks.
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

export interface Context<S extends Scope.Scope> {
  readonly Do: Block<S>;
  readonly Let: typeof Let;
  readonly Type: typeof Type;
  readonly Newtype: typeof Newtype;
  readonly Import: typeof Import;
}

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

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- composes ordered steps and a final expression callback
export const Do: Block<Scope.Empty> = context.Do;
