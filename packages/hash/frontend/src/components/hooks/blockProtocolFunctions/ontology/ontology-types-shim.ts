import { MessageCallback } from "@blockprotocol/core";
import {
  CreateResourceError,
  ReadOrModifyResourceError,
} from "@blockprotocol/graph";
import {
  LinkType,
  PropertyType,
  EntityType,
} from "@hashintel/hash-graph-client";

type Response<N extends string, T> = {
  [_ in `${N}VersionedUri`]: string;
} & { [_ in N]: T };

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
