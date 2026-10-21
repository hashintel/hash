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
  generateId,
  getStaticToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatOnToolCallCallback,
} from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  aiCommandActionInputSchemas,
  createExperimentToolName,
  petrinautExperimentRequestSchema,
  type PetrinautExperimentProgress,
  type PetrinautExperimentResult,
  type AiCommandActionName,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas as petrinautAiMutationToolInputSchemas,
  type PetrinautAiMutationToolName,
  readPetrinautDocToolInputSchema,
  readPetrinautDocToolName,
  setNetTitleToolInputSchema,
  setNetTitleToolName,
} from "@hashintel/petrinaut-core";
import { petrinautDocsContent } from "@hashintel/petrinaut/ui";
import {
  type PluginEdits,
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
  type AiToolOutput,
  type AiToolCall,
  summarizeApplyAutoLayout,
  toPetrinautAiToolOutput,
  toRefusalOutput,
} from "./assistant-chat/tool-summaries";
import { useLatest } from "./assistant-chat/use-latest";
import { executePetrinautAiMutation } from "./execute-petrinaut-ai-mutation";

import type { PetrinautAiMessage, PetrinautAiTransport } from "./ai-message";
import type { AssistantChatStart } from "./assistant-chat-start";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

type PetrinautAiToolCall = Parameters<
  ChatOnToolCallCallback<PetrinautAiMessage>
>[0]["toolCall"];

type PetrinautAiMessagePart = PetrinautAiMessage["parts"][number];
type RunnableStaticToolPart = Extract<
  PetrinautAiMessagePart,
  { state: "input-available" }
> & { type: `tool-${string}` };

/** A static browser tool call the chat still owes an execution for. */
const isRunnableStaticToolPart = (
  part: PetrinautAiMessagePart,
): part is RunnableStaticToolPart =>
  isToolUIPart(part) &&
  part.type !== "dynamic-tool" &&
  part.providerExecuted !== true &&
  part.state === "input-available";

/**
 * True when the last assistant message ends in static tool calls the chat
 * will execute and then continue, so the turn is not over even though the AI
 * SDK reports `ready`.
 */
const hasRunnableStaticToolCalls = (
  messages: PetrinautAiMessage[],
): boolean => {
  const message = messages.at(-1);
  return (
    message?.role === "assistant" &&
    !message.metadata?.stopped &&
    message.parts.some(isRunnableStaticToolPart)
  );
};

const isPetrinautAiMutationToolName = (
  toolName: string,
): toolName is PetrinautAiMutationToolName =>
  toolName in petrinautAiMutationToolInputSchemas;

const isPetrinautAiCommandToolName = (
  toolName: string,
): toolName is AiCommandActionName => toolName in aiCommandActionInputSchemas;

const browserToolErrorText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  try {
    const serialized: unknown = JSON.stringify(error);
    if (typeof serialized === "string" && serialized.length > 0) {
      return serialized;
    }
  } catch {
    // Fall through to the stable fallback for cyclic values.
  }
  return "The browser tool failed.";
};

export const safelyAddToolOutput = (
  addToolOutput: ReturnType<
    typeof useChat<PetrinautAiMessage>
  >["addToolOutput"],
  params: Parameters<
    ReturnType<typeof useChat<PetrinautAiMessage>>["addToolOutput"]
  >[0],
) => {
  void Promise.resolve(addToolOutput(params)).catch((error: unknown) => {
    void Promise.resolve(
      addToolOutput({
        errorText: browserToolErrorText(error),
        state: "output-error",
        tool: params.tool,
        toolCallId: params.toolCallId,
      }),
    ).catch(() => {});
  });
};

const addToolErrorOutput = (
  addToolOutput: ReturnType<
    typeof useChat<PetrinautAiMessage>
  >["addToolOutput"],
  params: {
    tool: string;
    toolCallId: string;
    state: "output-error";
    errorText: string;
  },
): Promise<void> => {
  // AI SDK's addToolOutput generic is keyed by each tool's static name, which
  // a failed call only has as a string. The error output carries no typed
  // value, so the cast stays at this boundary.
  const addUntypedToolOutput = addToolOutput as unknown as (
    errorParams: typeof params,
  ) => void | PromiseLike<void>;
  return Promise.resolve(addUntypedToolOutput(params));
};

const autoLayoutOutput = async (edit: PluginEdits): Promise<AiToolOutput> => {
  const layout = await edit.applyAutoLayout();
  return layout.applied
    ? toPetrinautAiToolOutput(summarizeApplyAutoLayout(layout.value))
    : toRefusalOutput(layout.reason);
};

const applyPetrinautAiCommand = async ({
  aiToolCall,
  edit,
}: {
  aiToolCall: Extract<AiToolCall, { toolName: AiCommandActionName }>;
  edit: PluginEdits;
}): Promise<AiToolOutput> => {
  // Exhaustive switch over AiCommandActionName — extending the AI command
  // surface will surface a TypeScript error here until the new case is added.
  switch (aiToolCall.toolName) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "applyAutoLayout":
      return autoLayoutOutput(edit);
    default: {
      const unhandledToolName: never = aiToolCall.toolName;
      return unhandledToolName;
    }
  }
};

/** The chat's `api`, which reaches the editor, and its conversation. */
export type AssistantChatProps = {
  readonly api: AssistantChatApi;
  /** Sends each request and streams the reply. Each send uses the latest value. */
  readonly transport: PetrinautAiTransport;
  /** Stored transcript the conversation starts from, applied once. */
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

const ConversationAssistantChat = ({
  api,
  transport,
  messages: storedMessages,
  onMessages,
  start = null,
  onStartHandled,
}: AssistantChatProps) => {
  // The wrapped AI transport reads its latest host value through a ref when
  // `sendMessages` eventually runs. React Compiler can't prove those reads
  // happen off-render, so we opt out here.
  "use no memo";

  const { document, editor, experiments, errors } = api;
  const isNetEmpty = useStoreSelector(
    document.net,
    (net) => net.places.length === 0 && net.transitions.length === 0,
  );
  const experimentControllersRef = useRef(new Map<string, AbortController>());
  const [experimentStates, setExperimentStates] = useState<
    Record<
      string,
      {
        active: boolean;
        progress?: PetrinautExperimentProgress;
        result?: PetrinautExperimentResult;
      }
    >
  >({});
  const cancelExperiment = useCallback((toolCallId: string) => {
    experimentControllersRef.current.get(toolCallId)?.abort();
  }, []);
  useEffect(() => {
    const controllers = experimentControllersRef.current;
    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  const { isOpen: isAiAssistantOpen } = useAssistantPanel();
  // Operational failures — the stream, tool execution, continuation, Stop —
  // reach the host's tracker at their source. Expected refusals (empty text,
  // busy composer) stay UI state only.
  const reportOperationalFailure = useCallback(
    (
      error: unknown,
      source: string,
      tags?: Readonly<Record<string, string | number | boolean>>,
    ) => {
      errors.capture(error, {
        source: `ai-assistant.${source}`,
        ...(tags === undefined ? {} : { tags }),
      });
    },
    [errors],
  );

  const [input, setInput] = useState("");
  const handledStartRef = useRef<AssistantChatStart | null>(null);

  const readDiagnosticsContext = useCallback(
    () => readCurrentDiagnostics(document),
    [document],
  );

  // AI SDK retains the transport that existed when the conversation first
  // mounted. Delegate through a stable identity so a later transport applies
  // to the next send without discarding the conversation. Timing stays
  // outside diagnostics so it tags receipt of the response chunks.
  const hostTransportRef = useLatest(transport);
  const pendingSubmissionRecoveryRef = useRef<(() => void) | null>(null);
  const liveHostTransport = useMemo<PetrinautAiTransport>(
    () => ({
      sendMessages: async (options) => {
        const stream = await hostTransportRef.current.sendMessages(options);
        // The host accepted the message, so a failure of its stream must not
        // offer the message for sending again.
        pendingSubmissionRecoveryRef.current = null;
        return stream;
      },
      reconnectToStream: (options) =>
        hostTransportRef.current.reconnectToStream(options),
    }),
    [hostTransportRef],
  );
  const diagnosticsTransport = useMemo(
    () =>
      createReasoningTimingAwareAiTransport(
        // eslint-disable-next-line react/refs -- the transport reads refs when it sends, not while rendering; see the "use no memo" comment above.
        createDiagnosticsAwareAiTransport({
          readDiagnosticsContext,
          transport: liveHostTransport,
        }),
      ),
    [liveHostTransport, readDiagnosticsContext],
  );

  // Stream errors (server returned an error chunk, function timed out, etc.)
  // are otherwise opaque to the user — `useChat` resets `status` to `"ready"`
  // and clears its internal `error` value once a follow-up send happens, but
  // the user sees nothing in the meantime. Capture them into local state so
  // the surface can show the failure in a toast.
  const [streamError, setStreamError] = useState<Error | null>(null);

  // Surfaces a subtle "Response stopped" note after the user aborts a
  // response. Cleared whenever a new turn begins so it never lingers across
  // sends or a fresh conversation.
  const [stopped, setStopped] = useState(false);
  // The SDK reports `ready` between a step that ended in client tool calls and
  // the follow-up it sends automatically. That gap is not the end of the turn,
  // so the chat stays busy until the follow-up starts or a Stop withholds it.
  const [continuationPending, setContinuationPending] = useState(false);

  const stopRequestedRef = useRef(false);
  // Advances on composer submissions and on Clear so late work cannot settle,
  // stop, or continue a replacement turn.
  const submissionGenerationRef = useRef(0);
  const toolHostIdentityRef = useRef<string | null>(null);
  const hydratedConversationIdRef = useRef<string | null>(null);
  const automaticToolCallExecutionsRef = useRef(new Set<string>());
  const pendingAutomaticToolCallExecutionsRef = useRef(new Set<string>());
  const automaticToolTerminationRef = useRef<{
    generation: number;
    kind: "stopped" | "failed";
  } | null>(null);
  const automaticToolExecutionTimersRef = useRef(
    new Map<ReturnType<typeof setTimeout>, string>(),
  );
  // AI SDK's implicit addToolOutput continuation races its stream-to-ready
  // cleanup. Static browser tools instead await output and explicitly continue.
  const automaticToolContinuationTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const suppressedAutomaticSendsRef = useRef(0);
  const addToolOutputRef = useRef<
    ReturnType<typeof useChat<PetrinautAiMessage>>["addToolOutput"] | null
  >(null);
  const sendAutomaticToolContinuationRef = useRef<(() => Promise<void>) | null>(
    null,
  );
  // Stop was pressed during the step that just ended in client tool calls.
  // The server had nothing left to abort once that step settled, so
  // withholding the follow-up is what makes the Stop real.
  const withholdContinuationForStop = () => {
    stopRequestedRef.current = false;
    setContinuationPending(false);
    setStreamError(null);
    setStopped(true);
  };
  const automaticToolTurnIsTerminated = (generation: number): boolean => {
    const termination = automaticToolTerminationRef.current;
    if (termination?.generation !== generation) return false;
    if (termination.kind === "stopped") withholdContinuationForStop();
    return true;
  };
  const automaticToolTurnIsTerminatedRef = useLatest(
    automaticToolTurnIsTerminated,
  );
  const addAutomaticToolOutputForGeneration = async (
    params: Parameters<
      ReturnType<typeof useChat<PetrinautAiMessage>>["addToolOutput"]
    >[0],
    generation: number,
    executionConversationId: string,
  ): Promise<void> => {
    const executionKey = `${executionConversationId}:${params.toolCallId}`;
    const canContinue = () =>
      generation === submissionGenerationRef.current &&
      executionConversationId === toolHostIdentityRef.current &&
      !automaticToolTurnIsTerminated(generation);
    if (!canContinue()) {
      pendingAutomaticToolCallExecutionsRef.current.delete(executionKey);
      return;
    }
    const currentAddToolOutput = addToolOutputRef.current;
    if (currentAddToolOutput === null) {
      throw new Error("The AI assistant tool host is not ready.");
    }
    pendingAutomaticToolCallExecutionsRef.current.delete(executionKey);
    // Prevent addToolOutput's fire-and-forget continuation from racing the
    // explicit continuation chained to its promise below.
    suppressedAutomaticSendsRef.current += 1;
    await Promise.resolve()
      .then(() => currentAddToolOutput(params))
      .then(
        () => {
          suppressedAutomaticSendsRef.current -= 1;
        },
        (caught: unknown) => {
          suppressedAutomaticSendsRef.current -= 1;
          throw caught;
        },
      );
  };

  const executeToolCall = async ({
    toolCall,
  }: {
    toolCall: PetrinautAiToolCall;
  }) => {
    const generation = submissionGenerationRef.current;
    const executionConversationId = toolHostIdentityRef.current;
    if (executionConversationId === null) {
      throw new Error("The AI assistant tool host is not ready.");
    }
    const addAutomaticToolOutput = (
      params: Parameters<typeof addAutomaticToolOutputForGeneration>[0],
    ) =>
      addAutomaticToolOutputForGeneration(
        params,
        generation,
        executionConversationId,
      );

    if (toolCall.toolName === createExperimentToolName) {
      const request = petrinautExperimentRequestSchema.parse(toolCall.input);
      const controller = new AbortController();
      experimentControllersRef.current.set(toolCall.toolCallId, controller);
      setExperimentStates((states) => ({
        ...states,
        [toolCall.toolCallId]: { active: true },
      }));
      const isCurrentRequest = () =>
        generation === submissionGenerationRef.current &&
        executionConversationId === toolHostIdentityRef.current &&
        experimentControllersRef.current.get(toolCall.toolCallId) ===
          controller;
      // eslint-disable-next-line react/todo -- the build skips this panel, which opts out with "use no memo"; oxlint reports bailouts in opted-out functions anyway.
      try {
        const result = await experiments.run(request, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!isCurrentRequest()) return;
            setExperimentStates((states) => ({
              ...states,
              [toolCall.toolCallId]: { active: true, progress },
            }));
          },
        });
        if (isCurrentRequest()) {
          setExperimentStates((states) => ({
            ...states,
            [toolCall.toolCallId]: { active: false, result },
          }));
        }
        await addAutomaticToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        });
      } finally {
        if (isCurrentRequest()) {
          setExperimentStates((states) => ({
            ...states,
            [toolCall.toolCallId]: {
              ...states[toolCall.toolCallId],
              active: false,
            },
          }));
        }
        if (
          experimentControllersRef.current.get(toolCall.toolCallId) ===
          controller
        ) {
          experimentControllersRef.current.delete(toolCall.toolCallId);
        }
      }
      return;
    }

    if (toolCall.toolName === getLatestNetDefinitionToolName) {
      await addAutomaticToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: {
          title: document.title.get(),
          definition: document.net.get(),
          extensions: document.extensions,
        },
      });
      return;
    }

    if (toolCall.toolName === getNetCompilationErrorsToolName) {
      await addAutomaticToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: await readDiagnosticsContext(),
      });
      return;
    }

    if (toolCall.toolName === readPetrinautDocToolName) {
      const { doc } = readPetrinautDocToolInputSchema.parse(toolCall.input);
      await addAutomaticToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: petrinautDocsContent[doc],
      });
      return;
    }

    if (toolCall.toolName === setNetTitleToolName) {
      const { title } = setNetTitleToolInputSchema.parse(toolCall.input);
      const previousTitle = document.title.get();
      const renamed = document.setTitle(title);

      await addAutomaticToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: renamed.applied
          ? ({
              applied: true,
              title: `Renamed net to "${title}"`,
              detail:
                previousTitle && previousTitle !== title
                  ? `Previous title: ${previousTitle}`
                  : undefined,
            } satisfies AiToolOutput)
          : toRefusalOutput(renamed.reason),
      });
      return;
    }

    const toolName = toolCall.toolName;
    if (
      !isPetrinautAiMutationToolName(toolName) &&
      !isPetrinautAiCommandToolName(toolName)
    ) {
      throw new Error(`Unknown AI tool: ${String(toolName as string)}`);
    }

    if (isPetrinautAiCommandToolName(toolName)) {
      const commandInput = aiCommandActionInputSchemas[toolName].parse(
        toolCall.input,
      );
      // A command with a widget waits for the user's answer instead.
      if (
        getInteractiveTool({
          toolName,
          toolCallId: toolCall.toolCallId,
          input: commandInput,
        })
      ) {
        return;
      }

      const aiToolCall = {
        toolName,
        input: commandInput,
      } as Extract<AiToolCall, { toolName: AiCommandActionName }>;

      const output = await applyPetrinautAiCommand({
        aiToolCall,
        edit: document.edit,
      });
      await addAutomaticToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
      return;
    }

    const toolInput = petrinautAiMutationToolInputSchemas[toolName].parse(
      toolCall.input,
    );

    const aiToolCall = {
      toolName,
      input: toolInput,
    } as Extract<AiToolCall, { toolName: PetrinautAiMutationToolName }>;

    const output = executePetrinautAiMutation({
      aiToolCall,
      getDefinition: () => document.net.get(),
      edit: document.edit,
    });

    await addAutomaticToolOutput({
      tool: toolName,
      toolCallId: toolCall.toolCallId,
      output,
    });
  };

  /**
   * Hands the transcript to a host that stores it. The host passes it back
   * as `messages` a commit or more later, behind the chat, so its stored
   * transcript applies only until the chat's first report.
   */
  const reportMessages = (reported: PetrinautAiMessage[]) => {
    if (onMessages === undefined) return;
    hydratedConversationIdRef.current = toolHostIdentityRef.current;
    onMessages(reported);
  };
  const {
    error,
    id: conversationId,
    messages,
    addToolOutput,
    sendMessage,
    setMessages,
    status: chatStatus,
    stop,
  } = useChat<PetrinautAiMessage>({
    messages: storedMessages,
    transport: diagnosticsTransport,
    // The built-in layout consent retains AI SDK's native continuation.
    // Static browser tools coordinate an explicit continuation below so stream
    // settlement cannot duplicate their send.
    sendAutomaticallyWhen: ({ messages: currentMessages }) => {
      if (
        suppressedAutomaticSendsRef.current !== 0 ||
        !lastAssistantMessageIsCompleteWithToolCalls({
          messages: currentMessages,
        })
      ) {
        return false;
      }
      if (automaticToolTurnIsTerminated(submissionGenerationRef.current)) {
        return false;
      }
      if (!stopRequestedRef.current) {
        // Left pending until the follow-up's own status change lands, so the
        // chat never shows the `ready` between this check and that request.
        return true;
      }
      withholdContinuationForStop();
      return false;
    },
    // Without throttling, every reasoning-delta / text-delta chunk triggers a
    // full re-render of `ChatView`, and the SDK `structuredClone`s
    // the active message on each one. For a long markdown reply that locks
    // the main thread. 80ms still feels live (≈12 updates/sec) but lets the
    // browser breathe between chunks.
    experimental_throttle: 80,
    onError: (chatError) => {
      const submissionError =
        chatError instanceof Error ? chatError : new Error(String(chatError));
      reportOperationalFailure(submissionError, "stream");
      setStreamError(submissionError);
      const recoverPendingSubmission = pendingSubmissionRecoveryRef.current;
      pendingSubmissionRecoveryRef.current = null;
      recoverPendingSubmission?.();
    },
    onFinish: ({ messages: finishedMessages, isAbort, isError }) => {
      pendingSubmissionRecoveryRef.current = null;
      const termination = automaticToolTerminationRef.current;
      const failed =
        termination?.generation === submissionGenerationRef.current &&
        termination.kind === "failed";
      // A step that ended in client tool calls is followed automatically by
      // the SDK unless it was aborted or errored; that follow-up is still part
      // of this turn.
      const followUpPending =
        !failed &&
        !isAbort &&
        !isError &&
        (lastAssistantMessageIsCompleteWithToolCalls({
          messages: finishedMessages,
        }) ||
          hasRunnableStaticToolCalls(finishedMessages));
      setContinuationPending(followUpPending);
      if (isAbort) {
        // The SDK fires `onFinish` for every abort. Only act on a deliberate
        // Stop — clearing the chat or unmounting also aborts, and those paths
        // own their own state updates. Running here (rather than in `onStop`)
        // guarantees the stream has fully unwound, so no late chunk can revert
        // the parts we settle back to `"streaming"`.
        if (!stopRequestedRef.current) {
          return;
        }
        stopRequestedRef.current = false;

        // `stop()` only aborts the request — it leaves the active
        // reasoning/text parts in their `"streaming"` state, so the
        // elapsed-time counter and shimmer keep running. Settle them, then
        // mirror the finalized transcript into the chat and persistence.
        const finalized = finalizeStreamingMessageParts(finishedMessages);
        setMessages(finalized);
        setStreamError(null);
        reportMessages(finalized);
        setStopped(true);
        return;
      }

      reportMessages(finishedMessages);
      // A failed tool call ends the turn: neither completion nor its deferred
      // tools may report success.
      if (failed) return;
      if (followUpPending) {
        // The turn is not over: a Stop pressed during this step must still be
        // able to withhold the follow-up, so its intent survives this step.
        return;
      }

      // A response that runs to completion clears any pending Stop intent so a
      // later incidental abort can't replay the deliberate-stop path, and
      // drops a stale "Response stopped" note left over from an earlier turn.
      stopRequestedRef.current = false;
      setStreamError(null);
      setStopped(false);
    },
  });
  useLayoutEffect(() => {
    toolHostIdentityRef.current = conversationId;
    addToolOutputRef.current = addToolOutput;
    sendAutomaticToolContinuationRef.current = () => sendMessage();
    return () => {
      if (addToolOutputRef.current === addToolOutput) {
        addToolOutputRef.current = null;
      }
      sendAutomaticToolContinuationRef.current = null;
      toolHostIdentityRef.current = null;
    };
  }, [addToolOutput, conversationId, sendMessage]);
  useEffect(() => {
    if (
      chatStatus !== "ready" ||
      !continuationPending ||
      pendingAutomaticToolCallExecutionsRef.current.size > 0 ||
      !lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      automaticToolContinuationTimerRef.current !== null
    ) {
      return;
    }

    const generation = submissionGenerationRef.current;
    automaticToolContinuationTimerRef.current = setTimeout(() => {
      automaticToolContinuationTimerRef.current = null;
      if (
        generation !== submissionGenerationRef.current ||
        toolHostIdentityRef.current !== conversationId ||
        automaticToolTurnIsTerminatedRef.current(generation)
      ) {
        return;
      }
      const sendContinuation = sendAutomaticToolContinuationRef.current;
      if (sendContinuation === null) {
        setContinuationPending(false);
        const hostError = new Error("The AI assistant tool host is not ready.");
        reportOperationalFailure(hostError, "continuation");
        setStreamError(hostError);
        return;
      }
      void sendContinuation().catch((caught: unknown) => {
        if (generation !== submissionGenerationRef.current) return;
        setContinuationPending(false);
        reportOperationalFailure(caught, "continuation");
        setStreamError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      });
    }, 0);
  }, [
    automaticToolTurnIsTerminatedRef,
    chatStatus,
    continuationPending,
    conversationId,
    messages,
    reportOperationalFailure,
  ]);
  useEffect(
    () => () => {
      for (const [
        timer,
        executionKey,
      ] of automaticToolExecutionTimersRef.current) {
        clearTimeout(timer);
        // Cancelled-before-start work is claimable on StrictMode's next setup.
        automaticToolCallExecutionsRef.current.delete(executionKey);
        pendingAutomaticToolCallExecutionsRef.current.delete(executionKey);
      }
      automaticToolExecutionTimersRef.current.clear();
      if (automaticToolContinuationTimerRef.current !== null) {
        clearTimeout(automaticToolContinuationTimerRef.current);
        automaticToolContinuationTimerRef.current = null;
      }
    },
    [conversationId],
  );
  const executeToolCallRef = useLatest(executeToolCall);
  const status: ChatStatus =
    chatStatus === "ready" && streamError !== null
      ? "error"
      : continuationPending && chatStatus === "ready"
        ? "submitted"
        : chatStatus;

  useEffect(() => {
    if (
      storedMessages === undefined ||
      status !== "ready" ||
      hydratedConversationIdRef.current === conversationId
    ) {
      return;
    }
    if (storedMessages.length === 0 && messages.length === 0) {
      return;
    }
    // A turn submitted before the stored history arrived is already visible
    // locally. A snapshot that predates it would erase that turn and latch, so
    // wait for a snapshot that carries every locally streamed reply.
    const storedMessageIds = new Set(
      storedMessages.map((message) => message.id),
    );
    if (
      messages.some(
        (message) =>
          message.role === "assistant" && !storedMessageIds.has(message.id),
      )
    ) {
      return;
    }
    hydratedConversationIdRef.current = conversationId;
    setMessages(storedMessages);
  }, [conversationId, messages, setMessages, status, storedMessages]);

  useEffect(() => {
    // Keyed on the SDK's own status: the derived composer status stays busy
    // for exactly the continuation this effect drives.
    if (chatStatus !== "ready") {
      return;
    }

    for (const message of messages) {
      if (message.metadata?.stopped) continue;
      for (const part of message.parts) {
        if (!isRunnableStaticToolPart(part)) continue;

        const toolCall = {
          dynamic: false,
          input: part.input,
          toolCallId: part.toolCallId,
          toolName: getStaticToolName(part),
        } as Extract<PetrinautAiToolCall, { dynamic?: false }>;
        const executionKey = `${conversationId}:${toolCall.toolCallId}`;
        if (automaticToolCallExecutionsRef.current.has(executionKey)) continue;
        automaticToolCallExecutionsRef.current.add(executionKey);
        pendingAutomaticToolCallExecutionsRef.current.add(executionKey);
        const generation = submissionGenerationRef.current;
        // Hydrated calls have no onFinish; claim both their execution and busy
        // state before scheduling, so another render cannot queue them again.
        setContinuationPending(true);
        const timer = setTimeout(() => {
          automaticToolExecutionTimersRef.current.delete(timer);
          if (
            generation !== submissionGenerationRef.current ||
            toolHostIdentityRef.current !== conversationId
          ) {
            pendingAutomaticToolCallExecutionsRef.current.delete(executionKey);
            return;
          }
          if (automaticToolTurnIsTerminatedRef.current(generation)) {
            pendingAutomaticToolCallExecutionsRef.current.delete(executionKey);
            return;
          }
          void Promise.resolve()
            .then(() => executeToolCallRef.current({ toolCall }))
            .catch(async (caught: unknown) => {
              pendingAutomaticToolCallExecutionsRef.current.delete(
                executionKey,
              );
              if (
                generation !== submissionGenerationRef.current ||
                toolHostIdentityRef.current !== conversationId
              )
                return;
              if (automaticToolTurnIsTerminatedRef.current(generation)) return;
              automaticToolTerminationRef.current = {
                generation,
                kind: "failed",
              };
              setContinuationPending(false);
              reportOperationalFailure(caught, "automatic-tool", {
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
              });
              setStreamError(
                caught instanceof Error
                  ? caught
                  : new Error(browserToolErrorText(caught)),
              );
              // A tool failure belongs to this call, not just the toast. Do
              // not let recording its error trigger an implicit continuation.
              suppressedAutomaticSendsRef.current += 1;
              await Promise.resolve()
                .then(() => {
                  const currentAddToolOutput = addToolOutputRef.current;
                  return currentAddToolOutput
                    ? addToolErrorOutput(currentAddToolOutput, {
                        tool: toolCall.toolName,
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: browserToolErrorText(caught),
                      })
                    : undefined;
                })
                .catch((outputError: unknown) => {
                  // The failed call's error part could not be recorded; the
                  // toast already shows the original failure.
                  reportOperationalFailure(outputError, "tool-output", {
                    toolName: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                  });
                })
                .then(() => {
                  suppressedAutomaticSendsRef.current -= 1;
                });
            });
        }, 0);
        automaticToolExecutionTimersRef.current.set(timer, executionKey);
      }
    }
  }, [
    automaticToolTurnIsTerminatedRef,
    chatStatus,
    conversationId,
    executeToolCallRef,
    messages,
    reportOperationalFailure,
    toolHostIdentityRef,
  ]);

  const composerSubmissionStateRef = useLatest({ sendMessage, status });

  const submitText = useCallback(
    async (text: string): Promise<void> => {
      const submissionText = text.trim();
      if (!submissionText) {
        const submissionError = new Error(
          "AI assistant text must not be empty.",
        );
        setStreamError(submissionError);
        throw submissionError;
      }

      const { sendMessage: submitMessage, status: currentStatus } =
        composerSubmissionStateRef.current;
      if (currentStatus === "submitted" || currentStatus === "streaming") {
        const submissionError = new Error(
          "Wait for the current AI response before submitting more text.",
        );
        setStreamError(submissionError);
        throw submissionError;
      }

      setInput("");
      setStreamError(null);
      setStopped(false);
      stopRequestedRef.current = false;
      submissionGenerationRef.current += 1;
      await submitMessage({
        id: generateId(),
        parts: [{ text: submissionText, type: "text" }],
        role: "user",
      });
    },
    [composerSubmissionStateRef],
  );

  const stopStateRef = useLatest({ status, stop });

  const stopComposer = useCallback(async () => {
    const { status: currentStatus, stop: stopCurrentResponse } =
      stopStateRef.current;
    if (currentStatus !== "submitted" && currentStatus !== "streaming") {
      return;
    }

    automaticToolTerminationRef.current = {
      generation: submissionGenerationRef.current,
      kind: "stopped",
    };
    for (const controller of experimentControllersRef.current.values())
      controller.abort();
    stopRequestedRef.current = true;
    await stopCurrentResponse();
  }, [stopStateRef]);

  const submitUserText = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }

      const restoreInputAfterFailure = () => {
        setInput((currentInput) => currentInput || text);
      };
      pendingSubmissionRecoveryRef.current = restoreInputAfterFailure;
      void submitText(text).catch((caught: unknown) => {
        if (pendingSubmissionRecoveryRef.current === restoreInputAfterFailure) {
          pendingSubmissionRecoveryRef.current = null;
        }
        setStreamError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
        restoreInputAfterFailure();
      });
    },
    [submitText],
  );

  // The empty-net prompt's message becomes the first message once the panel
  // is open.
  useEffect(() => {
    if (start === null) {
      handledStartRef.current = null;

      return;
    }
    if (!isAiAssistantOpen || handledStartRef.current === start) {
      return;
    }
    handledStartRef.current = start;
    onStartHandled?.();
    submitUserText(start.text);
  }, [isAiAssistantOpen, onStartHandled, start, submitUserText]);

  // Chips are only meaningful before a conversation has begun — once the
  // user has typed or the AI has replied, they've signalled what they want
  // and the chips become noise.
  const promptChips = selectPromptChips({
    hasConversation: messages.length > 0,
    isNetEmpty,
  });

  return (
    <ChatView
      error={streamError ?? error}
      experimentStates={experimentStates}
      onCancelExperiment={cancelExperiment}
      input={input}
      isOpen={isAiAssistantOpen}
      messages={messages}
      onClearMessages={() => {
        for (const controller of experimentControllersRef.current.values())
          controller.abort();
        experimentControllersRef.current.clear();
        setExperimentStates({});
        submissionGenerationRef.current += 1;
        // Clearing aborts any in-flight response too, which fires `onFinish`
        // with `isAbort`. Drop the stop flag first so that handler treats this
        // as an incidental abort and doesn't repopulate or persist the
        // transcript we're about to wipe.
        stopRequestedRef.current = false;
        if (status === "submitted" || status === "streaming") {
          void stop();
        }
        setInput("");
        setStreamError(null);
        setStopped(false);
        setContinuationPending(false);
        setMessages([]);
        reportMessages([]);
      }}
      onInputChange={setInput}
      onInteractiveToolSubmit={({ toolCallId, toolName, output }) => {
        if (!isPetrinautAiCommandToolName(toolName)) {
          throw new Error(`Unknown AI tool: ${toolName}`);
        }

        const petrinautOutput = output as AiToolOutput;

        // applyAutoLayout is the only interactive command today. The widget
        // signals "apply" by passing `{ applied: true }`; we still need to
        // run the command to compute the real commitCount before reporting
        // the outcome to the AI. Decline outputs are forwarded verbatim.
        if (petrinautOutput.applied !== true) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output: petrinautOutput,
          });
          return;
        }

        void autoLayoutOutput(document.edit).then((layoutOutput) =>
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output: layoutOutput,
          }),
        );
      }}
      onSelectToolTarget={(target) => editor.reveal(target)}
      onSendPrompt={submitUserText}
      onStop={() => {
        // Flag the deliberate stop, then abort. The actual settling of the
        // partial transcript and the "Response stopped" note happen in
        // `onFinish`, once the SDK has fully unwound the stream — finalizing
        // here would race the chunks the SDK is still flushing.
        void stopComposer();
      }}
      onSubmit={() => submitUserText(input)}
      promptChips={promptChips}
      status={status}
      stopped={stopped}
    />
  );
};

/**
 * Petrinaut AI's chat, drawn in the assistant panel: render it as a plugin's
 * `assistant.content`.
 */
export const AssistantChat = (props: AssistantChatProps) => (
  <AssistantChatApiContext value={props.api}>
    <ConversationAssistantChat {...props} />
  </AssistantChatApiContext>
);
