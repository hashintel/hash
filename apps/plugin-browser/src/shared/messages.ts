import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { WebPage } from "@local/hash-isomorphic-utils/flows/types";

export type InferEntitiesRequest = {
  createAs: "draft" | "live";
  entityTypeIds: VersionedUrl[];
  model: InferenceModelName;
  webId: WebId;
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

export const isWellFormattedMessage = (message: unknown): message is Message =>
  typeof message === "object" &&
  message !== null &&
  typeof (message as { type: unknown }).type === "string";
