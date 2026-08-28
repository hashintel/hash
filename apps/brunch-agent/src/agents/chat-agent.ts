"use agent";
/**
 * One Flue chat agent for the Petrinaut panel throughline.
 *
 * Capture is a harness-side pipe, not an interviewer tool. One runbook skill
 * carries the modelling lifecycle and its supporting resources.
 */

import { useInitialData, useModel, useSkill, useTool } from "@flue/runtime";
import * as v from "valibot";

import sdcpnModellingSkill from "../skills/sdcpn-modelling/SKILL.md";
import {
  petrinautConstructionTools,
  VALIDATED_CONSTRUCTION_MODE,
} from "../tools/petrinaut-construction.ts";
import { ping } from "../tools/ping.ts";
import { readPetrinautDoc } from "../tools/read-petrinaut-doc.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const RUNBOOK_SKILL_NAME = sdcpnModellingSkill.name;

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

export const chatAgentInitialDataSchema = v.optional(
  v.object({
    mode: v.literal(VALIDATED_CONSTRUCTION_MODE),
  }),
);

export type ChatAgentInitialData = v.InferOutput<
  typeof chatAgentInitialDataSchema
>;

export function ChatAgent() {
  const initialData = useInitialData<ChatAgentInitialData>();
  useModel(`anthropic/${CHAT_MODEL_ID}`);
  useSkill(sdcpnModellingSkill);
  useTool(ping);
  useTool(readPetrinautDoc);
  if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    for (const constructionTool of petrinautConstructionTools) {
      useTool(constructionTool);
    }
  }
  const instructions = [
    "You are the Brunch modelling assistant inside the Petrinaut editor.",
    `Activate the \`${RUNBOOK_SKILL_NAME}\` skill before interviewing or constructing a process model.`,
    "The Markdown IR is the shared workpiece of one looping lifecycle.",
    "Call ping when you need to confirm the server tool path.",
    "When the user asks how Petrinaut's UI works, call readPetrinautDoc.",
    "A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.",
  ];
  if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    instructions.push(
      "This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.",
    );
  }
  return instructions.join("\n");
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
ChatAgent.initialData = chatAgentInitialDataSchema;
