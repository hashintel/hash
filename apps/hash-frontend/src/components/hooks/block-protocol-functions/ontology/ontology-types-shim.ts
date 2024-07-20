/**
 * This file contains new type system function signatures used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import type { MessageCallback, MessageReturn } from "@blockprotocol/core";
import type {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { EmptyObject } from "@local/hash-isomorphic-utils/util";
import type {
  DataTypeRootType,
  EntityTypeRootType,
  PropertyTypeRootType,
  Subgraph,
} from "@local/hash-subgraph";

type SystemDefinedOntologyTypeProperties = "$id" | "kind" | "$schema";

export interface OntologyCallbacks {
  queryDataTypes: QueryDataTypesMessageCallback;
  getDataType: GetDataTypeMessageCallback;
  createPropertyType: CreatePropertyTypeMessageCallback;
  queryPropertyTypes: QueryPropertyTypesMessageCallback;
  getPropertyType: GetPropertyTypeMessageCallback;
  updatePropertyType: UpdatePropertyTypeMessageCallback;
  createEntityType: CreateEntityTypeMessageCallback;
  queryEntityTypes: QueryEntityTypesMessageCallback;
  getEntityType: GetEntityTypeMessageCallback;
  updateEntityType: UpdateEntityTypeMessageCallback;
}

/* Data type CRU */
export type QueryDataTypesMessageCallback = MessageCallback<
  EmptyObject,
  null,
  MessageReturn<Subgraph<DataTypeRootType>>,
  ReadOrModifyResourceError
>;

export type GetDataTypeMessageCallback = MessageCallback<
  VersionedUrl,
  null,
  MessageReturn<Subgraph<DataTypeRootType>>,
  ReadOrModifyResourceError
>;

/* Property type CRU */

export interface CreatePropertyTypeRequest {
  propertyType: Omit<PropertyType, SystemDefinedOntologyTypeProperties>;
}
export type CreatePropertyTypeMessageCallback = MessageCallback<
  CreatePropertyTypeRequest,
  null,
  MessageReturn<PropertyTypeWithMetadata>,
  CreateResourceError
>;

export interface QueryPropertyTypesRequest {
  latestOnly?: boolean;
  includeArchived?: boolean;
  graphResolveDepths?: Partial<
    Pick<Subgraph["depths"], "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
}

export type QueryPropertyTypesMessageCallback = MessageCallback<
  QueryPropertyTypesRequest,
  null,
  MessageReturn<Subgraph<PropertyTypeRootType>>,
  ReadOrModifyResourceError
>;

export interface GetPropertyTypeRequest {
  propertyTypeId: VersionedUrl;
  graphResolveDepths?: Partial<
    Pick<Subgraph["depths"], "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
}

export type GetPropertyTypeMessageCallback = MessageCallback<
  GetPropertyTypeRequest,
  null,
  MessageReturn<Subgraph<PropertyTypeRootType>>,
  ReadOrModifyResourceError
>;

export interface UpdatePropertyTypeRequest {
  propertyTypeId: VersionedUrl;
  propertyType: Omit<PropertyType, SystemDefinedOntologyTypeProperties>;
}
export type UpdatePropertyTypeMessageCallback = MessageCallback<
  UpdatePropertyTypeRequest,
  null,
  MessageReturn<PropertyTypeWithMetadata>,
  ReadOrModifyResourceError
>;

/* Entity type CRU */

export interface EntityTypeRequest {
  entityType: Omit<EntityType, SystemDefinedOntologyTypeProperties>;
}
export type CreateEntityTypeMessageCallback = MessageCallback<
  EntityTypeRequest,
  null,
  MessageReturn<EntityTypeWithMetadata>,
  CreateResourceError
>;

export interface QueryEntityTypesRequest {
  latestOnly?: boolean;
  includeArchived?: boolean;
  graphResolveDepths?: Partial<
    Pick<
      Subgraph["depths"],
      | "constrainsValuesOn"
      | "constrainsPropertiesOn"
      | "constrainsLinksOn"
      | "constrainsLinkDestinationsOn"
    >
  >;
}

export type QueryEntityTypesMessageCallback = MessageCallback<
  QueryEntityTypesRequest & { latestOnly?: boolean },
  null,
  MessageReturn<Subgraph<EntityTypeRootType>>,
  ReadOrModifyResourceError
>;

export interface GetEntityTypeRequest {
  entityTypeId: VersionedUrl;
  graphResolveDepths?: Partial<
    Pick<
      Subgraph["depths"],
      | "constrainsValuesOn"
      | "constrainsPropertiesOn"
      | "constrainsLinksOn"
      | "constrainsLinkDestinationsOn"
    >
  >;
}

export type GetEntityTypeMessageCallback = MessageCallback<
  GetEntityTypeRequest,
  null,
  MessageReturn<Subgraph<EntityTypeRootType>>,
  ReadOrModifyResourceError
>;

export interface UpdateEntityTypeRequest {
  entityTypeId: VersionedUrl;
  entityType: Omit<EntityType, SystemDefinedOntologyTypeProperties>;
}
export type UpdateEntityTypeMessageCallback = MessageCallback<
  UpdateEntityTypeRequest,
  null,
  MessageReturn<EntityTypeWithMetadata>,
  ReadOrModifyResourceError
>;
