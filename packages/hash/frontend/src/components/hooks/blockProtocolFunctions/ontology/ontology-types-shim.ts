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
import { Subgraph } from "../../../../lib/subgraph";

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

/* Shared types */

/**
 * Create Response object from the name and type of an ontology type kind.
 * This exists to reduce repetition in the types.
 *
 * For example turning
 *   Response<"dataType", DataType>
 * into
 *   { dataTypeId: string; dataType: DataType }
 */
type Response<N extends string, T> = {
  [_ in `${N}Id`]: string;
} & { [_ in N]: T };

export type AggregateResult<T> = {
  results: T[];
};

/* Data type CRU */
export type AggregateDataTypesRequest = {};
export type AggregateDataTypesMessageCallback = MessageCallback<
  AggregateDataTypesRequest,
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type GetDataTypeMessageCallback = MessageCallback<
  { dataTypeId: VersionedUri },
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

/* Property type CRU */

export type PropertyTypeResponse = Response<"propertyType", PropertyType>;

export type CreatePropertyTypeRequest = {
  propertyType: Omit<PropertyType, "$id">;
};
export type CreatePropertyTypeMessageCallback = MessageCallback<
  CreatePropertyTypeRequest,
  null,
  PropertyTypeResponse,
  CreateResourceError
>;

export type AggregatePropertyTypesRequest = {};
export type AggregatePropertyTypesMessageCallback = MessageCallback<
  AggregatePropertyTypesRequest,
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type GetPropertyTypeMessageCallback = MessageCallback<
  { propertyTypeId: VersionedUri },
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type UpdatePropertyTypeRequest = {
  propertyTypeId: string;
  propertyType: Omit<PropertyType, "$id">;
};
export type UpdatePropertyTypeMessageCallback = MessageCallback<
  UpdatePropertyTypeRequest,
  null,
  PropertyTypeResponse,
  ReadOrModifyResourceError
>;

/* Entity type CRU */

export type EntityTypeResponse = Response<"entityType", EntityType>;

export type EntityTypeRequest = {
  entityType: Omit<EntityType, "$id">;
};
export type CreateEntityTypeMessageCallback = MessageCallback<
  EntityTypeRequest,
  null,
  EntityTypeResponse,
  CreateResourceError
>;

export type AggregateEntityTypesRequest = {};
export type AggregateEntityTypesMessageCallback = MessageCallback<
  AggregateEntityTypesRequest,
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type GetEntityTypeRequest = Pick<EntityTypeResponse, "entityTypeId">;
export type GetEntityTypeMessageCallback = MessageCallback<
  GetEntityTypeRequest,
  null,
  Subgraph,
  ReadOrModifyResourceError
>;

export type UpdateEntityTypeRequest = {
  entityTypeId: string;
  entityType: Omit<EntityType, "$id">;
};
export type UpdateEntityTypeMessageCallback = MessageCallback<
  UpdateEntityTypeRequest,
  null,
  EntityTypeResponse,
  ReadOrModifyResourceError
>;
