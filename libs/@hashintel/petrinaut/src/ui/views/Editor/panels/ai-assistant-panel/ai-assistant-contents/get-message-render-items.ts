import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core";

import { isToolPart, toToolRenderItem, type ToolRenderItem } from "./tool-list";

import type { PetrinautAiMessage } from "../types";

export type MessagePart = PetrinautAiMessage["parts"][number];
export type TextPart = Extract<MessagePart, { type: "text" }>;
export type ReasoningMessagePart = Extract<MessagePart, { type: "reasoning" }>;

export type MessageRenderItem =
  | { type: "reasoning"; key: string; part: ReasoningMessagePart }
  | { type: "text"; key: string; part: TextPart }
  | { type: "tools"; key: string; tools: ToolRenderItem[] };

export const isPartActive = (
  part: PetrinautAiMessage["parts"][number],
): boolean =>
  "state" in part &&
  (part.state === "streaming" ||
    part.state === "input-streaming" ||
    part.state === "input-available");

export const getMessageRenderItems = (
  message: PetrinautAiMessage,
): MessageRenderItem[] => {
  const items: MessageRenderItem[] = [];
  let pendingTools: ToolRenderItem[] = [];

  const flushTools = () => {
    if (pendingTools.length === 0) {
      return;
    }

    items.push({
      type: "tools",
      key: `${message.id}-tools-${items.length}`,
      tools: pendingTools,
    });
    pendingTools = [];
  };

  message.parts.forEach((part, index) => {
    if (part.type === "text") {
      flushTools();
      items.push({
        type: "text",
        key: `${message.id}-text-${index}`,
        part,
      });
      return;
    }

    if (part.type === "reasoning") {
      flushTools();
      items.push({
        type: "reasoning",
        key: `${message.id}-reasoning-${index}`,
        part,
      });
      return;
    }

    if (isToolPart(part)) {
      const tool = toToolRenderItem(message, part);

      if (
        tool.toolName === getLatestNetDefinitionToolName ||
        tool.toolName === getNetCompilationErrorsToolName ||
        tool.toolName === readPetrinautDocToolName
      ) {
        flushTools();
        pendingTools.push(tool);
        flushTools();
        return;
      }

      pendingTools.push(tool);
    }
  });

  flushTools();

  return items;
};
