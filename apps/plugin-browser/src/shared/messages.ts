import type { VersionedUrl } from "@blockprotocol/graph";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";

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
  flowRunId: string;
};

export type GetTabContentRequest = {
  type: "get-tab-content";
  html?: boolean;
};

export type GetTabContentReturn = {
  content: string;
  pageTitle: string;
  pageUrl: string;
};

export type Message =
  | InferEntitiesRequest
  | CancelInferEntitiesRequest
  | GetTabContentRequest;
