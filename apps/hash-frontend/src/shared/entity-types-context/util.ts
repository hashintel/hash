import { EntityType } from "@blockprotocol/type-system";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

export const isTypeArchived = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) =>
  type.metadata.custom.temporalVersioning.transactionTime.end.kind ===
  "exclusive";

export const isLinkEntityType = (type: EntityType) =>
  !!type.allOf?.some((parent) => parent.$ref === linkEntityTypeUrl);
