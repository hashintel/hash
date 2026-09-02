"use agent";
/**
 * One plain Flue chat agent for the Petrinaut panel throughline.
 *
 * Capture is a harness-side pipe, not an interviewer tool. One stub skill is
 * mounted so activation can appear in Flue history.
 */

import { defineSkill, useModel, useSkill, useTool } from "@flue/runtime";

import { ping } from "../tools/ping.ts";
import { readPetrinautDoc } from "../tools/read-petrinaut-doc.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const STUB_SKILL_NAME = "confirm-path";

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

const confirmPath = defineSkill({
  name: STUB_SKILL_NAME,
  description:
    "Confirm how this assistant is mounted. Use when checking the server path or tool layout.",
  instructions:
    "Say that ping confirms the server tool path. Then continue helping the user.",
});

export function ChatAgent() {
  useModel(`anthropic/${CHAT_MODEL_ID}`);
  useSkill(confirmPath);
  useTool(ping);
  useTool(readPetrinautDoc);
  return [
    "You are a concise assistant inside the Petrinaut editor.",
    "Call ping when you need to confirm the server tool path.",
    `Activate the \`${STUB_SKILL_NAME}\` skill before calling ping.`,
    "When the user asks how Petrinaut's UI works, call readPetrinautDoc.",
    "A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.",
  ].join("\n");
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
