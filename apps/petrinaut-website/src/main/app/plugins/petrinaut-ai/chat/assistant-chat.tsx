/**
 * Petrinaut AI's chat: transcript, composer and the built-in AI tools, which
 * the Petrinaut AI plugin renders as its `assistant.content`. It reaches the
 * editor only through the plugin `api` it is given.
 *
 * @layerRoot website.plugins.petrinaut-ai-chat
 * @role Petrinaut AI's chat: transcript, composer and the built-in AI tools, through the plugin `api`
 */

import { useChat } from "@ai-sdk/react";
import {
  getStaticToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ToolUIPart,
} from "ai";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  useAssistantPanel,
  useStoreSelector,
} from "@hashintel/petrinaut/ui/plugin";

import {
  type AssistantChatApi,
  AssistantChatApiContext,
} from "./assistant-chat/chat-api";
import { ChatView } from "./assistant-chat/chat-view";
import { selectPromptChips } from "./assistant-chat/chat-view/select-prompt-chips";
import { createDiagnosticsAwareAiTransport } from "./assistant-chat/create-diagnostics-aware-ai-transport";
import { createReasoningTimingAwareAiTransport } from "./assistant-chat/create-reasoning-timing-aware-ai-transport";
import { finalizeStreamingMessageParts } from "./assistant-chat/finalize-streaming-message-parts";
import { getInteractiveTool } from "./assistant-chat/interactive-tools/registry";
import { readCurrentDiagnostics } from "./assistant-chat/read-current-diagnostics";
import {
  applyAutoLayout,
  type BuiltInToolCall,
  runBuiltInTool,
} from "./assistant-chat/run-built-in-tool";
import { useExperimentRuns } from "./assistant-chat/use-experiment-runs";

import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
  PetrinautAiUiTools,
} from "./ai-message";
import type { AssistantChatStart } from "./assistant-chat-start";
import type { AiToolOutput } from "./assistant-chat/tool-summaries";

type ToolPart = ToolUIPart<PetrinautAiUiTools>;

/** A tool call the browser answers, still without its output. */
const isOpenToolCall = (
  part: PetrinautAiMessage["parts"][number],
): part is ToolPart =>
  isStaticToolUIPart(part) &&
  part.providerExecuted !== true &&
  part.state === "input-available";

const toToolCall = (part: ToolPart): BuiltInToolCall => ({
  toolName: getStaticToolName<PetrinautAiUiTools>(part),
  toolCallId: part.toolCallId,
  input: part.input,
});

/** Names a reply's tool step by the reply's length, which grows once the reply continues. */
const stepOf = (message: PetrinautAiMessage | undefined) =>
  message && `${message.id}:${message.parts.length}`;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A message the transport refused before accepting it, with its text for the composer. */
class UnsentMessageError extends Error {
  constructor(
    readonly text: string,
    cause: unknown,
  ) {
    super(errorText(cause), { cause });
  }
}

/**
 * Marks the transport's refusals, which a failure of an accepted message's
 * reply is not, and neither is a request Stop aborted.
 */
const markRefusals = (
  transport: PetrinautAiTransport,
): PetrinautAiTransport => ({
  reconnectToStream: (options) => transport.reconnectToStream(options),
  sendMessages: (options) =>
    transport.sendMessages(options).catch((cause: unknown) => {
      if (options.abortSignal?.aborted) {
        throw cause;
      }
      const message = options.messages.at(-1);
      throw new UnsentMessageError(
        message?.role === "user"
          ? message.parts
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("")
          : "",
        cause,
      );
    }),
});

/** The chat's `api`, which reaches the editor, and its conversation. */
export type AssistantChatProps = {
  readonly api: AssistantChatApi;
  /** Sends each request and streams the reply. */
  readonly transport: PetrinautAiTransport;
  /** The stored transcript the conversation starts from. */
  readonly messages?: PetrinautAiMessage[];
  /**
   * Receives the whole transcript each time a response ends or is stopped,
   * and `[]` when the user clears the conversation.
   */
  readonly onMessages?: (messages: PetrinautAiMessage[]) => void;
  /** The empty-net prompt's message, from `useAssistantChatStart`. */
  readonly start?: AssistantChatStart | null;
  /** Called once the chat has taken `start`. */
  readonly onStartHandled?: () => void;
};

/**
 * Petrinaut AI's chat, drawn in the assistant panel: render it as a plugin's
 * `assistant.content`.
 */
export const AssistantChat = ({
  api,
  transport,
  messages: initialMessages,
  onMessages,
  start = null,
  onStartHandled,
}: AssistantChatProps) => {
  const { document, errors, experiments, notifications } = api;
  const { isOpen } = useAssistantPanel();
  const isNetEmpty = useStoreSelector(
    document.net,
    (net) => net.places.length === 0 && net.transitions.length === 0,
  );
  const experimentRuns = useExperimentRuns(experiments);
  const [input, setInput] = useState("");
  const [stopped, setStopped] = useState(false);
  const [startedToolCalls, setStartedToolCalls] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The tool step whose calls the chat ran, which continues once they all have outputs.
  const [answeredStep, setAnsweredStep] = useState<string>();
  // Counts Clear presses, so a tool call answered after one drops its output.
  const clearsRef = useRef(0);

  const fail = (
    error: unknown,
    source: string,
    tags?: Record<string, string>,
  ) => {
    errors.capture(error, {
      source: `ai-assistant.${source}`,
      ...(tags && { tags }),
    });
    notifications.add({
      tone: "error",
      message: "AI assistant error",
      detail: errorText(error),
    });
  };

  const { messages, status, sendMessage, addToolOutput, setMessages, stop } =
    useChat<PetrinautAiMessage>({
      messages: initialMessages,
      // Timing wraps diagnostics so it tags the reply's chunks as they arrive.
      transport: markRefusals(
        createReasoningTimingAwareAiTransport(
          createDiagnosticsAwareAiTransport({
            readDiagnosticsContext: () => readCurrentDiagnostics(document),
            transport,
          }),
        ),
      ),
      // Every chunk re-renders the transcript; 80ms keeps it live without
      // locking the main thread on a long reply.
      experimental_throttle: 80,
      onError: (error) => {
        // A refused message goes back to the composer, unless the user typed since.
        if (error instanceof UnsentMessageError) {
          setInput((current) => current || error.text);
        }
        fail(
          error instanceof UnsentMessageError ? error.cause : error,
          "stream",
        );
      },
      onFinish: ({ messages: transcript, isAbort }) => {
        // Stop leaves the reply's last parts streaming; settle them first.
        const finished = isAbort
          ? finalizeStreamingMessageParts(transcript)
          : transcript;
        if (finished !== transcript) {
          setMessages(finished);
        }
        onMessages?.(finished);
      },
    });

  const lastMessage = messages.at(-1);
  const ready = status === "ready" && !stopped;
  const openToolCalls =
    ready && lastMessage?.role === "assistant"
      ? lastMessage.parts.filter(isOpenToolCall).map(toToolCall)
      : [];
  // An interactive call waits for its widget instead.
  const toolCallsToRun = openToolCalls.filter(
    (call) =>
      !startedToolCalls.has(call.toolCallId) && !getInteractiveTool(call),
  );
  const continues =
    ready &&
    answeredStep !== undefined &&
    answeredStep === stepOf(lastMessage) &&
    lastAssistantMessageIsCompleteWithToolCalls({ messages });
  // A turn lasts while its reply streams, its tool calls are open and it continues.
  const busy =
    status === "submitted" ||
    status === "streaming" ||
    openToolCalls.length > 0 ||
    continues;

  /** Gives a tool call its output, or its error, which ends the turn. */
  const answer = (
    { toolName, toolCallId }: { toolName: string; toolCallId: string },
    step: string | undefined,
    output: Promise<unknown>,
  ) => {
    const clears = clearsRef.current;
    const tags = { toolName, toolCallId };
    // `addToolOutput` types each output by its tool, which this call knows only by name.
    const addOutput = addToolOutput as (
      result: { tool: string; toolCallId: string } & (
        | { output: unknown }
        | { state: "output-error"; errorText: string }
      ),
    ) => Promise<void>;

    void output
      .then(
        (value) =>
          clears === clearsRef.current
            ? addOutput({ tool: toolName, toolCallId, output: value })
            : undefined,
        (error: unknown) => {
          if (clears !== clearsRef.current) {
            return;
          }
          setAnsweredStep((current) =>
            current === step ? undefined : current,
          );
          fail(error, "automatic-tool", tags);

          return addOutput({
            tool: toolName,
            toolCallId,
            state: "output-error",
            errorText: errorText(error),
          });
        },
      )
      .catch((error: unknown) => fail(error, "tool-output", tags));
  };

  const submit = (text: string) => {
    if (busy || !text.trim()) {
      return;
    }
    setInput("");
    setStopped(false);
    void sendMessage({ text: text.trim() });
  };

  // A reply's tool calls run once it has ended. The timer keeps StrictMode's
  // replayed effect from running them twice.
  const runToolCalls = useEffectEvent(() => {
    const step = stepOf(lastMessage);
    setStartedToolCalls(
      (started) =>
        new Set([...started, ...toolCallsToRun.map((call) => call.toolCallId)]),
    );
    setAnsweredStep(step);
    for (const call of toolCallsToRun) {
      answer(
        call,
        step,
        runBuiltInTool(call, {
          document,
          runExperiment: experimentRuns.run,
        }),
      );
    }
  });
  const toolCallsToRunKey = toolCallsToRun
    .map((call) => call.toolCallId)
    .join();
  useEffect(() => {
    if (!toolCallsToRunKey) {
      return;
    }
    const timer = setTimeout(() => runToolCalls(), 0);

    return () => clearTimeout(timer);
  }, [toolCallsToRunKey]);

  useEffect(() => {
    if (continues) {
      void sendMessage();
    }
  }, [continues, sendMessage]);

  // The empty-net prompt's message goes first, once the panel is open.
  const takeStart = useEffectEvent((text: string) => {
    onStartHandled?.();
    submit(text);
  });
  useEffect(() => {
    if (start === null || !isOpen) {
      return;
    }
    const timer = setTimeout(() => takeStart(start.text), 0);

    return () => clearTimeout(timer);
  }, [isOpen, start]);

  return (
    <AssistantChatApiContext value={api}>
      <ChatView
        busy={busy}
        experimentStates={experimentRuns.states}
        input={input}
        messages={messages}
        onCancelExperiment={experimentRuns.cancel}
        onClearMessages={() => {
          clearsRef.current += 1;
          experimentRuns.clear();
          void stop();
          setMessages([]);
          onMessages?.([]);
          setInput("");
          setStopped(false);
        }}
        onInputChange={setInput}
        onInteractiveToolSubmit={({ toolCallId, toolName, output }) => {
          // Auto-layout's prompt is the only interactive tool: applying it
          // lays the net out, and a decline goes to the model as it is.
          const step = stepOf(lastMessage);
          setAnsweredStep(step);
          answer(
            { toolName, toolCallId },
            step,
            (output as AiToolOutput).applied
              ? applyAutoLayout(document.edit)
              : Promise.resolve(output),
          );
        }}
        onSendPrompt={submit}
        onStop={() => {
          setStopped(true);
          experimentRuns.cancelAll();
          void stop();
        }}
        onSubmit={() => submit(input)}
        promptChips={selectPromptChips({
          hasConversation: messages.length > 0,
          isNetEmpty,
        })}
        stopped={stopped}
      />
    </AssistantChatApiContext>
  );
};
