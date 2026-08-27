"use agent";
/**
 * One plain Flue chat agent for the Petrinaut panel throughline.
 *
 * No elicitation, capture, or plugin. The model can call a server-side ping
 * and a browser-executed Petrinaut doc reader; Flue history is the session log.
 */

import { useModel, useTool } from "@flue/runtime";
import * as v from "valibot";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const PING_TOOL_NAME = "ping";
export const READ_PETRINAUT_DOC_TOOL_NAME = "readPetrinautDoc";

export function ChatAgent() {
  useModel(`anthropic/${CHAT_MODEL_ID}`);
  useTool({
    name: PING_TOOL_NAME,
    description:
      "Return a short server-side acknowledgement. Call this when you need to confirm the server is in the loop.",
    input: v.object({
      note: v.optional(v.pipe(v.string(), v.nonEmpty())),
    }),
    run({ data }) {
      return { output: { ok: true as const, note: data.note ?? "pong" } };
    },
  });
  useTool({
    name: READ_PETRINAUT_DOC_TOOL_NAME,
    description:
      "Read one page of the Petrinaut user guide. The browser executes this tool. After you call it, wait for a client-tool-result signal carrying the page text, then continue from that text.",
    input: v.object({
      doc: v.pipe(v.string(), v.nonEmpty()),
    }),
    run() {
      return { output: { awaiting: "client" as const }, terminate: true };
    },
  });
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
