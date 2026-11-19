import {
  browserToolEnvelopeOf,
  browserToolFacts,
  parseClientToolResultMetadata,
  readRecordedCall,
} from "@hashintel/brunch-agent";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import type { FlueConversationSnapshot } from "@flue/sdk";
import type { NetCallCore } from "@hashintel/brunch-agent";

export interface NetCall extends NetCallCore {
  readonly messageIndex: number;
  readonly partIndex: number;
}

/**
 * One chronological projection of the browser's settled results, without
 * replay. Each call is under the tool of today that takes it, and in that
 * tool's keys: a conversation may have recorded it under older ones.
 */
export const netCalls = (snapshot: FlueConversationSnapshot): NetCall[] =>
  snapshot.messages.flatMap((message, messageIndex) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part, partIndex) => {
          if (part.type !== "dynamic-tool" || part.state !== "output-available")
            return [];
          const { toolName, input } = readRecordedCall(
            part.toolName,
            part.input,
          );
          if (!browserToolFacts(toolName).runsOnNet) return [];
          const envelope = browserToolEnvelopeOf(part.output);
          if (!envelope) return [];
          const recordedMetadata = envelope.metadata;
          const metadata = parseClientToolResultMetadata(recordedMetadata);
          return [
            {
              toolCallId: part.toolCallId,
              toolName,
              input,
              output: envelope.output,
              revisionBefore: metadata?.documentRevision.before,
              revisionAfter: metadata?.documentRevision.after,
              metadata: recordedMetadata,
              messageIndex,
              partIndex,
            },
          ];
        })
      : [],
  );

/** Where an assistant tool call sits in the conversation, by message and part index. */
const toolCallPosition = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
) =>
  snapshot.messages
    .flatMap((message, messageIndex) =>
      message.role === "assistant" && message.purpose === "assistant"
        ? message.parts.flatMap((part, partIndex) =>
            part.type === "dynamic-tool" && part.toolCallId === toolCallId
              ? [{ messageIndex, partIndex }]
              : [],
          )
        : [],
    )
    .at(0);

/**
 * The `getLatestNetDefinition` read an experiment draft is prepared from. A
 * filtered reader does not count: the browser, the draft's tool description
 * and admission all require the complete definition.
 */
export const latestCanonicalNetReadBefore = (
  snapshot: FlueConversationSnapshot,
  toolCallId: string,
): NetCall | undefined => {
  const calls = netCalls(snapshot);
  const position = toolCallPosition(snapshot, toolCallId);
  if (!position) return undefined;
  return calls.findLast(
    (call) =>
      call.toolName === getLatestNetDefinitionToolName &&
      (call.messageIndex < position.messageIndex ||
        (call.messageIndex === position.messageIndex &&
          call.partIndex < position.partIndex)),
  );
};
