import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { Subtype } from "@local/advanced-types/subtype";
import type { OwnedById } from "@local/hash-graph-types/web";

import type { InferenceModelName } from "../ai-inference-types.js";
import type { OutputDefinition, Payload, WebPage } from "./types.js";

export type AutomaticInferenceSettings = {
  createAs: "draft" | "live";
  displayGroupedBy: "type" | "location";
  enabled: boolean;
  model: InferenceModelName;
  ownedById: OwnedById;
  rules: {
    restrictToDomains: string[];
    entityTypeId: VersionedUrl;
  }[];
};

export type AutomaticInferenceTriggerInputName = "visitedWebPage";

export type AutomaticInferenceTriggerInputs = Subtype<
  Record<AutomaticInferenceTriggerInputName, Payload>,
  { visitedWebPage: { kind: "WebPage"; value: WebPage } }
>;

export type ManualInferenceTriggerInputName =
  | "draft"
  | "entityTypeIds"
  | "model"
  | "visitedWebPage";

export type ManualInferenceTriggerInputs = Subtype<
  Record<ManualInferenceTriggerInputName, Payload>,
  {
    draft: {
      kind: "Boolean";
      value: boolean;
    };
    entityTypeIds: {
      kind: "VersionedUrl";
      value: VersionedUrl[];
    };
    model: {
      kind: "Text";
      value: InferenceModelName;
    };
    visitedWebPage: {
      kind: "WebPage";
      value: WebPage;
    };
  }
>;

type BaseInferenceArguments = { webId: OwnedById };

export type AutomaticInferenceArguments = AutomaticInferenceTriggerInputs &
  BaseInferenceArguments;

export type ManualInferenceArguments = ManualInferenceTriggerInputs &
  BaseInferenceArguments;

export const browserInferenceFlowOutput = {
  name: "persistedEntities",
  description: "The entities created or updated by the flow run",
  payloadKind: "PersistedEntities",
  array: true,
  required: true,
} as const satisfies Readonly<OutputDefinition>;
