import type {
  BaseUrl,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { EntityTypeRootType, Subgraph } from "../subgraph.js";

import type { OntologyElementMetadata } from "./metadata.js";

export interface EntityTypeWithMetadata {
  schema: EntityType;
  metadata: OntologyElementMetadata & {
    labelProperty?: BaseUrl | null;
    icon?: string | null;
  };
}

export interface QueryEntityTypesData {
  // @todo mention in spec or remove
  // include entities that are used by, but don't belong to, the specified account
  includeOtherTypesInUse?: boolean | null;
  operation?: Omit<QueryOperationInput, "entityTypeId"> | null;
}

export interface QueryEntityTypesResult<
  T extends Subgraph<EntityTypeRootType>,
> {
  results: T[];
  operation: QueryOperationInput;
}

export interface GetEntityTypeData {
  entityTypeId: VersionedUrl;
}

type SystemDefinedEntityTypeProperties = "$schema" | "$id" | "kind" | "type";

export interface CreateEntityTypeData {
  entityType: Omit<EntityType, SystemDefinedEntityTypeProperties>;
}

export interface UpdateEntityTypeData {
  entityTypeId: VersionedUrl;
  entityType: Omit<EntityType, SystemDefinedEntityTypeProperties>;
}
