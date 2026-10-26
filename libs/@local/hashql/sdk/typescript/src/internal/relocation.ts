/**
 * Typed rebinding of handles to another HashQL path.
 *
 * Each producer retains its own rebinding function while its semantic parameters are in scope. Consumers can then move a handle without reconstructing those parameters from an erased export. The result type names the capabilities the producer preserves, rather than promising to retain arbitrary properties added by a caller.
 *
 * @module
 */
import { dual } from "effect/Function";

import type * as JExpr from "../JExpr/index.js";
import type * as ProgramError from "../Program/ProgramError.js";
import type { Result } from "effect";

export const Relocate: unique symbol = Symbol("~hashql/Relocate");

export interface Relocatable<E> {
  readonly [Relocate]: (
    path: JExpr.Path.Path,
  ) => Result.Result<E, ProgramError.Construction>;
}

export const relocate: {
  (
    path: JExpr.Path.Path,
  ): <E>(self: Relocatable<E>) => Result.Result<E, ProgramError.Construction>;
  <E>(
    self: Relocatable<E>,
    path: JExpr.Path.Path,
  ): Result.Result<E, ProgramError.Construction>;
} = dual(
  2,
  <E>(
    self: Relocatable<E>,
    path: JExpr.Path.Path,
  ): Result.Result<E, ProgramError.Construction> => self[Relocate](path),
);
