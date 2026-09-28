/**
 * Whether the model still sees a current view of the bound net. The context
 * projection reports which net results the model's next request carries; a
 * document change is issued only against the revision of the latest one, and
 * the browser refuses it if the document has since moved by other means.
 */

import {
  browserToolMutatesDocument,
  isNetObservationTool,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";

import { inBandBrowserToolNames } from "../agents/chat-agent/tool-catalogue.ts";

import type { ContextProjectionEntry } from "@flue/runtime";
import type { FlueConversationSnapshot } from "@flue/sdk";

/** A read of the net or a settled change to it both tell the model its state. */
const informsNetView = (toolName: string): boolean =>
  inBandBrowserToolNames.has(toolName) &&
  (isNetObservationTool(toolName) || browserToolMutatesDocument(toolName));

/** Tool call ids of net results present in one conversation's model context. */
export type NetView = ReadonlySet<string>;

/**
 * Process-local, keyed by agent instance. Every proposal is preceded by a
 * model request in the same process, whose projection records the view first.
 */
export const createNetViewTracker = () => {
  const views = new Map<string, NetView>();
  return {
    observe: (
      instanceId: string,
      entries: readonly ContextProjectionEntry[],
    ): void => {
      views.set(
        instanceId,
        new Set(
          entries.flatMap(({ message }) =>
            message.role === "toolResult" &&
            !message.isError &&
            informsNetView(message.toolName)
              ? [message.toolCallId]
              : [],
          ),
        ),
      );
    },
    view: (instanceId: string): NetView | undefined => views.get(instanceId),
  };
};

export const netViewTracker = createNetViewTracker();

export const noNetViewRefusal = `Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (readNetOutline, readNetStructure or ${getLatestNetDefinitionToolName}), then make the change.`;

/**
 * The revision of the latest net result before `toolCallId` that the model
 * can still see. Reads carry the revision they observed; a change carries the
 * revision it produced.
 */
export const expectedNetRevision = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
  view: NetView | undefined,
): { readonly revision: string } | { readonly refusal: string } => {
  let revision: string | undefined;
  for (const message of snapshot.messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      if (part.toolCallId === toolCallId)
        return revision === undefined
          ? { refusal: noNetViewRefusal }
          : { revision };
      if (
        part.state !== "output-available" ||
        !view?.has(part.toolCallId) ||
        !informsNetView(part.toolName) ||
        typeof part.output !== "object" ||
        part.output === null ||
        !("metadata" in part.output)
      )
        continue;
      const observed = parseClientToolResultMetadata(
        part.output.metadata,
      )?.documentRevision;
      revision = observed?.after ?? observed?.before ?? revision;
    }
  }
  throw new Error(
    `Conversation history does not contain browser call ${toolCallId}.`,
  );
};
