/**
 * Lexical imports into a sequential Do scope.
 *
 * @module
 */
import { Result, pipe } from "effect";

import * as Imports from "../program/Import.js";
import * as Scope from "../program/Scope.js";
import * as Node from "./Node.js";

import type * as Inputs from "../program/Inputs.js";
import type * as Module from "../program/Module.js";
import type { Utilities } from "./Utilities.js";

export type { Imported, Selection } from "../program/Import.js";

/** Imports selected module exports into their respective universes. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- the selector and selection construct a declaration step
export function Import<S extends Scope.Scope, M extends Module.Any>(
  select: (
    utilities: Utilities<S>,
    modules: S["modules"],
  ) => M & Imports.Rebindable<M>,
): Node.Node<S, Scope.Merge<S, Imports.Imported<M, "*">>, Inputs.Empty>;
export function Import<
  S extends Scope.Scope,
  M extends Module.Any,
  const I extends Imports.Selection<M>,
>(
  select: (
    utilities: Utilities<S>,
    modules: S["modules"],
  ) => M & Imports.Rebindable<M>,
  selection: I,
): Node.Node<S, Scope.Merge<S, Imports.Imported<M, I>>, Inputs.Empty>;
export function Import<S extends Scope.Scope>(
  select: (utilities: Utilities<S>, modules: S["modules"]) => Module.Any,
  // oxlint-disable-next-line hash/prefer-options-object -- the optional argument is the import selection itself
  selection: Imports.Selection<Module.Any> = "*",
): Node.Any {
  return Node.make((utilities: Utilities<S>, scope: S) =>
    pipe(
      Imports.bind(select(utilities, scope.modules), selection),
      Result.map((declaration) => ({
        scope: Scope.merge(scope, declaration.scope),
        wrap: declaration.wrap,
      })),
    ),
  );
}
