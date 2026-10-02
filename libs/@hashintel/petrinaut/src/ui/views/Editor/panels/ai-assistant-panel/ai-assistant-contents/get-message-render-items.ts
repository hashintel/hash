import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
} from "@hashintel/petrinaut-core";

import {
  getPetrinautAiInteractiveToolDefinition,
  type PetrinautAiInteractiveTool,
} from "../../../../../types/ai-interactive-tool";
import {
  getToolName,
  isToolPart,
  toToolRenderItem,
  type ToolRenderItem,
} from "./tool-list";

import type { PetrinautAiToolPresentationResolver } from "../../../../../petrinaut";
import type { PetrinautAiMessage } from "../types";
import type { ExperimentToolPart } from "./experiment-card";

export type MessagePart = PetrinautAiMessage["parts"][number];
export type TextPart = Extract<MessagePart, { type: "text" }>;
export type ReasoningMessagePart = Extract<MessagePart, { type: "reasoning" }>;
type TextItem = { key: string; part: TextPart };
type ReasoningItem = { key: string; part: ReasoningMessagePart };

/** Optional AI SDK data parts. The mediation producer owns their emission. */
export type VoiceAgentLine = { text: string; state: "streaming" | "done" };
export type VoiceBrief = {
  fields: Record<string, string>;
  state: "streaming" | "done";
  preparationFailed?: boolean;
};

export type MessageRenderItems = {
  work: {
    reasoning: ReasoningItem[];
    tools: ToolRenderItem[];
  };
  answers: TextItem[];
  cards: (
    | { type: "experiment"; key: string; part: ExperimentToolPart }
    | { type: "tool"; key: string; tool: ToolRenderItem }
  )[];
  brief?: VoiceBrief;
  voiceAgentReply?: VoiceAgentLine;
  voiceAgentWrapUp?: VoiceAgentLine;
};

/** One entry per run of the message, in the order its parts arrived. */
export type ChronologicalRenderItem =
  | { type: "reasoning"; key: string; part: ReasoningMessagePart }
  | { type: "text"; key: string; part: TextPart }
  | { type: "experiment"; key: string; part: ExperimentToolPart }
  | { type: "tools"; key: string; tools: ToolRenderItem[] };

const emptyHiddenToolNames: ReadonlySet<string> = new Set();

/**
 * The stock presentation's reading of a message: text, reasoning, experiments
 * and runs of consecutive tool calls interleaved exactly as they streamed.
 */
export const getChronologicalRenderItems = (
  message: PetrinautAiMessage,
  interactiveTools: readonly PetrinautAiInteractiveTool[] = [],
  resolveToolPresentation?: PetrinautAiToolPresentationResolver,
  hiddenToolNames: ReadonlySet<string> = emptyHiddenToolNames,
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
      if (hiddenToolNames.has(getToolName(part))) {
        return;
      }
      const tool = toToolRenderItem(
        message,
        part,
        interactiveTools,
        resolveToolPresentation,
      );

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

/** The Brunch presentation's reading of a message, grouped by role in the turn. */
export const getMessageRenderItems = (
  message: PetrinautAiMessage,
  interactiveTools: readonly PetrinautAiInteractiveTool[] = [],
  resolveToolPresentation?: PetrinautAiToolPresentationResolver,
  hiddenToolNames: ReadonlySet<string> = emptyHiddenToolNames,
): MessageRenderItems => {
  const turn: MessageRenderItems = {
    work: { reasoning: [], tools: [] },
    answers: [],
    cards: [],
  };
  const cardToolNames = new Set(
    interactiveTools
      .filter(
        (tool) =>
          getPetrinautAiInteractiveToolDefinition(tool).placement === "card",
      )
      .map(({ toolName }) => toolName),
  );
  message.parts.forEach((part, index) => {
    const key = `${message.id}-${index}`;
    if (part.type === "text") {
      turn.answers.push({ key, part });
    } else if (part.type === "reasoning") {
      turn.work.reasoning.push({ key, part });
    } else if (part.type === "tool-createExperiment") {
      turn.cards.push({ type: "experiment", key: part.toolCallId, part });
    } else if (isToolPart(part)) {
      if (hiddenToolNames.has(getToolName(part))) return;
      const tool = toToolRenderItem(
        message,
        part,
        interactiveTools,
        resolveToolPresentation,
      );
      // Drafts remain mounted outside disclosures in every state: preparation
      // and execution must not depend on whether the person expands Brunch's work.
      if (cardToolNames.has(tool.toolName)) {
        turn.cards.push({ type: "tool", key: tool.id, tool });
      } else {
        turn.work.tools.push(tool);
      }
    } else if (
      "data" in part &&
      typeof part.data === "object" &&
      part.data !== null
    ) {
      const data = part.data as Record<string, unknown>;
      const state = data.state === "streaming" ? "streaming" : "done";
      if (
        part.type === "data-brief" &&
        typeof data.fields === "object" &&
        data.fields !== null
      ) {
        const fields = Object.fromEntries(
          Object.entries(data.fields).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
        turn.brief = {
          fields,
          state,
          ...(data.preparationFailed === true
            ? { preparationFailed: true }
            : {}),
        };
      } else if (typeof data.text === "string") {
        if (part.type === "data-voiceAgentReply")
          turn.voiceAgentReply = { text: data.text, state };
        if (part.type === "data-voiceAgentWrapUp")
          turn.voiceAgentWrapUp = { text: data.text, state };
      }
    }
  });
  return turn;
};
