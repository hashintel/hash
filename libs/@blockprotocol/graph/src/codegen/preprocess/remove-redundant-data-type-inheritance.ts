import { typedValues } from "../../util/typed-entries.js";

import type { PreprocessContext } from "../context.js";
import type { VersionedUrl } from "@blockprotocol/type-system";

const valueDataTypeId: VersionedUrl =
  "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1";

/**
 * Checks if a data type schema has an enum constraint.
 *
 * Data types with enum constraints specify exact literal values, making
 * parent type references redundant for TypeScript generation purposes.
 */
const hasEnumConstraint = (dataType: object): boolean => {
  return "enum" in dataType && Array.isArray(dataType.enum);
};

const getParentIds = (dataType: object): VersionedUrl[] => {
  if (!("allOf" in dataType) || !Array.isArray(dataType.allOf)) {
    return [];
  }

  return dataType.allOf.flatMap((parent: unknown) =>
    typeof parent === "object" &&
    parent !== null &&
    "$ref" in parent &&
    typeof parent.$ref === "string"
      ? [parent.$ref as VersionedUrl]
      : [],
  );
};

const getPrimitiveType = (dataType: object): string | undefined =>
  "type" in dataType && typeof dataType.type === "string"
    ? dataType.type
    : undefined;

/**
 * Removes inheritance information from data types where it would only produce
 * redundant TypeScript, e.g. `TextDataType & string` or `ValueDataType & boolean`.
 *
 * json-schema-to-typescript intersects a data type's `allOf` parents with its own
 * `type`, so:
 * - data types with enum constraints have their `allOf` removed, as the enum values
 *   already fully describe the valid value space, producing `"Value1" | "Value2"`
 * - data types whose only parent is `Value` have their `allOf` removed, as `Value` is
 *   the root of the data type hierarchy and wider than any child, producing e.g. `string`
 * - data types whose parents all share the same primitive `type` have their own `type`
 *   removed, as the parent already constrains it, producing e.g. `URIDataType = TextDataType`
 *
 * This transformation only affects TypeScript generation – the original
 * semantic inheritance relationship is preserved in the type system.
 */
export const removeRedundantDataTypeInheritance = (
  context: PreprocessContext,
) => {
  context.logDebug("Removing redundant inheritance from data types");

  const primitiveTypeById = new Map(
    typedValues(context.dataTypes).map((dataType) => [
      dataType.$id,
      getPrimitiveType(dataType),
    ]),
  );

  for (const dataType of typedValues(context.dataTypes)) {
    const parentIds = getParentIds(dataType);

    if (parentIds.length === 0) {
      continue;
    }

    if (
      hasEnumConstraint(dataType) ||
      parentIds.every((parentId) => parentId === valueDataTypeId)
    ) {
      context.logTrace(
        `Removing allOf from ${dataType.$id} as it adds nothing to the generated type`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- intentionally modifying the schema
      delete (dataType as any).allOf;
      continue;
    }

    const primitiveType = primitiveTypeById.get(dataType.$id);

    if (
      primitiveType !== undefined &&
      parentIds.every(
        (parentId) => primitiveTypeById.get(parentId) === primitiveType,
      )
    ) {
      context.logTrace(
        `Removing type from ${dataType.$id} as its parents already constrain it to ${primitiveType}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- intentionally modifying the schema
      delete (dataType as any).type;
    }
  }
};
