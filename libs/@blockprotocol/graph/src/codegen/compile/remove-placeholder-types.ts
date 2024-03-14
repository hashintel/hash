import { typedEntries } from "../../shared/util/typed-object-iter.js";
import type { CompileContext } from "../context/compile.js";
import type { CompiledTsType } from "../shared.js";
import { redundantTypePlaceholder } from "../shared.js";

const removePlaceholderDefinitionInCompiledTsType = (
  compiledTsType: CompiledTsType,
): CompiledTsType =>
  compiledTsType.replace(
    new RegExp(`^.* = "${redundantTypePlaceholder}"$`, "gm"),
    "",
  );

/** Remove the "PLACEHOLDER" definitions left by the workaround of the `$ref` resolver in `compile` */
export const removePlaceholderTypes = (context: CompileContext): void => {
  context.logDebug("Removing placeholder types");

  for (const [typeId, compiledTsType] of typedEntries(
    context.typeIdsToCompiledTypes,
  )) {
    context.typeIdsToCompiledTypes[typeId] =
      removePlaceholderDefinitionInCompiledTsType(compiledTsType);
  }
};
