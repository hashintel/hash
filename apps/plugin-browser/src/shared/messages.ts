import type { EntityType } from "@blockprotocol/graph";

export type InferEntitiesRequest = {
  entityTypes: EntityType[];
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
