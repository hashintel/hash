import type {
  BaseUrl,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { EntityTypeRootType, Subgraph } from "../subgraph.js";
import type { OntologyElementMetadata } from "./metadata.js";

export type EntityTypeWithMetadata = {
  schema: EntityType;
  metadata: OntologyElementMetadata & {
    labelProperty?: BaseUrl | null;
    icon?: string | null;
  };
};

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
