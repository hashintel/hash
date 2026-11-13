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
import type * as Referential from "./referential.js";
import type { Result } from "effect";

/** The key of the rebinding function a producer attaches to each of its handles. */
export const Relocate: unique symbol = Symbol("~hashql/Relocate");

/** The ids of the bindings one name has, one per universe, such as an import's local name. */
export type Bound = {
  readonly [U in Referential.Universe]?: Referential.ReferenceId<U>;
};

/**
 * Returns the id a handle at `path` keeps: the binding its first segment resolves to.
 *
 * A one-segment path is the handle's own name, so it resolves in the handle's universe. A longer path resolves its first segment among modules.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- reads the id a path's first segment names
export const head = (
  path: JExpr.Path.Path,
  universe: Referential.Universe,
  bound: Bound | undefined,
): Referential.ReferenceId | undefined => {
  if (path.segments.length > 1) {
    return bound?.module;
  }

  return bound?.[universe];
};

/**
 * A handle that can be rebound to another HashQL path.
 *
 * Rebinding returns a handle of type `E` that emits the new path, or a construction failure. An import also passes the ids of its local name's bindings. The handle keeps the one its path resolves through, so `AST.resolveReferences` can check that the name still means that binding wherever the program uses the handle.
 */
export interface Relocatable<E> {
  readonly [Relocate]: (
    path: JExpr.Path.Path,
    bound?: Bound,
  ) => Result.Result<E, ProgramError.Construction>;
}

/** Rebinds a handle with the function its producer attached. It accepts the handle first or last. */
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
