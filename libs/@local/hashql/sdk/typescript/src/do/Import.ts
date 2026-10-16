/**
 * Lexical imports into a sequential Do scope.
 *
 * @module
 */
import { Result, pipe } from "effect";

import * as Imports from "../Program/Import.js";
import * as Scope from "../Program/Scope.js";
import * as Node from "./Node.js";

import type * as Inputs from "../Program/Inputs.js";
import type * as Module from "../Program/Module.js";
import type { Utilities } from "./Utilities.js";

export type { Imported, Selection } from "../Program/Import.js";

/**
 * Imports a module's exports as a Do block step.
 *
 * When a block elaborates the step, it calls `select` with the utilities and the modules visible at that point, then emits a HashQL `use` of the returned module around everything after this step. Each selected export enters every environment that declares it, under its local name: modules join the modules environment and `$.ref`, types join the types and values join the values. The imported handles are local names that keep their declared semantic types and call signatures.
 *
 * Omitting `selection` imports every export. Given a name array, the step imports those exports. Given an alias record, it imports each listed export under a new name, where `"_"` keeps the export's own name. Invalid HashQL identifiers as aliases, and symbol keys in the record, fail construction with `InvalidImportName`, and the block then skips its remaining callbacks.
 */
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
