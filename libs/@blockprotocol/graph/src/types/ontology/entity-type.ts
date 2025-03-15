import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";

import type { QueryOperationInput } from "../entity.js";
import type { EntityTypeRootType, Subgraph } from "../subgraph.js";

export type QueryEntityTypesData = {
  // @todo mention in spec or remove
  // include entities that are used by, but don't belong to, the specified account
  includeOtherTypesInUse?: boolean | null;
  operation?: Omit<QueryOperationInput, "entityTypeId"> | null;
};

export type QueryEntityTypesResult<T extends Subgraph<EntityTypeRootType>> = {
  results: T[];
  operation: QueryOperationInput;
};

export type GetEntityTypeData = {
  entityTypeId: VersionedUrl;
};

type SystemDefinedEntityTypeProperties = "$schema" | "$id" | "kind" | "type";

export type CreateEntityTypeData = {
  entityType: Omit<EntityType, SystemDefinedEntityTypeProperties>;
};

export type UpdateEntityTypeData = {
  entityTypeId: VersionedUrl;
  entityType: Omit<EntityType, SystemDefinedEntityTypeProperties>;
};
