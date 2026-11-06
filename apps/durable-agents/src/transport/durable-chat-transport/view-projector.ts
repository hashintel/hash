/**
 * Project the frames of one followed submission onto AI SDK UI message
 * chunks, in the shape `@local/flue-aisdk-transport`'s `createFlueUiStream`
 * writes for the same logical turn. Pure state over frames: each frame is a
 * whole view, so the projector diffs against what it already wrote and a
 * fresh projector over a reattached stream starts from the committed view.
 */
import type { ChatFrame } from "../shared/chat-frame";
import type {
  AssistantMessage,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import type {
  EntryId,
  EntryRecord,
  LiveState,
} from "@earendil-works/pi-durable";
import type { UIMessageChunk } from "ai";

export type ProjectionOptions = {
  /** Tools the browser runs: their input chunks omit `providerExecuted`, so `onToolCall` fires. */
  readonly clientToolNames: ReadonlySet<string>;
  readonly dynamicClientToolNames?: ReadonlySet<string>;
};

type StreamingPart = {
  readonly id: string;
  readonly kind: "text" | "reasoning";
  emitted: number;
};

type ContentPart = AssistantMessage["content"][number];

const partText = (part: ContentPart): string | undefined => {
  if (part.type === "text") return part.text;
  if (part.type === "thinking") return part.thinking;
  return undefined;
};

/** A tool result's output as the UI sees it: the browser's JSON when the text is JSON. */
const toolOutput = (message: ToolResultMessage): unknown => {
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const assistantOf = (entry: EntryRecord): AssistantMessage | undefined => {
  const message = entry.model?.[0];
  return message?.role === "assistant" ? message : undefined;
};

const toolResultOf = (entry: EntryRecord): ToolResultMessage | undefined => {
  const message = entry.model?.[0];
  return message?.role === "toolResult" ? message : undefined;
};

export const createViewProjector = (
  options: ProjectionOptions,
  write: (chunk: UIMessageChunk) => void,
) => {
  let messageId: string | undefined;
  let finished = false;
  let partOrdinal = 0;
  /** Parts of the open step by content index, across partial and committed forms. */
  let openStep: Map<number, StreamingPart> | undefined;
  const processedEntries = new Set<EntryId>();
  const endedParts = new Set<string>();
  const toolInputs = new Set<string>();
  const toolOutputs = new Set<string>();

  const dynamic = (toolName: string): true | undefined =>
    options.dynamicClientToolNames?.has(toolName) === true ? true : undefined;

  const ensureStarted = (id: string) => {
    if (messageId !== undefined) return;
    messageId = id;
    write({ type: "start", messageId });
  };

  const ensureStep = (): Map<number, StreamingPart> => {
    if (openStep !== undefined) return openStep;
    openStep = new Map();
    write({ type: "start-step" });
    return openStep;
  };

  const endPart = (part: StreamingPart) => {
    if (endedParts.has(part.id)) return;
    endedParts.add(part.id);
    write({ type: `${part.kind}-end`, id: part.id });
  };

  const endOpenParts = () => {
    for (const part of openStep?.values() ?? []) endPart(part);
  };

  const finishStep = () => {
    if (openStep === undefined) return;
    endOpenParts();
    openStep = undefined;
    write({ type: "finish-step" });
  };

  /** Write the part at `index` up to `text`; parts before it end, as one part streams at a time. */
  const streamPart = (
    index: number,
    kind: StreamingPart["kind"],
    text: string,
  ) => {
    const step = ensureStep();
    let part = step.get(index);
    if (part === undefined) {
      endOpenParts();
      partOrdinal += 1;
      part = { id: `${messageId}:${kind}:${partOrdinal}`, kind, emitted: 0 };
      step.set(index, part);
      write({ type: `${kind}-start`, id: part.id });
    }
    if (text.length > part.emitted && !endedParts.has(part.id)) {
      write({
        type: `${kind}-delta`,
        id: part.id,
        delta: text.slice(part.emitted),
      });
      part.emitted = text.length;
    }
  };

  const writeToolInput = (
    toolCallId: string,
    toolName: string,
    input: unknown,
  ) => {
    if (toolInputs.has(toolCallId)) return;
    toolInputs.add(toolCallId);
    endOpenParts();
    const isClientTool = options.clientToolNames.has(toolName);
    write({
      type: "tool-input-available",
      toolCallId,
      toolName,
      input,
      providerExecuted: isClientTool ? undefined : true,
      dynamic: dynamic(toolName),
    });
  };

  /**
   * Streamed and committed forms share content indices; write what each adds.
   * A streamed tool call's arguments are incomplete, so only a committed one is
   * written, as Flue's canonical stream does.
   */
  const projectContent = (
    message: Pick<AssistantMessage, "content">,
    committed: boolean,
  ) => {
    message.content.forEach((part, index) => {
      const text = partText(part);
      if (text !== undefined) {
        streamPart(
          index,
          part.type === "thinking" ? "reasoning" : "text",
          text,
        );
      } else if (part.type === "toolCall" && committed) {
        ensureStep();
        writeToolInput(part.id, part.name, part.arguments);
      }
    });
  };

  const accept = (frame: ChatFrame): void => {
    if (finished) return;
    const { submission, view } = frame;
    if (submission.type !== "input" || submission.entry === undefined) return;
    const anchor = view.entries.findIndex(({ id }) => id === submission.entry);
    // Spike: a run longer than the watch window loses its anchor.
    if (anchor === -1) return;
    const responseId = `durable:${submission.id}`;

    for (const entry of view.entries.slice(anchor + 1)) {
      if (processedEntries.has(entry.id)) continue;
      const assistant = assistantOf(entry);
      const result = toolResultOf(entry);
      if (assistant !== undefined) {
        processedEntries.add(entry.id);
        ensureStarted(responseId);
        ensureStep();
        projectContent(assistant, true);
        finishStep();
      } else if (result !== undefined && !toolOutputs.has(result.toolCallId)) {
        processedEntries.add(entry.id);
        toolOutputs.add(result.toolCallId);
        if (!toolInputs.has(result.toolCallId)) continue;
        write(
          result.isError
            ? {
                type: "tool-output-error",
                toolCallId: result.toolCallId,
                errorText: toolOutput(result) as string,
                providerExecuted: true,
              }
            : {
                type: "tool-output-available",
                toolCallId: result.toolCallId,
                output: toolOutput(result),
                providerExecuted: true,
              },
        );
      }
      if (submission.status === "done" && entry.id === submission.answer) break;
    }

    const live = view.docs["pi.live"] as LiveState | undefined;
    const partial = live?.generation?.message;
    if (live?.run?.inputs.includes(submission.id) && partial !== undefined) {
      ensureStarted(responseId);
      projectContent(
        { content: partial.content as AssistantMessage["content"] },
        false,
      );
    }

    if (submission.status === "done") {
      if (!processedEntries.has(submission.answer)) return;
      finishStep();
      finished = true;
      write({ type: "finish", finishReason: "stop" });
    } else if (submission.status === "unanswered") {
      finishStep();
      finished = true;
      write(
        submission.reason === "aborted"
          ? { type: "abort", reason: "The chat turn aborted." }
          : {
              type: "error",
              errorText: `${submission.reason}${submission.detail === undefined ? "" : `: ${JSON.stringify(submission.detail)}`}`,
            },
      );
    }
  };

  return { accept, isFinished: () => finished };
};
