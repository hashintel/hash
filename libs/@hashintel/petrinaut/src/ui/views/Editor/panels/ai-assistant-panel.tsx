import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { use, useEffect, useRef, useState } from "react";

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
import { getInteractiveTool } from "./ai-assistant-panel/interactive-tools/registry";
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
import type { PetrinautAiMessage } from "./ai-assistant-panel/types";

export type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel/types";

const selectTarget = (
  target: AiToolTarget,
  actions: Pick<
    EditorContextValue,
    "selectItem" | "setGlobalMode" | "setSimulateDrawer" | "setSimulateViewMode"
  >,
) => {
  if (target.kind === "selection") {
    actions.selectItem(target.item);
    return;
  }

  actions.setGlobalMode("simulate");
  actions.setSimulateViewMode(target.mode);
  actions.setSimulateDrawer(
    target.mode === "scenarios"
      ? target.itemId
        ? { type: "view-scenario", scenarioId: target.itemId }
        : { type: "closed" }
      : target.itemId
        ? { type: "view-metric", metricId: target.itemId }
        : { type: "closed" },
  );
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
    propertiesPanelWidth,
    selectItem,
    setAiAssistantOpen,
    setGlobalMode,
    setSimulateDrawer,
    setSimulateViewMode,
  } = use(EditorContext);

  const { petriNetDefinition, setTitle, title } = use(SDCPNContext);

  const [input, setInput] = useState("");
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
    messages,
    addToolOutput,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<PetrinautAiMessage>({
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
        throw new Error(`Unknown AI tool: ${toolCall.toolName}`);
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
        if (getInteractiveTool(toolName, commandInput)) {
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

  if (!isAiAssistantOpen || !instance) {
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

  return (
    <AiAssistantContents
      error={streamError ?? error}
      input={input}
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
          // Defensive — the registry only exposes AI command tools today.
          return;
        }

        // applyAutoLayout is the only interactive command today. The widget
        // signals "apply" by passing `{ applied: true }`; we still need to
        // run the command to compute the real commitCount before reporting
        // the outcome to the AI. Decline outputs are forwarded verbatim.
        if (output.applied !== true) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolName,
            toolCallId,
            output,
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
          selectItem,
          setGlobalMode,
          setSimulateDrawer,
          setSimulateViewMode,
        })
      }
      onSendPrompt={(prompt) => {
        const trimmed = prompt.trim();
        if (!trimmed) {
          return;
        }
        setInput("");
        setStreamError(null);
        setStopped(false);
        stopRequestedRef.current = false;
        void sendMessage({ text: trimmed });
      }}
      onStop={() => {
        // Flag the deliberate stop, then abort. The actual settling of the
        // partial transcript and the "Response stopped" note happen in
        // `onFinish`, once the SDK has fully unwound the stream — finalizing
        // here would race the chunks the SDK is still flushing.
        stopRequestedRef.current = true;
        void stop();
      }}
      onSubmit={() => {
        const trimmed = input.trim();
        if (!trimmed) {
          return;
        }
        setInput("");
        setStreamError(null);
        setStopped(false);
        stopRequestedRef.current = false;
        void sendMessage({ text: trimmed });
      }}
      promptChips={promptChips}
      rightOffset={hasSelection ? propertiesPanelWidth + PANEL_MARGIN : 0}
      status={status}
      stopped={stopped}
    />
  );
};
