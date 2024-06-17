import type { VersionedUrl } from "@blockprotocol/graph";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";

export type InferEntitiesRequest = {
  createAs: "draft" | "live";
  entityTypeIds: VersionedUrl[];
  model: InferenceModelName;
  ownedById: OwnedById;
  sourceWebPage: WebPage;
  type: "infer-entities";
};

export type CancelInferEntitiesRequest = {
  type: "cancel-infer-entities";
  flowRunId: string;
};

export type GetTabContentRequest = {
  type: "get-tab-content";
};

export type GetTabContentReturn = WebPage;

export type Message =
  | InferEntitiesRequest
  | CancelInferEntitiesRequest
  | GetTabContentRequest;
