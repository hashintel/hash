import { VersionedUrl } from "@blockprotocol/graph";
import { InferenceModelName } from "@local/hash-isomorphic-utils/temporal-types";
import { OwnedById } from "@local/hash-subgraph";

export type InferEntitiesRequest = {
  createAs: "draft" | "live";
  entityTypeIds: VersionedUrl[];
  model: InferenceModelName;
  ownedById: OwnedById;
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
