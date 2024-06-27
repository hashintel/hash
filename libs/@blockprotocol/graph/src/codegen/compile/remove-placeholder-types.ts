import { typedEntries } from "../../util/typed-object-iter";
import type { CompileContext } from "../context/compile";
import type { CompiledTsType } from "../shared";
import { redundantTypePlaceholder } from "../shared";

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
