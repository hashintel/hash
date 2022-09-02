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
  DataType,
  PropertyType,
  EntityType,
  LinkType,
} from "@blockprotocol/type-system-web";

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
  createLinkType: CreateLinkTypeMessageCallback;
  aggregateLinkTypes: AggregateLinkTypesMessageCallback;
  getLinkType: GetLinkTypeMessageCallback;
  updateLinkType: UpdateLinkTypeMessageCallback;
};

/* Shared types */

/**
 * Create Response object from the name and type of an ontology type kind.
 * This exists to reduce repetition in the types.
 *
 * For example turning
 *   Response<"dataType", DataType>
 * into
 *   { dataTypeVersionedUri: string; dataType: DataType }
 */
type Response<N extends string, T> = {
  [_ in `${N}VersionedUri`]: string;
} & { [_ in N]: T };

export type AggregateResult<T> = {
  results: T[];
};

/* Data type CRU */

export type DataTypeResponse = Response<"dataType", DataType>;

export type AggregateDataTypesRequest = {};
export type AggregateDataTypesMessageCallback = MessageCallback<
  AggregateDataTypesRequest,
  null,
  AggregateResult<DataTypeResponse>,
  ReadOrModifyResourceError
>;

export type GetDataTypeRequest = Pick<DataTypeResponse, "dataTypeVersionedUri">;
export type GetDataTypeMessageCallback = MessageCallback<
  GetDataTypeRequest,
  null,
  DataTypeResponse,
  ReadOrModifyResourceError
>;

/* Property type CRU */

export type PropertyTypeResponse = Response<"propertyType", PropertyType>;

export type CreatePropertyTypeRequest = {
  propertyType: PropertyType;
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
  AggregateResult<PropertyTypeResponse>,
  ReadOrModifyResourceError
>;

export type GetPropertyTypeRequest = Pick<PropertyTypeResponse, "propertyType">;
export type GetPropertyTypeMessageCallback = MessageCallback<
  GetPropertyTypeRequest,
  null,
  PropertyTypeResponse,
  ReadOrModifyResourceError
>;

export type UpdatePropertyTypeRequest = {
  propertyTypeVersionedUri: string;
  propertyType: PropertyType;
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
  entityType: EntityType;
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
  AggregateResult<EntityTypeResponse>,
  ReadOrModifyResourceError
>;

export type GetEntityTypeRequest = Pick<EntityTypeResponse, "entityType">;
export type GetEntityTypeMessageCallback = MessageCallback<
  GetEntityTypeRequest,
  null,
  EntityTypeResponse,
  ReadOrModifyResourceError
>;

export type UpdateEntityTypeRequest = {
  entityTypeVersionedUri: string;
  entityType: EntityType;
};
export type UpdateEntityTypeMessageCallback = MessageCallback<
  UpdateEntityTypeRequest,
  null,
  EntityTypeResponse,
  ReadOrModifyResourceError
>;

/* Link type CRU */

export type LinkTypeResponse = Response<"linkType", LinkType>;

export type CreateLinkTypeRequest = {
  linkType: LinkType;
};
export type CreateLinkTypeMessageCallback = MessageCallback<
  CreateLinkTypeRequest,
  null,
  LinkTypeResponse,
  CreateResourceError
>;

export type AggregateLinkTypesRequest = {};
export type AggregateLinkTypesMessageCallback = MessageCallback<
  AggregateLinkTypesRequest,
  null,
  AggregateResult<LinkTypeResponse>,
  ReadOrModifyResourceError
>;

export type GetLinkTypeRequest = Pick<LinkTypeResponse, "linkType">;
export type GetLinkTypeMessageCallback = MessageCallback<
  GetLinkTypeRequest,
  null,
  LinkTypeResponse,
  ReadOrModifyResourceError
>;

export type UpdateLinkTypeRequest = {
  linkTypeVersionedUri: string;
  linkType: LinkType;
};
export type UpdateLinkTypeMessageCallback = MessageCallback<
  UpdateLinkTypeRequest,
  null,
  LinkTypeResponse,
  ReadOrModifyResourceError
>;
