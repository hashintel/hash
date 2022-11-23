/**
 * This file contains new type system function signatures used to augment the
 * existing set of Block Protocol.
 *
 * These signatures will eventually make their way into the @blockprotocol/graph
 * package and be removed from here.
 */

import { MessageCallback } from "@blockprotocol/core";
import {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";

import {
  PropertyType,
  EntityType,
  VersionedUri,
} from "@blockprotocol/type-system-web";
import {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";

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
  {},
  null,
  Subgraph<SubgraphRootTypes["dataType"]>,
  ReadOrModifyResourceError
>;

export type GetDataTypeMessageCallback = MessageCallback<
  VersionedUri,
  null,
  Subgraph<SubgraphRootTypes["dataType"]>,
  ReadOrModifyResourceError
>;

/* Property type CRU */

export type CreatePropertyTypeRequest = {
  propertyType: Omit<PropertyType, "$id">;
};
export type CreatePropertyTypeMessageCallback = MessageCallback<
  CreatePropertyTypeRequest,
  null,
  PropertyTypeWithMetadata,
  CreateResourceError
>;

export type AggregatePropertyTypesMessageCallback = MessageCallback<
  {},
  null,
  Subgraph<SubgraphRootTypes["propertyType"]>,
  ReadOrModifyResourceError
>;

export type GetPropertyTypeMessageCallback = MessageCallback<
  VersionedUri,
  null,
  Subgraph<SubgraphRootTypes["propertyType"]>,
  ReadOrModifyResourceError
>;

export type UpdatePropertyTypeRequest = {
  propertyTypeId: VersionedUri;
  propertyType: Omit<PropertyType, "$id">;
};
export type UpdatePropertyTypeMessageCallback = MessageCallback<
  UpdatePropertyTypeRequest,
  null,
  PropertyTypeWithMetadata,
  ReadOrModifyResourceError
>;

/* Entity type CRU */

export type EntityTypeRequest = {
  entityType: Omit<EntityType, "$id">;
};
export type CreateEntityTypeMessageCallback = MessageCallback<
  EntityTypeRequest,
  null,
  EntityTypeWithMetadata,
  CreateResourceError
>;

export type AggregateEntityTypesMessageCallback = MessageCallback<
  {},
  null,
  Subgraph<SubgraphRootTypes["entityType"]>,
  ReadOrModifyResourceError
>;

export type GetEntityTypeMessageCallback = MessageCallback<
  VersionedUri,
  null,
  Subgraph<SubgraphRootTypes["entityType"]>,
  ReadOrModifyResourceError
>;

export type UpdateEntityTypeRequest = {
  entityTypeId: VersionedUri;
  entityType: Omit<EntityType, "$id">;
};
export type UpdateEntityTypeMessageCallback = MessageCallback<
  UpdateEntityTypeRequest,
  null,
  EntityTypeWithMetadata,
  ReadOrModifyResourceError
>;
