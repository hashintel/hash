import type { InferenceModelName } from "../ai-inference-types.js";
import type { OutputDefinition, Payload, WebPage } from "./types.js";
import type { VersionedUrl, WebId } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";

export type AutomaticInferenceSettings = {
  createAs: "draft" | "live";
  displayGroupedBy: "type" | "location";
  enabled: boolean;
  model: InferenceModelName;
  webId: WebId;
  rules: {
    restrictToDomains: string[];
    entityTypeId: VersionedUrl;
  }[];
};

export type AutomaticInferenceInputName = "visitedWebPage";

export type AutomaticInferenceInputs = Subtype<
  Record<AutomaticInferenceInputName, Payload>,
  { visitedWebPage: { kind: "WebPage"; value: WebPage } }
>;

export type ManualInferenceInputName =
  | "draft"
  | "entityTypeIds"
  | "model"
  | "visitedWebPage";

export type ManualInferenceInputs = Subtype<
  Record<ManualInferenceInputName, Payload>,
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

type BaseInferenceArguments = { webId: WebId };

export type AutomaticInferenceArguments = AutomaticInferenceInputs &
  BaseInferenceArguments;

export type ManualInferenceArguments = ManualInferenceInputs &
  BaseInferenceArguments;

export const browserInferenceFlowOutput = {
  name: "persistedEntities",
  description: "The entities created or updated by the flow run",
  payloadKind: "PersistedEntityMetadata",
  array: true,
  required: true,
} as const satisfies Readonly<OutputDefinition>;
