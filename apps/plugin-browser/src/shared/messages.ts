import type { VersionedUrl } from "@blockprotocol/graph";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { OwnedById } from "@local/hash-subgraph";

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

export type CancelInferEntitiesRequest = {
  type: "cancel-infer-entities";
  requestUuid: string;
};

export type GetSiteContentRequest = {
  type: "get-site-content";
};

export type GetSiteContentReturn = {
  innerText: string;
  pageTitle: string;
  pageUrl: string;
};

export type Message =
  | InferEntitiesRequest
  | CancelInferEntitiesRequest
  | GetSiteContentRequest;
