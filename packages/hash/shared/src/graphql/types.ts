import {
  DataType,
  PropertyType,
  LinkType,
  EntityType,
} from "@blockprotocol/type-system-web";
import {
  PersistedDataType as GraphApiPersistedDataType,
  PersistedPropertyType as GraphApiPersistedPropertyType,
  PersistedLinkType as GraphApiPersistedLinkType,
  PersistedEntityType as GraphApiPersistedEntityType,
  PersistedEntity as GraphApiPersistedEntity,
  PersistedLink as GraphApiPersistedLink,
  Vertex as GraphApiVertex,
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

/** @todo - We shouldn't need to do these: https://app.asana.com/0/1202805690238892/1202892835843657/f */
export type PersistedDataType = Omit<GraphApiPersistedDataType, "inner"> & {
  inner: DataType;
};
export type PersistedPropertyType = Omit<
  GraphApiPersistedPropertyType,
  "inner"
> & {
  inner: PropertyType;
};
export type PersistedEntityType = Omit<GraphApiPersistedLinkType, "inner"> & {
  inner: EntityType;
};
export type PersistedLinkType = Omit<GraphApiPersistedEntityType, "inner"> & {
  inner: LinkType;
};

export type DataTypeVertex = Omit<
  Extract<GraphApiVertex, { kind: "dataType" }>,
  "inner"
> & {
  inner: PersistedDataType;
};

export type PropertyTypeVertex = Omit<
  Extract<GraphApiVertex, { kind: "propertyType" }>,
  "inner"
> & {
  inner: PersistedPropertyType;
};

export type LinkTypeVertex = Omit<
  Extract<GraphApiVertex, { kind: "linkType" }>,
  "inner"
> & {
  inner: PersistedLinkType;
};

export type EntityTypeVertex = Omit<
  Extract<GraphApiVertex, { kind: "entityType" }>,
  "inner"
> & {
  inner: PersistedEntityType;
};

export type EntityVertex = Extract<GraphApiVertex, { kind: "entity" }>;

export type LinkVertex = Extract<GraphApiVertex, { kind: "link" }>;

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
