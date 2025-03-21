import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export const isItemType = <
  Type extends
    | EntityTypeWithMetadata
    | DataTypeWithMetadata
    | PropertyTypeWithMetadata,
>(
  item: HashEntity | Type,
): item is Type => "schema" in item;
