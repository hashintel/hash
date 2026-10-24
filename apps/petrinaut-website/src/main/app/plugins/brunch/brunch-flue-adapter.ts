import { z } from "zod";

import {
  browserToolOutput,
  brunchSignals,
  petrinautUserMessageText,
  projectBrunchMessageMetadata,
} from "@hashintel/brunch-agent";
import { createFlueAiSdkAdapter } from "@local/flue-aisdk-transport";

import { canonicalPetrinautClientToolNames } from "./tools/brunch-client-tools";

import type {
  PetrinautAiMessage,
  PetrinautAiMessageMetadata,
} from "./chat/ai-assistant-panel";
import type {
  FlueAiSdkAdapter,
  FlueAiSdkAdapterConfig,
} from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

export type BrunchFlueAdapter = FlueAiSdkAdapter<PetrinautAiMessage>;

/**
 * Validates the metadata Brunch sends against Petrinaut's message type, which
 * Petrinaut declares but does not check at runtime. Keys Petrinaut does not
 * render are dropped rather than rejected, so agents may add metadata freely.
 */
const petrinautMessageMetadataSchema = z.object({
  source: z.literal("voice").optional(),
  stopped: z.literal(true).optional(),
  voiceToolCallIds: z.array(z.string()).optional(),
  toolCallId: z.string().optional(),
} satisfies Record<
  keyof PetrinautAiMessageMetadata,
  z.ZodType
>) satisfies z.ZodType<PetrinautAiMessageMetadata>;

/** A reopened user turn shows the human's text, never its host framing. */
const withHumanUserText = (message: PetrinautAiMessage): PetrinautAiMessage =>
  message.role === "user"
    ? {
        ...message,
        parts: message.parts.map((part) =>
          part.type === "text"
            ? { ...part, text: petrinautUserMessageText(part.text) }
            : part,
        ),
      }
    : message;

/** Petrinaut's projection of one Brunch conversation, live and reopened. */
export const createBrunchFlueAdapter = (
  tools: Pick<
    FlueAiSdkAdapterConfig<UIMessage>,
    "clientToolNames" | "dynamicClientToolNames" | "mapClientToolInput"
  >,
  reporting: Pick<
    FlueAiSdkAdapterConfig<UIMessage>,
    "onInvalidReopenedMetadata"
  > = {},
): BrunchFlueAdapter => {
  const adapter = createFlueAiSdkAdapter<PetrinautAiMessage>({
    ...tools,
    ...reporting,
    mapToolOutput: browserToolOutput,
    metadataSchema: petrinautMessageMetadataSchema,
    projectMetadata: projectBrunchMessageMetadata,
    userSignalTags: new Set([brunchSignals.ledgerComments]),
  });
  return {
    ...adapter,
    reopen: (history) => adapter.reopen(history).map(withHumanUserText),
  };
};

/** The adapter for a panel that renders only Petrinaut's canonical tools. */
export const canonicalBrunchFlueAdapter = createBrunchFlueAdapter({
  clientToolNames: canonicalPetrinautClientToolNames,
});
