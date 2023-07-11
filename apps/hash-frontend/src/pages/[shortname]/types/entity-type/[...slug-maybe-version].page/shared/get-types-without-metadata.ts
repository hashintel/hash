import { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

export const getTypesWithoutMetadata = <
  T extends EntityTypeWithMetadata | PropertyTypeWithMetadata,
>(
  typesWithMetadata: Record<VersionedUrl, T>,
): Record<VersionedUrl, T["schema"]> => {
  return Object.fromEntries(
    Object.entries(typesWithMetadata).map(([$id, typeWithMetadata]) => [
      $id,
      typeWithMetadata.schema,
    ]),
  );
};
