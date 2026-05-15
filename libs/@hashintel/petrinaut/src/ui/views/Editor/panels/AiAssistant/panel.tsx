import { useChat } from "@ai-sdk/react";
import { use, useEffect, useRef, useState } from "react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";

import {
  createPetrinautMutationAiToolCallbacks,
  getLatestNetDefinitionToolName,
  petrinautAiMutationToolInputSchemas,
  type PetrinautAiMutationToolInput,
  type PetrinautAiMutationToolName,
} from "../../../../../core/ai";
import type { Petrinaut } from "../../../../../core/instance";
import type { SDCPN } from "../../../../../core/types/sdcpn";
import { PetrinautInstanceContext } from "../../../../../react/instance-context";
import {
  EditorContext,
  type EditorContextValue,
} from "../../../../../react/state/editor-context";
import { PANEL_MARGIN } from "../../../../constants/ui";
import type { PetrinautAiAssistant } from "../../../../petrinaut";
import { AiAssistantSurface } from "./assistant-surface";
import {
  type AiToolOutput,
  type AiToolCall,
  type AiToolTarget,
  summarizePetrinautAiToolCall,
  toPetrinautAiToolOutput,
} from "./tool-summaries";
import type { PetrinautAiMessage } from "./types";

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

const applyPetrinautAiTool = <Name extends PetrinautAiMutationToolName>({
  definition,
  input,
  instance,
  toolName,
}: {
  definition: SDCPN;
  input: PetrinautAiMutationToolInput<Name>;
  instance: Petrinaut;
  toolName: Name;
}): AiToolOutput => {
  const toolCallbacks = createPetrinautMutationAiToolCallbacks(instance);
  const aiToolCall: AiToolCall = { input, toolName } as AiToolCall;
  const summary = summarizePetrinautAiToolCall(aiToolCall, { definition });
  const callback = toolCallbacks[aiToolCall.toolName] as (
    input: typeof aiToolCall.input,
  ) => void;

  callback(aiToolCall.input);

  return toPetrinautAiToolOutput(summary);
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
  const [input, setInput] = useState("");
  const submittedInitialMessageRef = useRef<string | null>(null);

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
    transport: aiAssistant.transport,
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

        if (!isPetrinautAiMutationToolName(toolCall.toolName)) {
          throw new Error(`Unknown Petrinaut AI tool: ${toolCall.toolName}`);
        }

        const toolInput = petrinautAiMutationToolInputSchemas[
          toolCall.toolName
        ].parse(toolCall.input);
        const output = applyPetrinautAiTool({
          definition: instance.definition.get(),
          input: toolInput,
          instance,
          toolName: toolCall.toolName,
        });

        safelyAddToolOutput(addToolOutput, {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      } catch (error) {
        logToolCallError({
          error,
          input: toolCall.input,
          toolName: toolCall.toolName,
        });
        throw error;
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
