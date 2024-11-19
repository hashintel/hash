import type { DataType, VersionedUrl } from "@blockprotocol/type-system-rs";

export const DATA_TYPE_META_SCHEMA: DataType["$schema"] =
  "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";

/**
 * Returns all the IDs of all types referenced in a given data type.
 *
 * @param {DataType} dataType
 */
export const getReferencedIdsFromDataType = (
  dataType: DataType,
): {
  inheritsFromDataTypes: VersionedUrl[];
} => {
  const inheritsFromDataTypes: VersionedUrl[] = [];

  for (const inheritedEntityType of dataType.allOf ?? []) {
    inheritsFromDataTypes.push(inheritedEntityType.$ref);
  }

  return {
    inheritsFromDataTypes: [...inheritsFromDataTypes],
  };
};
