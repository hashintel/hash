"use agent";
/**
 * Register and compose the Brunch agent for this Flue application.
 *
 * Brunch core owns the context-independent agent prompt. The SDCPN plugin owns
 * its Petrinaut-facing prompt, runbook skill, and tools. This application owns
 * deployment diagnostics and transport-specific instructions.
 */

import { useDelivery, useInstruction, useTool } from "@flue/runtime";

import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnInitialDataSchema,
  useSdcpnPlugin,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { useBrunchAgent } from "@hashintel/brunch-agent/flue";

import { ping } from "./tools/ping.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const RUNBOOK_SKILL_NAME = SDCPN_MODELLING_SKILL_NAME;

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

export function ChatAgent() {
  const coreSystemPrompt = useBrunchAgent(`anthropic/${CHAT_MODEL_ID}`);
  useSdcpnPlugin();

  // FE-1630 local Flue 2.0.3 patch: a per-delivery presentation preference,
  // not provenance or permission. Never interpolate caller-supplied instructions.
  const context = useDelivery().context;
  if (
    typeof context === "object" &&
    context !== null &&
    "responseMode" in context &&
    context.responseMode === "voice"
  ) {
    useInstruction(`Voice response presentation for this delivery only:
Write the complete canonical on-screen response normally, with the same content and detail you would provide for typed delivery. Do not shorten or reshape it for speech: Realtime rephrases the completed response later.
Before presenting a direct question for the person to answer, call brunch_mark_question with its exact text; then present the marked question in its exact wording in ordinary assistant prose.
A source-attributed or repeated question still needs a marker when you ask the person to answer it. Do not mark quoted questions you are only discussing, rhetorical questions, or headings.
The marker supplies question_text for exact Voice delivery. An unmarked question may be omitted from the spoken rephrasing.
These are presentation instructions only. Retain all domain, evidence, workpiece, and tool obligations.`);
  }

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
A client-tool-result signal is JSON [{ toolCallId, toolName, output }]. Treat output as the browser's result for that call and continue helping the user.
`.replace(/^\s+|\s+$/gu, ""),
  );
  useTool(ping);

  return coreSystemPrompt;
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal.
 */
ChatAgent.agentName = "brunch-chat-agent";
ChatAgent.initialData = sdcpnInitialDataSchema;
