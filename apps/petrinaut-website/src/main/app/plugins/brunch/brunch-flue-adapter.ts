import { z } from "zod";

import {
  browserToolOutput,
  projectBrunchMessageMetadata,
} from "@hashintel/brunch-agent/client-tools";
import { createFlueAiSdkAdapter } from "@local/flue-aisdk-transport";

import { canonicalPetrinautClientToolNames } from "./tools/brunch-client-tools";

import type {
  PetrinautAiMessage,
  PetrinautAiMessageMetadata,
} from "@hashintel/petrinaut/ui";
import type {
  FlueAiSdkAdapter,
  FlueAiSdkAdapterConfig,
} from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

export type BrunchFlueAdapter = FlueAiSdkAdapter<PetrinautAiMessage>;

/**
 * Validates the metadata Brunch sends against Petrinaut's message type, which
 * Petrinaut declares but does not check at runtime.
 */
const petrinautMessageMetadataSchema = z.object({
  source: z.literal("voice").optional(),
  stopped: z.literal(true).optional(),
  voiceToolCallIds: z.array(z.string()).optional(),
  toolCallId: z.string().optional(),
}) satisfies z.ZodType<PetrinautAiMessageMetadata>;

const _everyMetadataKeyValidated: [
  Exclude<
    keyof PetrinautAiMessageMetadata,
    keyof z.infer<typeof petrinautMessageMetadataSchema>
  >,
] extends [never]
  ? true
  : never = true;

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
    metadataSchema: petrinautMessageMetadataSchema,
    projectMetadata: projectBrunchMessageMetadata,
  });

/** The adapter for a panel that renders only Petrinaut's canonical tools. */
export const canonicalBrunchFlueAdapter = createBrunchFlueAdapter({
  clientToolNames: canonicalPetrinautClientToolNames,
});
