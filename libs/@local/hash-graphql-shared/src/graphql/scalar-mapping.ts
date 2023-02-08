import { EntityPropertiesObject } from "@local/hash-types/types/knowledge/entity";

export const scalars = {
  Date: "string",
  JSONObject: "@blockprotocol/core#JsonObject",
  UnknownEntityProperties:
    "@local/hash-graphql-shared/graphql/types#UnknownEntityProperties",
  TextToken: "@local/hash-graphql-shared/graphql/types#TextToken",

  VersionedUri: "@local/hash-types#VersionedUri",

  DataTypeWithMetadata: "@local/hash-types#DataTypeWithMetadata",
  DataTypeWithoutId:
    "@local/hash-graphql-shared/graphql/types#DataTypeWithoutId",

  EntityTypeWithMetadata: "@local/hash-types#EntityTypeWithMetadata",
  EntityTypeWithoutId:
    "@local/hash-graphql-shared/graphql/types#EntityTypeWithoutId",

  PropertyTypeWithMetadata: "@local/hash-types#PropertyTypeWithMetadata",
  PropertyTypeWithoutId:
    "@local/hash-graphql-shared/graphql/types#PropertyTypeWithoutId",

  Entity: "@local/hash-types#Entity",
  EntityEditionId: "@local/hash-types#EntityEditionId",
  EntityMetadata: "@local/hash-types#EntityMetadata",
  EntityVersion: "@local/hash-types/#EntityVersion",
  EntityPropertiesObject: "@local/hash-types#EntityPropertiesObject",

  GraphElementVertexId: "@local/hash-types#GraphElementVertexId",
  Edges: "@local/hash-types#Edges",
  Vertices: "@local/hash-types#Vertices",
  LinkData: "@local/hash-types#LinkData",
  TimeProjection: "@local/hash-types#TimeProjection",
  ResolvedTimeProjection: "@local/hash-types#ResolvedTimeProjection",

  OwnedById: "@local/hash-isomorphic-utils/types#OwnedById",
  UpdatedById: "@local/hash-isomorphic-utils/types#UpdatedById",
  AccountId: "@local/hash-isomorphic-utils/types#AccountId",
  EntityId: "@local/hash-isomorphic-utils/types#EntityId",

  EntityUuid: "@local/hash-isomorphic-utils/types#EntityUuid",
  Uuid: "@local/hash-isomorphic-utils/types#Uuid",
};
