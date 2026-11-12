/**
 * Project the watched views of one followed submission onto AI SDK UI message
 * chunks, in the shape `@local/flue-aisdk-transport`'s `createFlueUiStream`
 * writes for the same logical turn. Pure state over views: each view is the
 * whole committed window, so the projector diffs against what it already
 * wrote, and a fresh projector over a reattached follow starts from the
 * committed view.
 *
 * The response's committed entries go through one writer, which the history
 * route (`projectResponseEntries`) runs over stored entries too, so a
 * reopened conversation shows each response with the live stream's message
 * ID and parts.
 *
 * A hand-edit note that lands inside the response (at a `postTools`
 * boundary) is a `data-brunch-hand-edit` part, written just before the next
 * committed output after it, so a note after the response's last output
 * (at its `final` boundary, or between turns) is never part of it.
 */
import { handEditEntryKind } from "../../../net-state/visible-net-view";
import {
  crashLoopErrorText,
  stoppedByCrashLoop,
} from "../conversation-registry/crash-loop-guard";

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

/**
 * The UI message the answer to the input placed as entry `input` streams
 * into: stable across follows, so a reconnect continues it, and derived from
 * the stored entry, so the history route names it the same.
 */
export const responseMessageId = (input: EntryId) => `durable:${input}`;

/** The UI part a hand-edit note is shown as, with the note entry's `data`. */
export const handEditPartType = "data-brunch-hand-edit";

/** The ID of a hand-edit note's data part. */
export const handEditPartId = (note: EntryId) => `durable:note:${note}`;

const isHandEditNote = (entry: EntryRecord) => entry.kind === handEditEntryKind;

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

/** A browser tool's real output: Brunch's branded envelope in `details`, exactly as stored. */
const browserOutput = (
  message: ToolResultMessage,
): { readonly output: unknown } | undefined => {
  const details: unknown = message.details;
  return typeof details === "object" &&
    details !== null &&
    "brunchBrowserResult" in details &&
    details.brunchBrowserResult === true &&
    "output" in details
    ? { output: details.output }
    : undefined;
};

/**
 * A tool result's output as the UI sees it: a browser tool's real output from
 * its `details`, whatever the model was sent; otherwise the text, as JSON
 * when it is JSON.
 */
const toolOutput = (message: ToolResultMessage, text: string): unknown => {
  const browser = browserOutput(message);
  if (browser !== undefined) return browser.output;
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

/**
 * The writer of one response message: its start, steps, parts, tool calls and
 * results, and the hand-edit notes inside it, from committed entries and, live,
 * the streaming partial.
 */
const createResponseWriter = (
  options: ProjectionOptions,
  write: (chunk: UIMessageChunk) => void,
) => {
  let messageId: string | undefined;
  let partOrdinal = 0;
  /** Parts of the open step by content index, across partial and committed forms. */
  let openStep: Map<number, StreamingPart> | undefined;
  /** The generation attempt whose partial streamed into the open step. */
  let openStepAttempt: number | undefined;
  const processedEntries = new Set<EntryId>();
  const endedParts = new Set<string>();
  const toolInputs = new Set<string>();
  const toolOutputs = new Set<string>();
  /** Notes seen since the last output, written before the next one. */
  const pendingNotes: EntryRecord[] = [];
  /** Notes seen before the response started. */
  const notesBefore: EntryRecord[] = [];

  const dynamic = (toolName: string): true | undefined =>
    options.dynamicClientToolNames?.has(toolName) === true ? true : undefined;

  const ensureStarted = (id: string) => {
    if (messageId !== undefined) return;
    messageId = id;
    write({ type: "start", messageId });
  };

  /** Write the notes seen since the last output: more output follows them, so they are inside the response. */
  const flushNotes = () => {
    for (const note of pendingNotes.splice(0)) {
      write({
        type: handEditPartType,
        id: handEditPartId(note.id),
        data: note.data ?? null,
      });
    }
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
    flushNotes();
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
            output: toolOutput(result, text),
            providerExecuted: true,
          },
    );
  };

  /**
   * Project one committed entry of the response, once: an assistant message,
   * a tool result, or a hand-edit note. Anything else, such as a prune write,
   * a compaction summary or another input, is not part of the response.
   */
  const projectEntry = (entry: EntryRecord, responseId: string) => {
    if (processedEntries.has(entry.id)) return;
    const assistant = assistantOf(entry);
    const result = toolResultOf(entry);
    if (assistant !== undefined) {
      processedEntries.add(entry.id);
      ensureStarted(responseId);
      flushNotes();
      ensureStep();
      projectContent(assistant, true);
      finishStep();
    } else if (result !== undefined && !toolOutputs.has(result.toolCallId)) {
      processedEntries.add(entry.id);
      projectToolResult(entry, result);
    } else if (isHandEditNote(entry)) {
      processedEntries.add(entry.id);
      // Before the response started, a note is not part of it.
      if (messageId === undefined) notesBefore.push(entry);
      else pendingNotes.push(entry);
    }
  };

  /** Project the streaming partial of generation `attempt`. */
  const projectPartial = (
    content: AssistantMessage["content"],
    attempt: number,
    responseId: string,
  ) => {
    ensureStarted(responseId);
    // A retried attempt streams from its own start: the failed attempt's parts stay in their own step.
    if (openStepAttempt !== undefined && openStepAttempt !== attempt)
      finishStep();
    flushNotes();
    projectContent({ content }, false);
    openStepAttempt = attempt;
  };

  return {
    projectEntry,
    projectPartial,
    finishStep,
    isProcessed: (entry: EntryId) => processedEntries.has(entry),
    /** Notes before the response started, which are not part of it. */
    notesBefore: (): readonly EntryRecord[] => notesBefore,
    /** Notes after the response's last output so far, which no output has placed inside it. */
    notesAfter: (): readonly EntryRecord[] => pendingNotes,
  };
};

/**
 * The chunks of the response to the input placed as entry `input`, from
 * `entries`, the committed entries after it up to the next input, as the
 * live stream writes them for the same entries; and the hand-edit notes
 * outside it, before its first output and after its last.
 */
export const projectResponseEntries = (
  input: EntryId,
  entries: readonly EntryRecord[],
  options: ProjectionOptions,
): {
  readonly chunks: readonly UIMessageChunk[];
  readonly notesBefore: readonly EntryRecord[];
  readonly notesAfter: readonly EntryRecord[];
} => {
  const chunks: UIMessageChunk[] = [];
  const writer = createResponseWriter(options, (chunk) => chunks.push(chunk));
  const responseId = responseMessageId(input);
  for (const entry of entries) writer.projectEntry(entry, responseId);
  return {
    chunks,
    notesBefore: writer.notesBefore(),
    notesAfter: writer.notesAfter(),
  };
};

export const createViewProjector = (
  options: ProjectionOptions,
  write: (chunk: UIMessageChunk) => void,
) => {
  let finished = false;
  let anchorSeen = false;
  const writer = createResponseWriter(options, write);

  /** Where the submission's response starts in `view`, and its input entry; undefined when not placed yet. */
  const responseStart = (
    submission: SubmissionRecord,
    view: ConversationView,
  ): { readonly start: number; readonly input: EntryId } | undefined => {
    if (submission.type !== "input" || submission.entry === undefined)
      return undefined;
    const input = submission.entry;
    const anchor = view.entries.findIndex(({ id }) => id === input);
    if (anchor !== -1) {
      anchorSeen = true;
      return { start: anchor + 1, input };
    }
    // The window drops its oldest entries in one splice; once the anchor was seen, all that is left follows it.
    return anchorSeen ? { start: 0, input } : undefined;
  };

  /** A user's stop ends in `abort`; the crash-loop guard's, which the transcript records, and any failure in `error`. */
  const settleUnanswered = (
    submission: Extract<SubmissionRecord, { status: "unanswered" }>,
    view: ConversationView,
  ) => {
    writer.finishStep();
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
    const response = responseStart(submission, view);
    if (response === undefined) {
      // Withdrawn while queued: it never reached the transcript.
      if (submission.status === "unanswered")
        settleUnanswered(submission, view);
      return;
    }
    const responseId = responseMessageId(response.input);

    for (const entry of view.entries.slice(response.start)) {
      writer.projectEntry(entry, responseId);
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
      writer.projectPartial(
        partial.content as AssistantMessage["content"],
        generation.attempt,
        responseId,
      );
    }

    if (submission.type === "input" && submission.status === "done") {
      if (!writer.isProcessed(submission.answer)) return;
      writer.finishStep();
      finished = true;
      write({ type: "finish", finishReason: "stop" });
    } else if (submission.status === "unanswered") {
      settleUnanswered(submission, view);
    }
  };

  return { accept, isFinished: () => finished };
};
