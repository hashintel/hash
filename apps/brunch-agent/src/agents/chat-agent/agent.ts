"use agent";
/**
 * Register and compose the Brunch agent for this Flue application.
 *
 * Brunch core owns the context-independent agent prompt. The SDCPN plugin owns
 * its Petrinaut-facing prompt, runbook skill, and tools. This application owns
 * deployment diagnostics and transport-specific instructions.
 */

import {
  useAgentStart,
  useDelivery,
  useInitialData,
  useInstruction,
  useTool,
  type AgentProps,
} from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";

import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnInitialDataSchema,
  useSdcpnPlugin,
  type SdcpnInitialData,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { useBrunchAgent } from "@hashintel/brunch-agent/flue";

import { CLIENT_TOOL_RESULT_SIGNAL } from "../../conversation/client-tools.ts";
import {
  retainedSettledRevision,
  verifyRootArcResults,
} from "../../conversation/root-arc.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

export const CHAT_MODEL_ID =
  process.env["BRUNCH_CHAT_MODEL"] || "claude-haiku-4-5";

export const RUNBOOK_SKILL_NAME = SDCPN_MODELLING_SKILL_NAME;

export const ACTIVATE_SKILL_TOOL_NAME = "activate_skill";

const testCompactionConfig = loadTestCompactionConfig();

export function ChatAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  const delivery = useDelivery();
  // Agent-local acquisition of this already-authorized instance's public history.
  // Reuse the existing router and storage; no listener, companion log or private records.
  const history = () => {
    const router = createAgentRouter(ChatAgent);
    return createFlueClient({
      url: `http://brunch.local/${id}`,
      fetch: async (input, init) =>
        router.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    }).history();
  };
  const coreSystemPrompt = useBrunchAgent(
    `anthropic/${CHAT_MODEL_ID}`,
    testCompactionConfig,
    (currentRevision) =>
      useSdcpnPlugin({
        currentRevision,
        retainedRevisionFor: async (revisionId) =>
          retainedSettledRevision(await history(), revisionId),
      }),
  );
  useAgentStart(async () => {
    if (
      initialData?.browser &&
      delivery.kind === "signal" &&
      (delivery.type === CLIENT_TOOL_RESULT_SIGNAL ||
        delivery.tagName === CLIENT_TOOL_RESULT_SIGNAL)
    ) {
      await verifyRootArcResults({
        body: delivery.body,
        snapshot: await history(),
        ...initialData.browser,
      });
    }
  });

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
A client-tool-result signal is JSON [{ toolCallId, toolName, output, metadata? }]. Treat output as the browser's canonical result for that call and continue helping the user once; never reapply a completed mutation. For a joined root arc, metadata.transitionRecord contains verified observations and effects, not assistant prose or user testimony. Failed, stale, no-op and unknown attempts are not causes.
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
