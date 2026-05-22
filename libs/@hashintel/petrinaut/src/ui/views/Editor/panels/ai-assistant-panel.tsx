import { useChat } from "@ai-sdk/react";
import { use, useEffect, useRef, useState } from "react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";

import {
  createPetrinautAiWritableCallbacks,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  mutationActionInputSchemas as petrinautAiMutationToolInputSchemas,
  type PetrinautAiMutationToolName,
} from "../../../../core/ai";
import {
  aiCommandActionInputSchemas,
  type AiCommandActionName,
} from "../../../../core/command-schemas";
import type { Petrinaut } from "../../../../core/instance";
import { PetrinautInstanceContext } from "../../../../react/instance-context";
import { LanguageClientContext } from "../../../../react/lsp/context";
import {
  EditorContext,
  type EditorContextValue,
} from "../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import {
  formatReadOnlyReason,
  useReadOnlyReason,
} from "../../../../react/state/use-read-only-reason";
import { PANEL_MARGIN } from "../../../constants/ui";
import type { PetrinautAiAssistant } from "../../../petrinaut";
import { AiAssistantSurface } from "./ai-assistant-panel/ai-assistant-surface";
import { createDiagnosticsAwareAiTransport } from "./ai-assistant-panel/create-diagnostics-aware-ai-transport";
import { formatDiagnosticsForAi } from "./ai-assistant-panel/format-diagnostics-for-ai";
import { getInteractiveTool } from "./ai-assistant-panel/interactive-tools/registry";
import {
  type AiToolOutput,
  type AiToolCall,
  type AiToolTarget,
  summarizeApplyAutoLayout,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
} from "./ai-assistant-panel/tool-summaries";
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

const logToolCallError = ({
  error,
  input,
  toolName,
}: {
  error: unknown;
  input: unknown;
  toolName: string;
}) => {
  console.error("Petrinaut AI tool call failed", {
    error,
    input,
    toolName,
  });
};

const getErroredToolParts = (messages: PetrinautAiMessage[]) =>
  messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (
        !("state" in part) ||
        part.state !== "output-error" ||
        !part.type.startsWith("tool-")
      ) {
        return [];
      }

      const toolPart = part as {
        errorText?: unknown;
        input?: unknown;
        toolCallId?: unknown;
        type: string;
      };

      return [
        {
          errorText:
            typeof toolPart.errorText === "string"
              ? toolPart.errorText
              : undefined,
          input: toolPart.input,
          messageId: message.id,
          toolCallId:
            typeof toolPart.toolCallId === "string"
              ? toolPart.toolCallId
              : undefined,
          toolName: toolPart.type.replace(/^tool-/, ""),
        },
      ];
    }),
  );

const safelyAddToolOutput = (
  addToolOutput: ReturnType<
    typeof useChat<PetrinautAiMessage>
  >["addToolOutput"],
  params: Parameters<
    ReturnType<typeof useChat<PetrinautAiMessage>>["addToolOutput"]
  >[0],
) => {
  void Promise.resolve(addToolOutput(params)).catch((error: unknown) => {
    logToolCallError({
      error,
      input: undefined,
      toolName: String(params.tool),
    });
  });
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
  const { petriNetDefinition } = use(SDCPNContext);
  const [input, setInput] = useState("");
  const submittedInitialMessageRef = useRef<string | null>(null);
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

  const [diagnosticsTransportState, setDiagnosticsTransportState] = useState(
    () => ({
      source: aiAssistant.transport,
      transport: createDiagnosticsAwareAiTransport({
        getDiagnosticsContext: () => diagnosticsContextRef.current,
        transport: aiAssistant.transport,
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
    }),
  );

  useEffect(() => {
    if (diagnosticsTransportState.source === aiAssistant.transport) {
      return;
    }

    setDiagnosticsTransportState({
      source: aiAssistant.transport,
      transport: createDiagnosticsAwareAiTransport({
        getDiagnosticsContext: () => diagnosticsContextRef.current,
        transport: aiAssistant.transport,
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
    });
  }, [aiAssistant.transport, diagnosticsTransportState.source]);

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
    onFinish: ({ messages: finishedMessages }) => {
      aiAssistant.onMessages?.(finishedMessages);
    },
    onToolCall: async ({ toolCall }) => {
      try {
        if (!instance) {
          throw new Error(
            "Petrinaut AI cannot run without an editor instance.",
          );
        }
        if (toolCall.dynamic) {
          throw new Error(`Unknown Petrinaut AI tool: ${toolCall.toolName}`);
        }
        if (toolCall.toolName === getLatestNetDefinitionToolName) {
          safelyAddToolOutput(addToolOutput, {
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: instance.definition.get(),
          });
          return;
        }
        if (toolCall.toolName === getNetCompilationErrorsToolName) {
          await waitForDiagnosticsRefresh({
            consumePendingMutationDiagnosticsVersion: () => {
              const pendingVersion =
                pendingMutationDiagnosticsVersionRef.current;
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

        const toolName = toolCall.toolName;
        if (
          !isPetrinautAiMutationToolName(toolName) &&
          !isPetrinautAiCommandToolName(toolName)
        ) {
          throw new Error(
            `Unknown Petrinaut AI tool: ${String(toolName as string)}`,
          );
        }

        const currentReadOnlyReason = readOnlyReasonRef.current;
        if (currentReadOnlyReason !== null) {
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
      } catch (toolError) {
        logToolCallError({
          error: toolError,
          input: toolCall.input,
          toolName: toolCall.toolName,
        });
        throw toolError;
      }
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
    void sendMessage({ text: trimmedInitialMessage });
  }, [
    initialMessage,
    instance,
    isAiAssistantOpen,
    onInitialMessageConsumed,
    sendMessage,
  ]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const lastMessage = messages.at(-1);
    console.error("Petrinaut AI chat failed", {
      error,
      lastMessage,
      messageCount: messages.length,
      status,
    });
  }, [error, messages, status]);

  const loggedErroredToolCallsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const toolPart of getErroredToolParts(messages)) {
      const key = `${toolPart.messageId}:${toolPart.toolCallId ?? toolPart.toolName}`;
      if (loggedErroredToolCallsRef.current.has(key)) {
        continue;
      }

      loggedErroredToolCallsRef.current.add(key);
      console.error("Petrinaut AI tool call failed", toolPart);
    }
  }, [messages]);

  if (!isAiAssistantOpen || !instance) {
    return null;
  }

  return (
    <AiAssistantSurface
      error={error}
      input={input}
      messages={messages}
      onClearMessages={() => {
        if (status === "submitted" || status === "streaming") {
          void stop();
        }
        setInput("");
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
      onStop={() => void stop()}
      onSubmit={() => {
        const trimmed = input.trim();
        if (!trimmed) {
          return;
        }
        setInput("");
        void sendMessage({ text: trimmed });
      }}
      rightOffset={hasSelection ? propertiesPanelWidth + PANEL_MARGIN : 0}
      status={status}
    />
  );
};
