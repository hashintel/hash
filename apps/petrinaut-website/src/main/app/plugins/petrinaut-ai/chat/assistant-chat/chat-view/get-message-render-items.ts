import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core";

import { isToolPart, toToolRenderItem, type ToolRenderItem } from "./tool-list";

import type { PetrinautAiMessage } from "../../ai-message";
import type { ExperimentToolPart } from "./experiment-card";

export type MessagePart = PetrinautAiMessage["parts"][number];
export type TextPart = Extract<MessagePart, { type: "text" }>;
export type ReasoningMessagePart = Extract<MessagePart, { type: "reasoning" }>;

/** One entry per run of the message, in the order its parts arrived. */
export type ChronologicalRenderItem =
  | { type: "reasoning"; key: string; part: ReasoningMessagePart }
  | { type: "text"; key: string; part: TextPart }
  | { type: "experiment"; key: string; part: ExperimentToolPart }
  | { type: "tools"; key: string; tools: ToolRenderItem[] };

/**
 * A message's text, reasoning, experiments and runs of consecutive tool calls,
 * interleaved exactly as they streamed.
 */
export const getChronologicalRenderItems = (
  message: PetrinautAiMessage,
): ChronologicalRenderItem[] => {
  const items: ChronologicalRenderItem[] = [];
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
    if (part.type === "step-start") {
      flushTools();
      return;
    }

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

    if (part.type === "tool-createExperiment") {
      flushTools();
      items.push({ type: "experiment", key: part.toolCallId, part });
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
