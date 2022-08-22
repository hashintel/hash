import { MessageCallback } from "@blockprotocol/core";
import {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import {
  LinkType,
  PropertyType,
  EntityType,
  DataType,
} from "@hashintel/hash-graph-client";

/* Shared types */

type Response<N extends string, T> = {
  [_ in `${N}VersionedUri`]: string;
} & { [_ in N]: T };

export type AggregateResult<T> = {
  results: T[];
};

/* Data type CRU */

export type DataTypeResponse = Response<"dataType", DataType>;

export type CreateDataTypeRequest = {
  dataType: DataType;
};

export type CreateDataTypeMessageCallback = MessageCallback<
  CreateDataTypeRequest,
  null,
  DataTypeResponse,
  CreateResourceError
>;

export type AggregateDataTypesRequest = {};

export type AggregateDataTypeMessageCallback = MessageCallback<
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

export type AggregatePropertyTypeMessageCallback = MessageCallback<
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

export type AggregateEntityTypeMessageCallback = MessageCallback<
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

export type AggregateLinkTypeMessageCallback = MessageCallback<
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
