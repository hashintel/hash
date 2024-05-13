import { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
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
