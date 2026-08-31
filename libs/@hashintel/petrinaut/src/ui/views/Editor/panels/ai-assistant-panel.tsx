import { useChat } from "@ai-sdk/react";
import { generateId, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { use, useCallback, useEffect, useRef, useState } from "react";

import {
  aiCommandActionInputSchemas,
  type AiCommandActionName,
  createPetrinautAiWritableCallbacks,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas as petrinautAiMutationToolInputSchemas,
  type Petrinaut,
  type PetrinautAiMutationToolName,
  readPetrinautDocToolInputSchema,
  readPetrinautDocToolName,
  setNetTitleToolInputSchema,
  setNetTitleToolName,
} from "@hashintel/petrinaut-core";

import { useLatest } from "../../../../react/hooks/use-latest";
import { PetrinautInstanceContext } from "../../../../react/instance-context";
import { LanguageClientContext } from "../../../../react/lsp/context";
import {
  EditorContext,
  type EditorContextValue,
} from "../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { simulateModeAllowedMutationNames } from "../../../../react/state/simulate-mode-allowed-mutation-names";
import {
  formatReadOnlyReason,
  useReadOnlyReason,
} from "../../../../react/state/use-read-only-reason";
import { PANEL_MARGIN } from "../../../constants/ui";
import { AiAssistantContents } from "./ai-assistant-panel/ai-assistant-contents";
import {
  REVIEW_CHIPS,
  STARTER_CHIPS,
} from "./ai-assistant-panel/ai-assistant-contents/prompt-chips";
import { createDiagnosticsAwareAiTransport } from "./ai-assistant-panel/create-diagnostics-aware-ai-transport";
import { createReasoningTimingAwareAiTransport } from "./ai-assistant-panel/create-reasoning-timing-aware-ai-transport";
import { finalizeStreamingMessageParts } from "./ai-assistant-panel/finalize-streaming-message-parts";
import { formatDiagnosticsForAi } from "./ai-assistant-panel/format-diagnostics-for-ai";
import {
  getInteractiveTool,
  resolveDynamicInteractiveTool,
} from "./ai-assistant-panel/interactive-tools/registry";
import { petrinautDocsContent } from "./ai-assistant-panel/petrinaut-docs-content";
import {
  type AiToolOutput,
  type AiToolCall,
  type AiToolTarget,
  summarizeApplyAutoLayout,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
} from "./ai-assistant-panel/tool-summaries";

import type { PetrinautAiAssistant } from "../../../petrinaut";
import type {
  PetrinautAiComposerControlContext,
  PetrinautAiComposerSubmitText,
  PetrinautAiComposerSubmitTextResult,
} from "../../../types/ai-assistant-composer-control";
import type { PetrinautAiMessage } from "./ai-assistant-panel/types";

export type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";

const selectTarget = (
  target: AiToolTarget,
  actions: Pick<EditorContextValue, "navigateTo" | "selectItem">,
) => {
  if (target.kind === "selection") {
    actions.selectItem(target.item);
    return;
  }

  actions.navigateTo({
    globalMode: "simulate",
    simulateViewMode: target.mode,
    simulateDrawer:
      target.mode === "scenarios"
        ? target.itemId
          ? { type: "view-scenario", scenarioId: target.itemId }
          : { type: "closed" }
        : target.itemId
          ? { type: "view-metric", metricId: target.itemId }
          : { type: "closed" },
  });
};

type QueuedInterviewAnswer = {
  readonly input: Parameters<
    PetrinautAiComposerControlContext["submitText"]
  >[0];
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (result: PetrinautAiComposerSubmitTextResult) => void;
};

const isPetrinautAiMutationToolName = (
  toolName: string,
): toolName is PetrinautAiMutationToolName =>
  toolName in petrinautAiMutationToolInputSchemas;

const isPetrinautAiCommandToolName = (
  toolName: string,
): toolName is AiCommandActionName => toolName in aiCommandActionInputSchemas;

const safelyAddToolOutput = (
  addToolOutput: ReturnType<
    typeof useChat<PetrinautAiMessage>
  >["addToolOutput"],
  params: Parameters<
    ReturnType<typeof useChat<PetrinautAiMessage>>["addToolOutput"]
  >[0],
) => {
  // Failures here surface in the UI as an errored tool call (with the
  // error message on hover), so we just swallow the rejection to avoid an
  // unhandled-promise warning.
  void Promise.resolve(addToolOutput(params)).catch(() => {});
};

const addDynamicToolOutput = (
  addToolOutput: ReturnType<
    typeof useChat<PetrinautAiMessage>
  >["addToolOutput"],
  params: { tool: string; toolCallId: string; output: unknown },
): Promise<void> => {
  // AI SDK models dynamic tool parts at runtime, but its addToolOutput generic
  // is keyed only by the message's statically declared tools. Keep the cast at
  // this boundary; the host definition validated the dynamic output already.
  const addToolOutputForDynamicTool = addToolOutput as unknown as (
    dynamicParams: typeof params,
  ) => void | PromiseLike<void>;
  return Promise.resolve(addToolOutputForDynamicTool(params));
};

const waitForDiagnosticsRefresh = async ({
  consumePendingMutationDiagnosticsVersion,
  diagnosticsVersionRef,
}: {
  consumePendingMutationDiagnosticsVersion: () => number | null;
  diagnosticsVersionRef: { current: number };
}) => {
  const pendingVersion = consumePendingMutationDiagnosticsVersion();

  if (
    pendingVersion === null ||
    diagnosticsVersionRef.current > pendingVersion
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutAt = Date.now() + 1_000;

    const check = () => {
      if (
        diagnosticsVersionRef.current > pendingVersion ||
        Date.now() >= timeoutAt
      ) {
        resolve();
        return;
      }

      setTimeout(check, 25);
    };

    check();
  });
};

const applyPetrinautAiMutation = ({
  aiToolCall,
  instance,
}: {
  aiToolCall: Extract<AiToolCall, { toolName: PetrinautAiMutationToolName }>;
  instance: Petrinaut;
}): AiToolOutput => {
  const definition = instance.definition.get();
  const toolCallbacks = createPetrinautAiWritableCallbacks(instance);
  const summary = summarizePetrinautAiToolCall(aiToolCall, { definition });
  const callback = toolCallbacks[aiToolCall.toolName] as (
    input: typeof aiToolCall.input,
  ) => void;

  callback(aiToolCall.input);

  return toPetrinautAiToolOutput(summary);
};

const applyPetrinautAiCommand = async ({
  aiToolCall,
  instance,
}: {
  aiToolCall: Extract<AiToolCall, { toolName: AiCommandActionName }>;
  instance: Petrinaut;
}): Promise<AiToolOutput> => {
  // Exhaustive switch over AiCommandActionName — extending the AI command
  // surface will surface a TypeScript error here until the new case is added.
  switch (aiToolCall.toolName) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "applyAutoLayout": {
      const { commitCount } = await instance.commands.applyAutoLayout();
      return toPetrinautAiToolOutput(summarizeApplyAutoLayout({ commitCount }));
    }
  }
};

export const AiAssistantPanel = ({
  aiAssistant,
  initialMessage,
  onInitialMessageConsumed,
}: {
  aiAssistant: PetrinautAiAssistant;
  initialMessage?: string | null;
  onInitialMessageConsumed?: () => void;
}) => {
  // The wrapped AI transport closes over several refs (diagnostics version,
  // pending mutation version, diagnostics context) so the transport's
  // `sendMessages` can read the latest values when it eventually runs. React
  // Compiler can't prove those reads happen off-render, so we opt out here.
  "use no memo";

  const instance = use(PetrinautInstanceContext);

  const readOnlyReason = useReadOnlyReason();
  const readOnlyReasonRef = useRef(readOnlyReason);
  useEffect(() => {
    readOnlyReasonRef.current = readOnlyReason;
  }, [readOnlyReason]);

  const { diagnosticsByUri } = use(LanguageClientContext);

  const {
    hasSelection,
    isAiAssistantOpen,
    navigateTo,
    propertiesPanelWidth,
    selectItem,
    setAiAssistantOpen,
  } = use(EditorContext);

  const { petriNetDefinition, setTitle, title } = use(SDCPNContext);

  const [input, setInput] = useState("");
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewAnswerQueued, setInterviewAnswerQueued] = useState(false);
  const queuedInterviewAnswerRef = useRef<QueuedInterviewAnswer | null>(null);
  const submittedInitialMessageRef = useRef<string | null>(null);

  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const diagnosticsContextRef = useRef("No current TypeScript diagnostics.");
  const diagnosticsVersionRef = useRef(0);
  const pendingMutationDiagnosticsVersionRef = useRef<number | null>(null);

  useEffect(() => {
    diagnosticsVersionRef.current += 1;
  }, [diagnosticsByUri]);

  useEffect(() => {
    diagnosticsContextRef.current = formatDiagnosticsForAi({
      definition: petriNetDefinition,
      diagnosticsByUri,
    });
  }, [diagnosticsByUri, petriNetDefinition]);

  /* eslint-disable react-hooks-js/refs -- See the `"use no memo"` directive
     above: the refs are only read when the wrapped transport runs, never during
     render. The lint rule can't see that. */
  const buildWrappedTransport = (transport: typeof aiAssistant.transport) =>
    // The timing wrapper sits on the outside so reasoning-chunk receipt is
    // tagged with `Date.now()` even when the inner diagnostics wrapper has
    // added the post-tool diagnostics context message to the request. Order
    // matters here only insofar as the timing wrapper consumes the *response*
    // stream from whatever inner transport produced it — it does not touch
    // the request side.
    createReasoningTimingAwareAiTransport(
      createDiagnosticsAwareAiTransport({
        getDiagnosticsContext: () => diagnosticsContextRef.current,
        transport,
        waitForDiagnosticsRefresh: () =>
          waitForDiagnosticsRefresh({
            consumePendingMutationDiagnosticsVersion: () => {
              const pendingVersion =
                pendingMutationDiagnosticsVersionRef.current;
              pendingMutationDiagnosticsVersionRef.current = null;
              return pendingVersion;
            },
            diagnosticsVersionRef,
          }),
      }),
    );

  const [diagnosticsTransportState, setDiagnosticsTransportState] = useState(
    () => ({
      source: aiAssistant.transport,
      transport: buildWrappedTransport(aiAssistant.transport),
    }),
  );

  useEffect(() => {
    if (diagnosticsTransportState.source === aiAssistant.transport) {
      return;
    }

    setDiagnosticsTransportState({
      source: aiAssistant.transport,
      transport: buildWrappedTransport(aiAssistant.transport),
    });
  }, [aiAssistant.transport, diagnosticsTransportState.source]);
  /* eslint-enable react-hooks-js/refs */

  // Stream errors (server returned an error chunk, function timed out, etc.)
  // are otherwise opaque to the user — `useChat` resets `status` to `"ready"`
  // and clears its internal `error` value once a follow-up send happens, but
  // the user sees nothing in the meantime. Capture them into local state so
  // the surface can render the failure under the conversation.
  const [streamError, setStreamError] = useState<Error | null>(null);

  // Surfaces a subtle "Response stopped" note after the user aborts a
  // response. Cleared whenever a new turn begins so it never lingers across
  // sends or a fresh conversation.
  const [stopped, setStopped] = useState(false);

  const stopRequestedRef = useRef(false);

  const {
    error,
    id: conversationId,
    messages,
    addToolOutput,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<PetrinautAiMessage>({
    ...(aiAssistant.conversationId === undefined
      ? {}
      : { id: aiAssistant.conversationId }),
    messages: aiAssistant.messages,
    transport: diagnosticsTransportState.transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Without throttling, every reasoning-delta / text-delta chunk triggers a
    // full re-render of `AiAssistantContents`, and the SDK `structuredClone`s
    // the active message on each one. For a long markdown reply that locks
    // the main thread. 80ms still feels live (≈12 updates/sec) but lets the
    // browser breathe between chunks.
    experimental_throttle: 80,
    onError: (chatError) => {
      setStreamError(
        chatError instanceof Error ? chatError : new Error(String(chatError)),
      );
    },
    onFinish: ({ messages: finishedMessages, isAbort }) => {
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
        aiAssistant.onMessages?.(finalized);
        setStopped(true);
        return;
      }

      // A response that runs to completion clears any pending Stop intent so a
      // later incidental abort can't replay the deliberate-stop path, and
      // drops a stale "Response stopped" note left over from an earlier turn.
      stopRequestedRef.current = false;
      setStreamError(null);
      setStopped(false);
      aiAssistant.onMessages?.(finishedMessages);
    },
    onToolCall: async ({ toolCall }) => {
      if (!instance) {
        throw new Error(
          "The AI assistant cannot run without an editor instance.",
        );
      }

      if (toolCall.dynamic) {
        resolveDynamicInteractiveTool(
          toolCall.toolName,
          toolCall.input,
          aiAssistant.interactiveTools ?? [],
        );
        return;
      }

      if (toolCall.toolName === getLatestNetDefinitionToolName) {
        safelyAddToolOutput(addToolOutput, {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            title: titleRef.current,
            definition: instance.definition.get(),
            extensions: instance.extensions,
          },
        });
        return;
      }

      if (toolCall.toolName === getNetCompilationErrorsToolName) {
        await waitForDiagnosticsRefresh({
          consumePendingMutationDiagnosticsVersion: () => {
            const pendingVersion = pendingMutationDiagnosticsVersionRef.current;
            pendingMutationDiagnosticsVersionRef.current = null;
            return pendingVersion;
          },
          diagnosticsVersionRef,
        });
        safelyAddToolOutput(addToolOutput, {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: diagnosticsContextRef.current,
        });
        return;
      }

      if (toolCall.toolName === readPetrinautDocToolName) {
        const { doc } = readPetrinautDocToolInputSchema.parse(toolCall.input);
        safelyAddToolOutput(addToolOutput, {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: petrinautDocsContent[doc],
        });
        return;
      }

      if (toolCall.toolName === setNetTitleToolName) {
        const setNetTitleReadOnlyReason = readOnlyReasonRef.current;
        if (setNetTitleReadOnlyReason !== null) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: {
              applied: false,
              blocked: setNetTitleReadOnlyReason.kind,
              reason: formatReadOnlyReason(setNetTitleReadOnlyReason),
            } satisfies AiToolOutput,
          });
          return;
        }

        const parsedSetNetTitleInput = setNetTitleToolInputSchema.parse(
          toolCall.input,
        );
        const previousTitle = titleRef.current;
        setTitle(parsedSetNetTitleInput.title);

        safelyAddToolOutput(addToolOutput, {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            applied: true,
            title: `Renamed net to "${parsedSetNetTitleInput.title}"`,
            detail:
              previousTitle && previousTitle !== parsedSetNetTitleInput.title
                ? `Previous title: ${previousTitle}`
                : undefined,
          } satisfies AiToolOutput,
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

      const currentReadOnlyReason = readOnlyReasonRef.current;
      if (currentReadOnlyReason !== null) {
        // Scenario and metric mutations stay live in simulate mode and
        // during an active simulation — the Simulate panel itself drives
        // them, so `usePetrinautMutations` only blocks them when the host
        // is fully read-only. Mirror that here so the assistant can do
        // what the UI already permits.
        const isSimulateAllowedMutation =
          isPetrinautAiMutationToolName(toolName) &&
          simulateModeAllowedMutationNames.has(toolName);
        const allowedDespiteReadOnly =
          isSimulateAllowedMutation &&
          currentReadOnlyReason.kind !== "host-readonly";

        if (!allowedDespiteReadOnly) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId: toolCall.toolCallId,
            output: {
              applied: false,
              blocked: currentReadOnlyReason.kind,
              reason: formatReadOnlyReason(currentReadOnlyReason),
            } satisfies AiToolOutput,
          });
          return;
        }
      }

      if (isPetrinautAiCommandToolName(toolName)) {
        const commandInput = aiCommandActionInputSchemas[toolName].parse(
          toolCall.input,
        );
        if (
          getInteractiveTool(
            toolName,
            commandInput,
            aiAssistant.interactiveTools,
          )
        ) {
          // Defer: the surface will render the widget and call
          // onInteractiveToolSubmit when the user decides.
          return;
        }

        pendingMutationDiagnosticsVersionRef.current =
          diagnosticsVersionRef.current;

        const aiToolCall = {
          toolName,
          input: commandInput,
        } as Extract<AiToolCall, { toolName: AiCommandActionName }>;

        const output = await applyPetrinautAiCommand({
          aiToolCall,
          instance,
        });
        safelyAddToolOutput(addToolOutput, {
          tool: toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
        return;
      }

      const toolInput = petrinautAiMutationToolInputSchemas[toolName].parse(
        toolCall.input,
      );

      pendingMutationDiagnosticsVersionRef.current =
        diagnosticsVersionRef.current;

      const aiToolCall = {
        toolName,
        input: toolInput,
      } as Extract<AiToolCall, { toolName: PetrinautAiMutationToolName }>;

      const output = applyPetrinautAiMutation({
        aiToolCall,
        instance,
      });

      safelyAddToolOutput(addToolOutput, {
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  const composerSubmissionStateRef = useLatest({
    addToolOutput,
    interactiveTools: aiAssistant.interactiveTools,
    messages,
    sendMessage,
    status,
  });

  const composerToolSubmissionsRef = useRef(new Set<string>());
  useEffect(() => {
    const pendingToolCallIds = new Set<string>();
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "dynamic-tool" && part.state === "input-available") {
          pendingToolCallIds.add(part.toolCallId);
        }
      }
    }

    for (const toolCallId of composerToolSubmissionsRef.current) {
      if (!pendingToolCallIds.has(toolCallId)) {
        composerToolSubmissionsRef.current.delete(toolCallId);
      }
    }
  }, [messages]);

  // Hosts retain this callback across transport-driven rerenders, so its
  // identity is part of the public composer-control contract. The ref keeps
  // its implementation current without forcing host controls to resubscribe.
  const submitText = useCallback(
    async ({
      id,
      target = "auto",
      text,
    }: {
      id?: string;
      target?: "auto" | "message";
      text: string;
    }): Promise<PetrinautAiComposerSubmitTextResult> => {
      const trimmed = text.trim();
      if (!trimmed) {
        const submissionError = new Error(
          "AI assistant text must not be empty.",
        );
        setStreamError(submissionError);
        throw submissionError;
      }

      const {
        addToolOutput: submitToolOutput,
        interactiveTools,
        messages: currentMessages,
        sendMessage: submitMessage,
        status: currentStatus,
      } = composerSubmissionStateRef.current;
      if (currentStatus === "submitted" || currentStatus === "streaming") {
        const submissionError = new Error(
          "Wait for the current AI response before submitting more text.",
        );
        setStreamError(submissionError);
        throw submissionError;
      }

      const mappedToolCalls: {
        input: unknown;
        mapText: (params: { input: unknown; text: string }) => unknown;
        toolCallId: string;
        toolName: string;
      }[] = [];
      for (const message of target === "auto" ? currentMessages : []) {
        for (const part of message.parts) {
          if (
            part.type !== "dynamic-tool" ||
            part.state !== "input-available"
          ) {
            continue;
          }

          const definition = getInteractiveTool(
            part.toolName,
            part.input,
            interactiveTools,
          );
          if (!definition?.fromComposerText) {
            continue;
          }

          mappedToolCalls.push({
            input: part.input,
            mapText: definition.fromComposerText,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          });
        }
      }

      if (mappedToolCalls.length > 1) {
        const submissionError = new Error(
          "Text matches more than one pending interactive AI tool.",
        );
        setStreamError(submissionError);
        throw submissionError;
      }

      const mappedToolCall = mappedToolCalls[0];
      if (mappedToolCall) {
        if (composerToolSubmissionsRef.current.has(mappedToolCall.toolCallId)) {
          const submissionError = new Error(
            "This interactive AI tool is already being submitted.",
          );
          setStreamError(submissionError);
          throw submissionError;
        }

        let output: unknown;
        try {
          output = mappedToolCall.mapText({
            input: mappedToolCall.input,
            text: trimmed,
          });
        } catch (caught) {
          const submissionError =
            caught instanceof Error ? caught : new Error(String(caught));
          setStreamError(submissionError);
          throw submissionError;
        }

        setInput("");
        setStreamError(null);
        setStopped(false);
        stopRequestedRef.current = false;
        composerToolSubmissionsRef.current.add(mappedToolCall.toolCallId);
        try {
          await addDynamicToolOutput(submitToolOutput, {
            output,
            tool: mappedToolCall.toolName,
            toolCallId: mappedToolCall.toolCallId,
          });
        } catch (caught) {
          composerToolSubmissionsRef.current.delete(mappedToolCall.toolCallId);
          const submissionError =
            caught instanceof Error ? caught : new Error(String(caught));
          setStreamError(submissionError);
          throw submissionError;
        }

        return {
          kind: "interactive-tool",
          toolCallId: mappedToolCall.toolCallId,
        };
      }

      const messageId = id ?? generateId();
      setInput("");
      setStreamError(null);
      setStopped(false);
      stopRequestedRef.current = false;
      await submitMessage({
        id: messageId,
        parts: [{ text: trimmed, type: "text" }],
        role: "user",
      });
      return { kind: "message", messageId };
    },
    [composerSubmissionStateRef],
  );

  const pendingVoiceInputRef = useRef<{
    input: Parameters<PetrinautAiComposerSubmitText>[0];
    reject: (reason: unknown) => void;
    resolve: (result: PetrinautAiComposerSubmitTextResult) => void;
  } | null>(null);
  const submitVoiceInput = useCallback<PetrinautAiComposerSubmitText>(
    (voiceInput) => {
      const currentStatus = composerSubmissionStateRef.current.status;
      if (currentStatus !== "submitted" && currentStatus !== "streaming") {
        return submitText(voiceInput);
      }

      if (pendingVoiceInputRef.current) {
        const submissionError = new Error(
          "Wait for the queued voice input before submitting another.",
        );
        setStreamError(submissionError);
        return Promise.reject(submissionError);
      }

      return new Promise((resolve, reject) => {
        pendingVoiceInputRef.current = {
          input: voiceInput,
          reject,
          resolve,
        };
      });
    },
    [composerSubmissionStateRef, submitText],
  );

  useEffect(() => {
    const pendingVoiceInput = pendingVoiceInputRef.current;
    if (!pendingVoiceInput) {
      return;
    }
    if (status === "error") {
      pendingVoiceInputRef.current = null;
      pendingVoiceInput.reject(
        new Error("Brunch could not accept the queued voice input."),
      );
      return;
    }
    if (status !== "ready") {
      return;
    }

    pendingVoiceInputRef.current = null;
    void submitText(pendingVoiceInput.input).then(
      pendingVoiceInput.resolve,
      pendingVoiceInput.reject,
    );
  }, [status, submitText]);

  const stopStateRef = useLatest({ status, stop });

  const submitInterviewAnswer = useCallback<
    PetrinautAiComposerControlContext["submitText"]
  >(
    (answer) => {
      if (queuedInterviewAnswerRef.current) {
        return Promise.reject(
          new Error("The previous interview answer is still being submitted."),
        );
      }
      const currentStatus = composerSubmissionStateRef.current.status;
      if (currentStatus === "error") {
        return Promise.reject(
          new Error("The interview is not ready to accept an answer."),
        );
      }
      if (currentStatus === "ready") {
        return submitText(answer);
      }

      setInterviewAnswerQueued(true);
      return new Promise((resolve, reject) => {
        queuedInterviewAnswerRef.current = {
          input: answer,
          reject,
          resolve,
        };
      });
    },
    [composerSubmissionStateRef, submitText],
  );

  useEffect(() => {
    const queued = queuedInterviewAnswerRef.current;
    if (!queued) {
      return;
    }
    if (status === "error") {
      queuedInterviewAnswerRef.current = null;
      setInterviewAnswerQueued(false);
      queued.reject(new Error("The interview could not accept that answer."));
      return;
    }
    if (status !== "ready") {
      return;
    }

    queuedInterviewAnswerRef.current = null;
    setInterviewAnswerQueued(false);
    void submitText(queued.input).then(
      (result) => queued.resolve(result),
      (caught: unknown) => queued.reject(caught),
    );
  }, [status, submitText]);

  useEffect(
    () => () => {
      queuedInterviewAnswerRef.current?.reject(
        new Error("The interview conversation changed."),
      );
      queuedInterviewAnswerRef.current = null;
    },
    [conversationId],
  );

  // Like submitText, stop is exposed to host controls and must stay stable.
  const stopComposer = useCallback(async () => {
    const { status: currentStatus, stop: stopCurrentResponse } =
      stopStateRef.current;
    if (currentStatus !== "submitted" && currentStatus !== "streaming") {
      return;
    }

    stopRequestedRef.current = true;
    await stopCurrentResponse();
  }, [stopStateRef]);

  useEffect(() => {
    const trimmedInitialMessage = initialMessage?.trim();
    if (!trimmedInitialMessage) {
      submittedInitialMessageRef.current = null;
      return;
    }

    if (!isAiAssistantOpen || !instance) {
      return;
    }

    if (submittedInitialMessageRef.current === trimmedInitialMessage) {
      return;
    }

    submittedInitialMessageRef.current = trimmedInitialMessage;
    onInitialMessageConsumed?.();
    setInput("");
    setStreamError(null);
    setStopped(false);
    stopRequestedRef.current = false;

    void sendMessage({ text: trimmedInitialMessage });
  }, [
    initialMessage,
    instance,
    isAiAssistantOpen,
    onInitialMessageConsumed,
    sendMessage,
  ]);

  if (!instance) {
    return null;
  }

  // Chips are only meaningful before a conversation has begun — once the
  // user has typed or the AI has replied, they've signalled what they want
  // and the chips become noise.
  const hasConversation = messages.length > 0;
  const isNetEmpty =
    petriNetDefinition.places.length === 0 &&
    petriNetDefinition.transitions.length === 0;

  const promptChips = isNetEmpty
    ? hasConversation
      ? []
      : STARTER_CHIPS
    : REVIEW_CHIPS;

  const composerControlContext: PetrinautAiComposerControlContext = {
    conversationId,
    messages,
    status,
    stop: stopComposer,
    submitText,
    submitVoiceInput,
  };
  /* eslint-disable react-hooks-js/refs -- The public render prop receives
     stable event callbacks that read their refs only when the host invokes
     them from an event handler or effect. */
  const composerControl = aiAssistant.renderComposerControl?.(
    composerControlContext,
  );
  const interviewStage = aiAssistant.renderInterviewStage?.({
    ...composerControlContext,
    canAcceptInterviewAnswer: !interviewAnswerQueued,
    focusComposer: () => {
      setAiAssistantOpen(true);
      setComposerFocusRequest((request) => request + 1);
    },
    openSidebar: () => setAiAssistantOpen(true),
    placement: isAiAssistantOpen ? "sidebar" : "detached",
    setActive: setInterviewActive,
    submitInterviewAnswer,
  });
  /* eslint-enable react-hooks-js/refs */

  return (
    <AiAssistantContents
      clearMessagesDisabled={interviewActive}
      composerControl={composerControl}
      composerFocusRequest={composerFocusRequest}
      error={streamError ?? error}
      input={input}
      interviewStage={interviewStage}
      interactiveTools={aiAssistant.interactiveTools}
      isOpen={isAiAssistantOpen}
      messages={messages}
      onClearMessages={() => {
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
        setMessages([]);
        aiAssistant.onMessages?.([]);
        aiAssistant.onClearMessages?.();
      }}
      onClose={() => setAiAssistantOpen(false)}
      onInputChange={setInput}
      onInteractiveToolSubmit={({ toolCallId, toolName, output }) => {
        if (!isPetrinautAiCommandToolName(toolName)) {
          if (
            !aiAssistant.interactiveTools?.some(
              (tool) => tool.toolName === toolName,
            )
          ) {
            throw new Error(`Unknown AI tool: ${toolName}`);
          }

          return addDynamicToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output,
          });
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

        const readOnlyAtSubmit = readOnlyReasonRef.current;
        if (readOnlyAtSubmit !== null) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output: {
              applied: false,
              blocked: readOnlyAtSubmit.kind,
              reason: formatReadOnlyReason(readOnlyAtSubmit),
            } satisfies AiToolOutput,
          });
          return;
        }

        pendingMutationDiagnosticsVersionRef.current =
          diagnosticsVersionRef.current;

        void instance.commands.applyAutoLayout().then((result) => {
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output: toPetrinautAiToolOutput(
              summarizeApplyAutoLayout({ commitCount: result.commitCount }),
            ),
          });
        });
      }}
      onSelectToolTarget={(target) =>
        selectTarget(target, {
          navigateTo,
          selectItem,
        })
      }
      onSendPrompt={(prompt) => {
        void submitText({ target: "message", text: prompt }).catch(() => {});
      }}
      onStop={() => {
        // Flag the deliberate stop, then abort. The actual settling of the
        // partial transcript and the "Response stopped" note happen in
        // `onFinish`, once the SDK has fully unwound the stream — finalizing
        // here would race the chunks the SDK is still flushing.
        void stopComposer();
      }}
      onSubmit={() => {
        void submitText({ text: input }).catch(() => {});
      }}
      promptChips={promptChips}
      rightOffset={hasSelection ? propertiesPanelWidth + PANEL_MARGIN : 0}
      status={status}
      stopped={stopped}
    />
  );
};
