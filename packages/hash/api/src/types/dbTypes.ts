import { BlockProperties, Page, UnknownEntity } from "../graphql/apiTypes.gen";

// These are mock types for quick prototyping
// The real types will need to be synced with the db schema
// Not based on the GraphQL schema types

export type DbBlockProperties = Omit<BlockProperties, "entity">;

export type DbPageProperties = Omit<Page["properties"], "contents"> & {
  contents: {
    accountId: string;
    entityId: string;
  }[];
};

export type DbPage = Omit<Page, "properties" | "type"> & {
  properties: DbPageProperties;
  type: "Page";
};

export type DbUnknownEntity = Omit<UnknownEntity, "type" | "__typename"> & {
  createdByAccountId: string;
  type: string;
  __typename?: string;
  metadataId: string;
  metadata: any; // TODO: type as JSON object
};
