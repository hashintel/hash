import {
  createFlueChatTransport,
  type FlueChatTransportOptions,
} from "./chat-transport";
import {
  snapshotToUiMessages,
  type FlueHistory,
  type UiHistoryMessage,
} from "./transcript";

import type { MetadataProjection } from "./shared/metadata-projection";
import type { FlueUiProjectionOptions } from "./ui-stream";
import type { ChatTransport, FlexibleSchema, UIMessage } from "ai";

/** The metadata type a message type carries. */
type MessageMetadata<UiMessage extends UIMessage> =
  UiMessage extends UIMessage<infer Metadata> ? Metadata : never;

/**
 * The Standard Schema members of the AI SDK's `FlexibleSchema`, so the same
 * schema can also be handed to `useChat`. Projection runs synchronously, so
 * the schema must validate synchronously.
 */
export type SyncMetadataSchema<Metadata> = Extract<
  FlexibleSchema<Metadata>,
  { readonly "~standard": unknown }
>;

/**
 * A host with its own metadata type must give the schema that owns it; the
 * schema, not the projection, turns projected values into that type.
 */
type MetadataContract<Metadata> = unknown extends Metadata
  ? { readonly metadataSchema?: SyncMetadataSchema<Metadata> }
  : { readonly metadataSchema: SyncMetadataSchema<Metadata> };

export type FlueAiSdkAdapterConfig<UiMessage extends UIMessage> =
  FlueUiProjectionOptions & MetadataContract<MessageMetadata<UiMessage>>;

export interface FlueAiSdkAdapter<UiMessage extends UIMessage> {
  /** A `useChat` transport for one Flue conversation. */
  readonly chatTransport: (
    options: FlueChatTransportOptions,
  ) => ChatTransport<UiMessage>;
  /** Rebuild a conversation's messages from its stored Flue history. */
  readonly reopen: (
    history: FlueHistory,
  ) => UiHistoryMessage<MessageMetadata<UiMessage>>[];
}

const validateMetadata = <Metadata>(
  schema: SyncMetadataSchema<Metadata>,
  value: unknown,
): Metadata => {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(
      "The message metadata schema must validate synchronously.",
    );
  }
  if (result.issues !== undefined) {
    throw new TypeError(
      `Message metadata does not match the host schema: ${result.issues
        .map(({ message }) => message)
        .join("; ")}`,
      { cause: result.issues },
    );
  }
  return result.value;
};

/**
 * Bind one host's projection of Flue conversations into the AI SDK: its
 * message type, metadata contract and tool presentation, shared by the live
 * transport and by reopened history. Metadata failing the schema ends a live
 * turn with an error and makes `reopen` throw.
 */
export const createFlueAiSdkAdapter = <UiMessage extends UIMessage = UIMessage>(
  config: FlueAiSdkAdapterConfig<UiMessage>,
): FlueAiSdkAdapter<UiMessage> => {
  type Metadata = MessageMetadata<UiMessage>;
  const { projectMetadata, ...toolProjection } = config;
  const metadataSchema: SyncMetadataSchema<Metadata> | undefined =
    config.metadataSchema;
  const project: MetadataProjection<Metadata> = (input) => {
    const metadata =
      projectMetadata === undefined
        ? input.agentMetadata
        : projectMetadata(input);
    // Without a schema, MetadataContract has already fixed Metadata to unknown.
    return metadata === undefined || metadataSchema === undefined
      ? (metadata as Metadata | undefined)
      : validateMetadata(metadataSchema, metadata);
  };
  const projection = { ...toolProjection, projectMetadata: project };

  return {
    chatTransport: (options) =>
      createFlueChatTransport({ ...options, ...projection }),
    reopen: (history) => snapshotToUiMessages(history, projection),
  };
};
