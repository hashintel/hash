import { EntityType } from "@blockprotocol/type-system";
import {
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";

export const isEntityTypeArchived = (entityType: EntityTypeWithMetadata) =>
  entityType.metadata.custom.temporalVersioning.transactionTime.end.kind ===
  "exclusive";

export const isLinkEntityType = (type: EntityType) =>
  !!type.allOf?.some((parent) => parent.$ref === linkEntityTypeUrl);
