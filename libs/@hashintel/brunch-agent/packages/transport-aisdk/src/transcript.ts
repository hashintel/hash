import type { ClientToolProjectionOptions } from "./ui-stream";
import type {
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationState,
} from "@flue/sdk";
import type { UIMessage } from "ai";

type UiMessagePart = UIMessage["parts"][number];

interface UiHistoryMessageMetadata {
  readonly stopped?: true;
}

/** A reopened transcript never carries `system` messages. */
export type UiHistoryMessage = Omit<
  UIMessage<UiHistoryMessageMetadata>,
  "role"
> & {
  role: Extract<UIMessage["role"], "assistant" | "user">;
};

export type SnapshotToUiMessagesOptions = ClientToolProjectionOptions;

const unhandledConversationPart = (part: never): never => {
  throw new Error(`Unhandled Flue conversation part: ${JSON.stringify(part)}`);
};

const isFlueDataPart = (
  part: FlueConversationPart,
): part is Extract<FlueConversationPart, { type: `data-${string}` }> =>
  part.type.startsWith("data-");

const toolPartFrom = (
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>,
  options: SnapshotToUiMessagesOptions,
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
  if (part.state === "output-error") {
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "output-error",
      input,
      errorText: part.errorText,
      providerExecuted: true,
    };
  }
  if (part.state === "output-available") {
    const output = part.output;
    return {
      ...toolIdentity,
      toolCallId: part.toolCallId,
      state: "output-available",
      input,
      output:
        typeof output === "object" &&
        output !== null &&
        "brunchBrowserResult" in output &&
        output.brunchBrowserResult === true &&
        "output" in output
          ? output.output
          : output,
      providerExecuted: true,
    };
  }
  return {
    ...toolIdentity,
    toolCallId: part.toolCallId,
    state: "input-available",
    input,
    providerExecuted: true,
  };
};

const partsFrom = (
  message: FlueConversationMessage,
  options: SnapshotToUiMessagesOptions,
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
        ...(part.filename === undefined ? {} : { filename: part.filename }),
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

export const snapshotToUiMessages = (
  snapshot: Pick<FlueConversationState, "messages"> &
    Partial<Pick<FlueConversationState, "settlements">>,
  options: SnapshotToUiMessagesOptions,
): UiHistoryMessage[] => {
  const messages: UiHistoryMessage[] = [];
  const abortedSubmissions = new Set(
    snapshot.settlements
      ?.filter(({ outcome }) => outcome === "aborted")
      .flatMap(({ submissionId, answeredBySubmissionId }) =>
        answeredBySubmissionId === undefined
          ? [submissionId]
          : [submissionId, answeredBySubmissionId],
      ),
  );
  for (const message of snapshot.messages) {
    if (message.display !== "visible") continue;
    if (message.purpose !== "user" && message.purpose !== "assistant") continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = partsFrom(message, options);
    if (parts.length === 0) continue;
    const stopped =
      message.role === "assistant" &&
      message.submissionId !== undefined &&
      abortedSubmissions.has(message.submissionId);
    messages.push({
      id: message.id,
      role: message.role,
      parts,
      ...(stopped ? { metadata: { stopped: true } } : {}),
    });
  }
  return messages;
};
