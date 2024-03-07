import { typedEntries } from "../../shared/util/typed-object-iter.js";
import { CompileContext } from "../context/compile.js";
import { CompiledTsType } from "../shared.js";

const replaceInterfaceWithTypeInCompiledTsType = (
  compiledTsType: CompiledTsType,
): CompiledTsType =>
  // Find all occurrences of `interface (someName) =` and replace it with `type $1 =`
  compiledTsType.replace(/interface ([a-zA-Z0-9]+)/gm, "type $1 =");

/**
 * We want to be able to use generated types as generics within `Entity<Properties>` for example, so we make
 * everything consistently a `type` instead of an `interface`.
 *
 * This should be safe as:
 *   - `json-schema-to-typescript` generates each individual component as its own type so it doesn't create any
 *     `extends` clauses, it uses `type` when combining them, e.g. `Person = Person1 & Person2`
 *   - we aren't using `json-schema-to-typescript`'s formatting features, so we don't need to worry about replacing
 *     commas with semi-colons, etc. We'll call a formatter at the end of processing
 */
export const replaceInterfaceWithType = (context: CompileContext): void => {
  context.logDebug("Replacing `interface` with `type`");

  for (const [typeId, compiledTsType] of typedEntries(
    context.typeIdsToCompiledTypes,
  )) {
    context.typeIdsToCompiledTypes[typeId] =
      replaceInterfaceWithTypeInCompiledTsType(compiledTsType);
  }
};
