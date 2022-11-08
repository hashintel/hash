import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@hashintel/subgraph/src/types";
import {
  BaseUri,
  extractVersion,
  VersionedUri,
} from "@blockprotocol/type-system-node";
import { getPropertyTypesByBaseUri } from "@hashintel/subgraph/src/element/property-type";

export const getAllEditionsOfAType = (
  subgraph: Subgraph,
  propertyTypeBaseUri: BaseUri,
): Record<
  number,
  DataTypeWithMetadata | PropertyTypeWithMetadata | EntityTypeWithMetadata
> => {
  const dataTypes = getPropertyTypesByBaseUri(subgraph, propertyTypeBaseUri);

  return Object.fromEntries(
    dataTypes.map((propertyType) => [
      extractVersion(propertyType.metadata.identifier.uri as VersionedUri),
      propertyType,
    ]),
  );
};
