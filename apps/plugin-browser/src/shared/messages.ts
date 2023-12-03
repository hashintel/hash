import { EntityTypeWithMetadata } from "@local/hash-subgraph";

export type InferEntitiesRequest = {
  entityTypes: EntityTypeWithMetadata[];
  sourceTitle: string;
  sourceUrl: string;
  type: "infer-entities";
  textInput: string;
};

export type GetSiteContentRequest = {
  type: "get-site-content";
};

export type GetSiteContentReturn = {
  innerText: string;
  pageTitle: string;
  pageUrl: string;
};

export type Message = InferEntitiesRequest | GetSiteContentRequest;
