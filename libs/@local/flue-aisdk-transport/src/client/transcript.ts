import type { MetadataProjection } from "./shared/metadata-projection";
import type { FlueUiProjectionOptions } from "./ui-stream";
import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

type UiMessagePart = UIMessage["parts"][number];

/** A reopened transcript never carries `system` messages. */
export type UiHistoryMessage<Metadata = unknown> = Omit<
  UIMessage<Metadata>,
  "role"
> & {
  role: Extract<UIMessage["role"], "assistant" | "user">;
};

export type FlueHistory = Pick<FlueConversationState, "messages"> &
  Partial<Pick<FlueConversationState, "settlements">>;

const unhandledConversationPart = (part: never): never => {
  throw new Error(`Unhandled Flue conversation part: ${JSON.stringify(part)}`);
};

const isFlueDataPart = (
  part: FlueConversationPart,
): part is Extract<FlueConversationPart, { type: `data-${string}` }> =>
  part.type.startsWith("data-");

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  options: FlueUiProjectionOptions,
): UiMessagePart => {
  const toolIdentity =
    options.dynamicClientToolNames?.has(part.toolName) === true
      ? ({ type: "dynamic-tool", toolName: part.toolName } as const)
      : ({ type: `tool-${part.toolName}` } as const);
  const input =
    options.clientToolNames.has(part.toolName) &&
    options.mapClientToolInput !== undefined
      ? options.mapClientToolInput({
          input: part.input,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
        })
      : part.input;
  switch (part.state) {
    case "output-error":
      return {
        ...toolIdentity,
        toolCallId: part.toolCallId,
        state: "output-error",
        input,
        errorText: part.errorText,
        providerExecuted: true,
      };
    case "output-available":
      return {
        ...toolIdentity,
        toolCallId: part.toolCallId,
        state: "output-available",
        input,
        output:
          options.mapToolOutput === undefined
            ? part.output
            : options.mapToolOutput(part.output),
        providerExecuted: true,
      };
    case "input-available":
      return {
        ...toolIdentity,
        toolCallId: part.toolCallId,
        state: "input-available",
        input,
        providerExecuted: true,
      };
    default:
      return unhandledConversationPart(part);
  }
};

const partsFrom = (
  message: FlueConversationMessage,
  options: FlueUiProjectionOptions,
): UiMessagePart[] => {
  const parts: UiMessagePart[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      parts.push({ type: "text", text: part.text, state: "done" });
      continue;
    }
    if (part.type === "reasoning") {
      parts.push({ type: "reasoning", text: part.text, state: "done" });
      continue;
    }
    if (part.type === "dynamic-tool") {
      parts.push(toolPartFrom(part, options));
      continue;
    }
    if (part.type === "file") {
      parts.push({
        type: "file",
        mediaType: part.mediaType,
        url: part.url ?? "",
        filename: part.filename,
      });
      continue;
    }
    if (isFlueDataPart(part)) {
      parts.push({ type: part.type, data: part.data });
      continue;
    }
    unhandledConversationPart(part);
  }
  return parts;
};

/**
 * Each submission's outcome. An aborted submission also stops the response
 * of the submission that answered it.
 */
const outcomesBySubmission = (
  settlements: readonly FlueConversationSettlement[],
): ReadonlyMap<string, FlueConversationSettlement["outcome"]> => {
  const outcomes = new Map<string, FlueConversationSettlement["outcome"]>();
  for (const { submissionId, outcome } of settlements) {
    outcomes.set(submissionId, outcome);
  }
  for (const { answeredBySubmissionId, outcome } of settlements) {
    if (outcome === "aborted" && answeredBySubmissionId !== undefined) {
      outcomes.set(answeredBySubmissionId, outcome);
    }
  }
  return outcomes;
};

export const snapshotToUiMessages = <Metadata>(
  snapshot: FlueHistory,
  options: FlueUiProjectionOptions<Metadata> & {
    readonly projectMetadata: MetadataProjection<Metadata>;
  },
): UiHistoryMessage<Metadata>[] => {
  const messages: UiHistoryMessage<Metadata>[] = [];
  const outcomes = outcomesBySubmission(snapshot.settlements ?? []);
  for (const message of snapshot.messages) {
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = partsFrom(message, options);
    if (parts.length === 0) continue;
    const outcome =
      message.submissionId === undefined
        ? undefined
        : outcomes.get(message.submissionId);
    messages.push({
      id: message.id,
      role: message.role,
      parts,
      metadata:
        message.role === "assistant"
          ? options.projectMetadata({
              agentMetadata: message.metadata,
              outcome,
            })
          : undefined,
    });
  }
  return messages;
};
