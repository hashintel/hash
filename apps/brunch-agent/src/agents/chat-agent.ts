"use agent";
/**
 * One Flue chat agent for the Petrinaut panel throughline.
 *
 * Capture is a harness-side pipe, not an interviewer tool. One runbook skill
 * carries the modelling lifecycle and its supporting resources.
 */

import { useModel, useSkill, useTool } from "@flue/runtime";

import {
  RUNBOOK_SKILL_NAME,
  sdcpnModellingSkill,
} from "../skills/sdcpn-modelling.ts";
import { ping } from "../tools/ping.ts";
import { readPetrinautDoc } from "../tools/read-petrinaut-doc.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export { RUNBOOK_SKILL_NAME };

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

export function ChatAgent() {
  useModel(`anthropic/${CHAT_MODEL_ID}`);
  useSkill(sdcpnModellingSkill);
  useTool(ping);
  useTool(readPetrinautDoc);
  return [
    "You are the Brunch modelling assistant inside the Petrinaut editor.",
    `Activate the \`${RUNBOOK_SKILL_NAME}\` skill before interviewing or constructing a process model.`,
    "The Markdown IR is the shared workpiece of one looping lifecycle.",
    "Call ping when you need to confirm the server tool path.",
    "When the user asks how Petrinaut's UI works, call readPetrinautDoc.",
    "A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.",
  ].join("\n");
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
