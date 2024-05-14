import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { Subtype } from "@local/advanced-types/subtype";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import type {
  Payload,
  WebPage,
} from "@local/hash-isomorphic-utils/flows/types";
import type { OwnedById } from "@local/hash-subgraph";

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
