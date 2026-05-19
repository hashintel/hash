import type { ChatTransport } from "ai";

import type { PetrinautAiMessage, PetrinautAiTransport } from "./types";

const diagnosticsContextMessageId = "petrinaut-diagnostics-context";

const createDiagnosticsContextMessage = (
  diagnosticsContext: string,
): PetrinautAiMessage =>
  ({
    id: diagnosticsContextMessageId,
    role: "user",
    parts: [
      {
        type: "text",
        text: [
          "Petrinaut diagnostics context only; this is not a user request.",
          "The following TypeScript diagnostics reflect the current Petrinaut model after client-side tool execution.",
          "Use them to decide whether more tool calls are needed before replying to the user.",
          "",
          diagnosticsContext,
        ].join("\n"),
      },
    ],
  }) as PetrinautAiMessage;

const lastMessageIsCompleteToolResultMessage = (
  messages: PetrinautAiMessage[],
) => {
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") {
    return false;
  }

  const toolParts = lastMessage.parts.filter((part) =>
    part.type.startsWith("tool-"),
  );

  return (
    toolParts.length > 0 &&
    toolParts.every(
      (part) =>
        "state" in part &&
        (part.state === "output-available" || part.state === "output-error"),
    )
  );
};

export const createDiagnosticsAwareAiTransport = ({
  getDiagnosticsContext,
  transport,
  waitForDiagnosticsRefresh,
}: {
  getDiagnosticsContext: () => string;
  transport: PetrinautAiTransport;
  waitForDiagnosticsRefresh: () => Promise<void>;
}): PetrinautAiTransport => {
  const wrappedTransport: ChatTransport<PetrinautAiMessage> = {
    reconnectToStream: (options) => transport.reconnectToStream(options),
    sendMessages: async (options) => {
      if (!lastMessageIsCompleteToolResultMessage(options.messages)) {
        return transport.sendMessages(options);
      }

      await waitForDiagnosticsRefresh();

      return transport.sendMessages({
        ...options,
        messages: [
          ...options.messages,
          createDiagnosticsContextMessage(getDiagnosticsContext()),
        ],
      });
    },
  };

  return wrappedTransport;
};
