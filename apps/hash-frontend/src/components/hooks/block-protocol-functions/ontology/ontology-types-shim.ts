/**
 * This file contains new type system function signatures used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import { MessageCallback, MessageReturn } from "@blockprotocol/core";
import {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import {
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { EmptyObject } from "@local/hash-isomorphic-utils/util";
import {
  DataTypeRootType,
  EntityTypeRootType,
  EntityTypeWithMetadata,
  PropertyTypeRootType,
  PropertyTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

export type OntologyCallbacks = {
  aggregateDataTypes: AggregateDataTypesMessageCallback;
  getDataType: GetDataTypeMessageCallback;
  createPropertyType: CreatePropertyTypeMessageCallback;
  aggregatePropertyTypes: AggregatePropertyTypesMessageCallback;
  getPropertyType: GetPropertyTypeMessageCallback;
  updatePropertyType: UpdatePropertyTypeMessageCallback;
  createEntityType: CreateEntityTypeMessageCallback;
  aggregateEntityTypes: AggregateEntityTypesMessageCallback;
  getEntityType: GetEntityTypeMessageCallback;
  updateEntityType: UpdateEntityTypeMessageCallback;
};

/* Data type CRU */
export type AggregateDataTypesMessageCallback = MessageCallback<
  EmptyObject,
  null,
  MessageReturn<Subgraph<DataTypeRootType>>,
  ReadOrModifyResourceError
>;

export type GetDataTypeMessageCallback = MessageCallback<
  VersionedUri,
  null,
  MessageReturn<Subgraph<DataTypeRootType>>,
  ReadOrModifyResourceError
>;

/* Property type CRU */

export type CreatePropertyTypeRequest = {
  propertyType: Omit<PropertyType, "$id">;
};
export type CreatePropertyTypeMessageCallback = MessageCallback<
  CreatePropertyTypeRequest,
  null,
  MessageReturn<PropertyTypeWithMetadata>,
  CreateResourceError
>;

export type AggregatePropertyTypesRequest = {
  graphResolveDepths?: Partial<
    Pick<Subgraph["depths"], "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
};

export type AggregatePropertyTypesMessageCallback = MessageCallback<
  AggregatePropertyTypesRequest,
  null,
  MessageReturn<Subgraph<PropertyTypeRootType>>,
  ReadOrModifyResourceError
>;

export type GetPropertyTypeRequest = {
  propertyTypeId: VersionedUri;
  graphResolveDepths?: Partial<
    Pick<Subgraph["depths"], "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
};

export type GetPropertyTypeMessageCallback = MessageCallback<
  GetPropertyTypeRequest,
  null,
  MessageReturn<Subgraph<PropertyTypeRootType>>,
  ReadOrModifyResourceError
>;

export type UpdatePropertyTypeRequest = {
  propertyTypeId: VersionedUri;
  propertyType: Omit<PropertyType, "$id">;
};
export type UpdatePropertyTypeMessageCallback = MessageCallback<
  UpdatePropertyTypeRequest,
  null,
  MessageReturn<PropertyTypeWithMetadata>,
  ReadOrModifyResourceError
>;

/* Entity type CRU */

export type EntityTypeRequest = {
  entityType: Omit<EntityType, "$id">;
};
export type CreateEntityTypeMessageCallback = MessageCallback<
  EntityTypeRequest,
  null,
  MessageReturn<EntityTypeWithMetadata>,
  CreateResourceError
>;

export type AggregateEntityTypesRequest = {
  graphResolveDepths?: Partial<
    Pick<
      Subgraph["depths"],
      | "constrainsValuesOn"
      | "constrainsPropertiesOn"
      | "constrainsLinksOn"
      | "constrainsLinkDestinationsOn"
    >
  >;
};

export type AggregateEntityTypesMessageCallback = MessageCallback<
  AggregateEntityTypesRequest,
  null,
  MessageReturn<Subgraph<EntityTypeRootType>>,
  ReadOrModifyResourceError
>;

export type GetEntityTypeRequest = {
  entityTypeId: VersionedUri;
  graphResolveDepths?: Partial<
    Pick<
      Subgraph["depths"],
      | "constrainsValuesOn"
      | "constrainsPropertiesOn"
      | "constrainsLinksOn"
      | "constrainsLinkDestinationsOn"
    >
  >;
};

export type GetEntityTypeMessageCallback = MessageCallback<
  GetEntityTypeRequest,
  null,
  MessageReturn<Subgraph<EntityTypeRootType>>,
  ReadOrModifyResourceError
>;

export type UpdateEntityTypeRequest = {
  entityTypeId: VersionedUri;
  entityType: Omit<EntityType, "$id">;
};
export type UpdateEntityTypeMessageCallback = MessageCallback<
  UpdateEntityTypeRequest,
  null,
  MessageReturn<EntityTypeWithMetadata>,
  ReadOrModifyResourceError
>;
