import {
  DataType,
  PropertyType,
  LinkType,
  EntityType,
} from "@blockprotocol/type-system-web";
import {
  PersistedDataType,
  PersistedPropertyType,
  PersistedLinkType,
  PersistedEntityType,
  PersistedEntity,
  PersistedLink,
} from "@hashintel/hash-graph-client";

export type TextToken =
  | {
      tokenType: "text";
      text: string;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      link?: string;
    }
  | { tokenType: "hardBreak" }
  | { tokenType: "mention"; mentionType: "user"; entityId: string };

export type UnknownEntityProperties = {};

export type DataTypeWithoutId = Omit<DataType, "$id">;
export type PropertyTypeWithoutId = Omit<PropertyType, "$id">;
export type LinkTypeWithoutId = Omit<LinkType, "$id">;
export type EntityTypeWithoutId = Omit<EntityType, "$id">;

export type DataTypeVertex = {
  kind: "DATA_TYPE";
  inner: PersistedDataType;
};

export type PropertyTypeVertex = {
  kind: "PROPERTY_TYPE";
  inner: PersistedPropertyType;
};

export type LinkTypeVertex = {
  kind: "LINK_TYPE";
  inner: PersistedLinkType;
};

export type EntityTypeVertex = {
  kind: "ENTITY_TYPE";
  inner: PersistedEntityType;
};

export type EntityVertex = {
  kind: "ENTITY";
  inner: PersistedEntity;
};

export type LinkVertex = {
  kind: "LINK";
  inner: PersistedLink;
};

export type Vertex =
  | DataTypeVertex
  | PropertyTypeVertex
  | LinkTypeVertex
  | EntityTypeVertex
  | EntityVertex
  | LinkVertex;

export type EdgeKind =
  | "HAS_LINK" // an entity has this link
  | "HAS_DESTINATION" // link has this destination (entity)
  | "HAS_TYPE" // entity has an entity type
  | "REFERENCES"; // type references another type

/** @todo - Can we do better than string? */
export type Vertices = Record<string, Vertex>;

/** @todo - Less confusing name than destination? */
/** @todo - Destination implies a directed relationship, do we want to leave the door open to non-directed ones as well? */
export type Edges = Record<
  string,
  Array<{ edgeKind: EdgeKind; destination: string }>
>;
