import {
  createFlueChatTransport,
  type FlueChatTransportOptions,
} from "./chat-transport";
import { notifyObserver } from "./notify-observer";
import { snapshotToUiMessages, type FlueHistory } from "./transcript";

import type { MetadataProjection } from "./metadata-projection";
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

/** A reopened message whose stored metadata the host schema refused. */
export interface InvalidReopenedMetadata {
  readonly messageId: string;
  readonly error: TypeError;
}

export type FlueAiSdkAdapterConfig<UiMessage extends UIMessage> =
  FlueUiProjectionOptions &
    MetadataContract<MessageMetadata<UiMessage>> & {
      /**
       * Reports a stored message `reopen` kept without its metadata, because
       * the schema refused it. Each adapter reports a message once, however
       * often its history is reopened, after `reopen` has returned, so a
       * render that reopens history never reports from inside itself.
       */
      readonly onInvalidReopenedMetadata?: (
        invalid: InvalidReopenedMetadata,
      ) => void;
    };

export interface FlueAiSdkAdapter<UiMessage extends UIMessage> {
  /** A `useChat` transport for one Flue conversation. */
  readonly chatTransport: (
    options: FlueChatTransportOptions,
  ) => ChatTransport<UiMessage>;
  /** Rebuild a conversation's messages from its stored Flue history. */
  readonly reopen: (history: FlueHistory) => UiMessage[];
}

type MetadataCheck<Metadata> =
  | { readonly value: Metadata }
  | { readonly error: TypeError };

const checkMetadata = <Metadata>(
  schema: SyncMetadataSchema<Metadata>,
  value: unknown,
): MetadataCheck<Metadata> => {
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) {
    throw new TypeError(
      "The message metadata schema must validate synchronously.",
    );
  }
  if (result.issues !== undefined) {
    return {
      error: new TypeError(
        `Message metadata does not match the host schema: ${result.issues
          .map(({ message }) => message)
          .join("; ")}`,
        { cause: result.issues },
      ),
    };
  }
  return { value: result.value };
};

/**
 * Bind one host's projection of Flue conversations into the AI SDK: its
 * message type, metadata contract and tool presentation, shared by the live
 * transport and by reopened history. Metadata failing the schema ends a live
 * turn with an error; `reopen` keeps that message without its metadata and
 * reports it once, so one bad record cannot make a conversation unreadable.
 */
export const createFlueAiSdkAdapter = <UiMessage extends UIMessage = UIMessage>(
  config: FlueAiSdkAdapterConfig<UiMessage>,
): FlueAiSdkAdapter<UiMessage> => {
  type Metadata = MessageMetadata<UiMessage>;
  const { projectMetadata, onInvalidReopenedMetadata, ...toolProjection } =
    config;
  const metadataSchema: SyncMetadataSchema<Metadata> | undefined =
    config.metadataSchema;
  const reportedInvalidMessageIds = new Set<string>();
  const projectUnchecked: MetadataProjection<unknown> = (input) =>
    projectMetadata === undefined
      ? input.agentMetadata
      : projectMetadata(input);
  const project: MetadataProjection<Metadata> = (input) => {
    const metadata = projectUnchecked(input);
    // Without a schema, MetadataContract has already fixed Metadata to unknown.
    if (metadata === undefined || metadataSchema === undefined) {
      return metadata as Metadata | undefined;
    }
    const checked = checkMetadata(metadataSchema, metadata);
    if ("error" in checked) throw checked.error;
    return checked.value;
  };

  return {
    chatTransport: (options) =>
      createFlueChatTransport({
        ...options,
        ...toolProjection,
        projectMetadata: project,
      }),
    // Like the AI SDK with streamed chunks, tool parts take the host's tool
    // types unchecked; only metadata has a schema.
    reopen: (history) =>
      snapshotToUiMessages(history, {
        ...toolProjection,
        projectMetadata: projectUnchecked,
      }).map((message) => {
        if (message.metadata === undefined || metadataSchema === undefined) {
          return message;
        }
        const checked = checkMetadata(metadataSchema, message.metadata);
        if ("value" in checked) return { ...message, metadata: checked.value };
        if (!reportedInvalidMessageIds.has(message.id)) {
          reportedInvalidMessageIds.add(message.id);
          const invalid = { messageId: message.id, error: checked.error };
          queueMicrotask(() =>
            notifyObserver(onInvalidReopenedMetadata, invalid),
          );
        }
        return { ...message, metadata: undefined };
      }) as UiMessage[],
  };
};
