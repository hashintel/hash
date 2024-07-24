import { typedEntries } from "../../util/typed-object-iter.js";
import type { CompileContext } from "../context/compile.js";
import type { CompiledTsType } from "../shared.js";

const makeInterfacesExtendBase = (
  compiledTsType: CompiledTsType,
): CompiledTsType => {
  let fileWithReplacements = compiledTsType;

  /**
   * We don't need to worry about interfaces that are generated as extending other interfaces,
   * e.g. DocumentProperties extends DocumentProperties1, DocumentProperties2 {}
   * because in these cases there will be some other parent (e.g. DocumentProperties1 extends PageProperties {}),
   * and so there will always be a base interface at the top of the chain.
   */
  const regExpXProperties = /export\s+interface\s+(\w+Properties)\s*{/g;
  const replacementXProperties = "export interface $1 extends PropertyObject {";

  fileWithReplacements = fileWithReplacements.replace(
    regExpXProperties,
    replacementXProperties,
  );

  const regExpXWithMetadataValue =
    /export\s+interface\s+(\w+WithMetadataValue)\s*{/g;
  const replacementXWithMetadataValue =
    "export interface $1 extends PropertyObjectValueMetadata {";

  fileWithReplacements = fileWithReplacements.replace(
    regExpXWithMetadataValue,
    replacementXWithMetadataValue,
  );

  return fileWithReplacements;
};

/**
 * We need our XProperties and XWithMetadataValue interfaces to extend the corresponding base interfaces,
 * for compatibility with the hash-graph-sdk function signatures.
 *
 * This should happen after types have been rewritten to interfaces.
 */
export const makeInterfacesExtendBaseInterfaces = (
  context: CompileContext,
): void => {
  context.logDebug(
    "Making XProperties and XPropertiesWithMetadataValue extend base interfaces",
  );

  for (const [typeId, compiledTsType] of typedEntries(
    context.typeIdsToCompiledTypes,
  )) {
    context.typeIdsToCompiledTypes[typeId] =
      makeInterfacesExtendBase(compiledTsType);
  }
};
