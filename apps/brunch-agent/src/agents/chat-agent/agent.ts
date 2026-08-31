"use agent";
/**
 * Register and compose the Brunch agent for this Flue application.
 *
 * Brunch core owns the stable agent prompt. The SDCPN plugin owns its prompt
 * contribution, runbook skill, and construction tools. This application owns
 * Petrinaut host tools and transport-specific instructions.
 */

import { useInstruction, useTool } from "@flue/runtime";

import {
  sdcpnInitialDataSchema,
  useSdcpnPlugin,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import sdcpnModellingSkill from "@hashintel/brunch-agent-plugin-sdcpn/skills/sdcpn-modelling/SKILL.md";
import { useBrunchAgent } from "@hashintel/brunch-agent/flue";

import { ping } from "./tools/ping.ts";
import { readPetrinautDoc } from "./tools/read-petrinaut-doc.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const RUNBOOK_SKILL_NAME = sdcpnModellingSkill.name;

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

export function ChatAgent() {
  const coreSystemPrompt = useBrunchAgent(`anthropic/${CHAT_MODEL_ID}`);
  useSdcpnPlugin(sdcpnModellingSkill);

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
When the user asks how Petrinaut's UI works, call readPetrinautDoc.
A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.
`.replace(/^\s+|\s+$/gu, ""),
  );
  useTool(ping);
  useTool(readPetrinautDoc);

  return coreSystemPrompt;
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
ChatAgent.initialData = sdcpnInitialDataSchema;
