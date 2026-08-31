"use agent";
/**
 * One plain Flue chat agent for the Petrinaut panel throughline.
 *
 * No elicitation, capture, or plugin. The model can call a server-side ping
 * and a browser-executed Petrinaut doc reader; Flue history is the session log.
 */

import { useModel, useTool } from "@flue/runtime";

import { ping } from "../tools/ping.ts";
import { readPetrinautDoc } from "../tools/read-petrinaut-doc.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export function ChatAgent() {
  useModel(`anthropic/${CHAT_MODEL_ID}`);
  useTool(ping);
  useTool(readPetrinautDoc);
  return [
    "You are a concise assistant inside the Petrinaut editor.",
    "Call ping when you need to confirm the server tool path.",
    "When the user asks how Petrinaut's UI works, call readPetrinautDoc.",
    "A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.",
  ].join("\n");
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
