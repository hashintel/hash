import { typedValues } from "../../util/typed-entries.js";
import type { PreprocessContext } from "../context.js";

/**
 * Checks if a data type schema has an enum constraint.
 *
 * Data types with enum constraints specify exact literal values, making
 * parent type references redundant for TypeScript generation purposes.
 */
const hasEnumConstraint = (dataType: object): boolean => {
  return "enum" in dataType && Array.isArray(dataType.enum);
};

/**
 * Removes the `allOf` field from data types that have enum constraints.
 *
 * When a data type inherits from a parent type (via `allOf`) but also specifies
 * an `enum` constraint, the json-schema-to-typescript library generates an
 * intersection type like `TextDataType & ("Value1" | "Value2")`.
 *
 * Since the enum values already fully describe the valid value space (and are
 * implicitly compatible with the parent type), we can remove the `allOf` to
 * produce cleaner TypeScript like `"Value1" | "Value2"`.
 *
 * This transformation only affects TypeScript generation – the original
 * semantic inheritance relationship is preserved in the type system.
 */
export const removeRedundantDataTypeInheritance = (
  context: PreprocessContext,
) => {
  context.logDebug(
    "Removing redundant inheritance from data types with enum constraints",
  );

  for (const dataType of typedValues(context.dataTypes)) {
    if (hasEnumConstraint(dataType) && "allOf" in dataType) {
      context.logTrace(
        `Removing allOf from ${dataType.$id} as it has enum constraints`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- intentionally modifying the schema
      delete (dataType as any).allOf;
    }
  }
};
