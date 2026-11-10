import {
  crashLoopErrorText,
  stoppedByCrashLoop,
} from "../conversation-registry/crash-loop-guard";

/**
 * Project the watched views of one followed submission onto AI SDK UI message
 * chunks, in the shape `@local/flue-aisdk-transport`'s `createFlueUiStream`
 * writes for the same logical turn. Pure state over views: each view is the
 * whole committed window, so the projector diffs against what it already
 * wrote, and a fresh projector over a reattached follow starts from the
 * committed view.
 */
import type {
  AssistantMessage,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import type {
  ConversationView,
  EntryId,
  EntryRecord,
  LiveState,
  SubmissionRecord,
  ToolDiagnostic,
} from "@earendil-works/pi-durable";
import type { UIMessageChunk } from "ai";

/** One view of the conversation and the followed submission's record read after it. */
export type ViewFrame = {
  readonly submission: SubmissionRecord;
  readonly view: ConversationView;
};

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

/** The UI message a submission's answer streams into: stable across follows, so a reconnect continues it. */
export const responseMessageId = (submission: SubmissionRecord) =>
  `durable:${submission.id}`;

const partText = (part: ContentPart): string | undefined => {
  if (part.type === "text") return part.text;
  if (part.type === "thinking") return part.thinking;
  return undefined;
};

/** The block a tool result's content ends with when it carries diagnostics. */
const diagnosticsBlock = /\n*<harness>\n[\s\S]*\n<\/harness>$/u;

const diagnosticsOf = (entry: EntryRecord): readonly ToolDiagnostic[] => {
  const data = entry.data as
    | { diagnostics?: readonly ToolDiagnostic[] }
    | undefined;
  return data?.diagnostics ?? [];
};

/** A tool result's text for the UI: the tool's own output, without the model-facing diagnostics block. */
const toolResultText = (
  entry: EntryRecord,
  message: ToolResultMessage,
): string => {
  const text = message.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  return diagnosticsOf(entry).length > 0
    ? text.replace(diagnosticsBlock, "")
    : text;
};

/** A tool result's output as the UI sees it: the browser's JSON when the text is JSON. */
const toolOutput = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/** A failed call's error text: what the tool said, then the error diagnostics the Harness recorded. */
const toolErrorText = (entry: EntryRecord, text: string): string =>
  [
    text,
    ...diagnosticsOf(entry)
      .filter(({ severity }) => severity === "error")
      .map(({ message }) => message),
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

/** An unanswered submission's error text: the run's own detail when it has one, as for a model error. */
const runErrorText = (
  submission: Extract<SubmissionRecord, { status: "unanswered" }>,
): string => {
  const { reason, detail } = submission;
  if (detail === undefined) return reason;
  return typeof detail === "string"
    ? detail
    : `${reason}: ${JSON.stringify(detail)}`;
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
  let anchorSeen = false;
  let partOrdinal = 0;
  /** Parts of the open step by content index, across partial and committed forms. */
  let openStep: Map<number, StreamingPart> | undefined;
  /** The generation attempt whose partial streamed into the open step. */
  let openStepAttempt: number | undefined;
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
    openStepAttempt = undefined;
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

  const projectToolResult = (entry: EntryRecord, result: ToolResultMessage) => {
    toolOutputs.add(result.toolCallId);
    if (!toolInputs.has(result.toolCallId)) return;
    const text = toolResultText(entry, result);
    write(
      result.isError
        ? {
            type: "tool-output-error",
            toolCallId: result.toolCallId,
            errorText: toolErrorText(entry, text),
            providerExecuted: true,
          }
        : {
            type: "tool-output-available",
            toolCallId: result.toolCallId,
            output: toolOutput(text),
            providerExecuted: true,
          },
    );
  };

  /** Where the submission's response starts in `view`, or undefined when not placed yet. */
  const responseStart = (
    submission: SubmissionRecord,
    view: ConversationView,
  ): number | undefined => {
    if (submission.type !== "input" || submission.entry === undefined)
      return undefined;
    const anchor = view.entries.findIndex(({ id }) => id === submission.entry);
    if (anchor !== -1) {
      anchorSeen = true;
      return anchor + 1;
    }
    // The window drops its oldest entries in one splice; once the anchor was seen, all that is left follows it.
    return anchorSeen ? 0 : undefined;
  };

  /** A user's stop ends in `abort`; the crash-loop guard's, which the transcript records, and any failure in `error`. */
  const settleUnanswered = (
    submission: Extract<SubmissionRecord, { status: "unanswered" }>,
    view: ConversationView,
  ) => {
    finishStep();
    finished = true;
    if (submission.reason !== "aborted")
      write({ type: "error", errorText: runErrorText(submission) });
    else if (stoppedByCrashLoop(view.entries, submission.id))
      write({ type: "error", errorText: crashLoopErrorText });
    else write({ type: "abort", reason: "The chat turn aborted." });
  };

  const accept = (frame: ViewFrame): void => {
    if (finished) return;
    const { submission, view } = frame;
    const start = responseStart(submission, view);
    if (start === undefined) {
      // Withdrawn while queued: it never reached the transcript.
      if (submission.status === "unanswered")
        settleUnanswered(submission, view);
      return;
    }
    const responseId = responseMessageId(submission);

    for (const entry of view.entries.slice(start)) {
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
        projectToolResult(entry, result);
      }
      if (submission.status === "done" && entry.id === submission.answer) break;
    }

    const live = view.docs["pi.live"] as LiveState | undefined;
    const generation = live?.generation;
    const partial = generation?.message;
    if (
      generation !== undefined &&
      partial !== undefined &&
      live?.run?.inputs.includes(submission.id) === true
    ) {
      ensureStarted(responseId);
      // A retried attempt streams from its own start: the failed attempt's parts stay in their own step.
      if (
        openStepAttempt !== undefined &&
        openStepAttempt !== generation.attempt
      )
        finishStep();
      projectContent(
        { content: partial.content as AssistantMessage["content"] },
        false,
      );
      openStepAttempt = generation.attempt;
    }

    if (submission.type === "input" && submission.status === "done") {
      if (!processedEntries.has(submission.answer)) return;
      finishStep();
      finished = true;
      write({ type: "finish", finishReason: "stop" });
    } else if (submission.status === "unanswered") {
      settleUnanswered(submission, view);
    }
  };

  return { accept, isFinished: () => finished };
};
