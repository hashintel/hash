import {
  browserToolOutput,
  projectBrunchMessageMetadata,
} from "@hashintel/brunch-agent/client-tools";
import { petrinautAiMessageMetadataSchema } from "@hashintel/petrinaut-core";
import { createFlueAiSdkAdapter } from "@local/flue-aisdk-transport";

import { canonicalPetrinautClientToolNames } from "./brunch-client-tools";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";
import type {
  FlueAiSdkAdapter,
  FlueAiSdkAdapterConfig,
} from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

export type BrunchFlueAdapter = FlueAiSdkAdapter<PetrinautAiMessage>;

/** Petrinaut's projection of one Brunch conversation, live and reopened. */
export const createBrunchFlueAdapter = (
  tools: Pick<
    FlueAiSdkAdapterConfig<UIMessage>,
    "clientToolNames" | "dynamicClientToolNames" | "mapClientToolInput"
  >,
): BrunchFlueAdapter =>
  createFlueAiSdkAdapter<PetrinautAiMessage>({
    ...tools,
    mapToolOutput: browserToolOutput,
    metadataSchema: petrinautAiMessageMetadataSchema,
    projectMetadata: projectBrunchMessageMetadata,
  });

/** The adapter for a panel that renders only Petrinaut's canonical tools. */
export const canonicalBrunchFlueAdapter = createBrunchFlueAdapter({
  clientToolNames: canonicalPetrinautClientToolNames,
});
