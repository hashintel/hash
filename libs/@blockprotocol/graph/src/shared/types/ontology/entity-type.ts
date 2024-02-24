import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";

import { QueryOperationInput } from "../entity.js";
import { EntityTypeRootType, Subgraph } from "../subgraph.js";
import { OntologyElementMetadata } from "./metadata.js";

export type EntityTypeWithMetadata = {
  schema: EntityType;
  metadata: OntologyElementMetadata;
};

export type QueryEntityTypesData = {
  // @todo mention in spec or remove
  // include entities that are used by, but don't belong to, the specified account
  includeOtherTypesInUse?: boolean | null;
  operation?: Omit<QueryOperationInput, "entityTypeId"> | null;
};

export type QueryEntityTypesResult<
  T extends Subgraph<boolean, EntityTypeRootType>,
> = {
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
