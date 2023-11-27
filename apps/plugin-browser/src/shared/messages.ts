import { VersionedUrl } from "@blockprotocol/graph";

export type InferEntitiesRequest = {
  entityTypeIds: VersionedUrl[];
  sourceTitle: string;
  sourceUrl: string;
  type: "infer-entities";
  textInput: string;
};

type GetSiteContentRequest = {
  type: "get-site-content";
};

export type GetSiteContentReturn = {
  innerText: string;
  pageTitle: string;
  pageUrl: string;
};

export type Message = InferEntitiesRequest | GetSiteContentRequest;
