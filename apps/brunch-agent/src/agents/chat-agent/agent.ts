"use agent";
/**
 * Register and compose the Brunch agent for this Flue application.
 *
 * Brunch core owns the context-independent agent prompt. The SDCPN plugin owns
 * its Petrinaut-facing prompt, runbook skill, and tools. This application owns
 * deployment diagnostics and transport-specific instructions.
 */

import {
  useContextProjection,
  useInitialData,
  useInstruction,
  useTool,
  type AgentProps,
} from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";

import { createWorkpieceReadTool } from "@hashintel/brunch-agent";
import {
  canonicalContent,
  sdcpnInitialDataSchema,
  type SdcpnInitialData,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { useSdcpnPlugin } from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { useBrunchAgent } from "@hashintel/brunch-agent/flue";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../chat-model.ts";
import { issueBrowserCall } from "../../conversation/browser-call-rendezvous.ts";
import { latestNetReadBefore } from "../../conversation/net-changes.ts";
import { createQueryWorkpieceTool } from "../../conversation/why.ts";
import { workpieceEvidenceSources } from "../../conversation/workpiece.ts";
import { projectBrunchContext } from "./context-projection.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const CHAT_MODEL_SPECIFIER = selectChatModelSpecifier();
const chatThinkingLevel = selectChatThinking();

const testCompactionConfig = loadTestCompactionConfig();
const chatModelOptions = {
  ...(chatThinkingLevel === undefined
    ? {}
    : { thinkingLevel: chatThinkingLevel }),
  ...(testCompactionConfig === undefined
    ? {}
    : { compaction: testCompactionConfig }),
};

export function ChatAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  useContextProjection(projectBrunchContext);
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
  const readSources = async () => workpieceEvidenceSources(await history());
  const coreSystemPrompt = useBrunchAgent(
    CHAT_MODEL_SPECIFIER,
    chatModelOptions,
    (currentRevision) => {
      useSdcpnPlugin(
        initialData
          ? {
              authorizeDraft: async (draftCallId: string) => {
                if (!latestNetReadBefore(await history(), draftCallId))
                  throw new Error(
                    "Experiment draft requires a prior canonical net read.",
                  );
              },
              executeBrowserTool: async ({
                toolName,
                input,
                toolCallId,
                signal,
              }) => {
                const result = await issueBrowserCall({
                  instanceId: id,
                  toolCallId,
                  toolName,
                  canonicalInput: input,
                  binding: canonicalContent(initialData.binding),
                  signal,
                });
                return { output: result.output, metadata: result.metadata };
              },
            }
          : {},
      );
      if (initialData) {
        useTool(createWorkpieceReadTool({ currentRevision, readSources }));
        useTool(
          createQueryWorkpieceTool({
            current: currentRevision,
            browser: initialData,
            history,
          }),
        );
      }
    },
    initialData
      ? async (current: WorkpieceRevision | null) =>
          workpieceEvidenceSources(await history(), current)
      : undefined,
    initialData !== undefined,
  );

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
${
  initialData
    ? "Canonical browser tools return actual browser outputs as ordinary tool results, under the output key with host-only metadata; continue the task after each result. A browser operation does not require a prior Ledger revision. Independent server and browser calls may share a proposal, but a concurrent Ledger write is not evidence of a settled browser effect; make a dependent call only after the result it depends on has returned. Never repeat an attempted write whose outcome is unknown."
    : "This conversation has no browser tools; use the available server tools and modelling skill."
}
`.replace(/^\s+|\s+$/gu, ""),
  );
  if (initialData)
    useInstruction(
      `
When the user asks why a visible element exists, do not answer from memory. If no current ${getLatestNetDefinitionToolName} read exists or the net may have changed since it, read the net first, then call query_workpiece with the element's kind and recorded name or ID (for an arc, the transition ID, direction and place ID). The answer lists associated applied calls and the workpiece revision current at each call; chronological association is not semantic justification. If no call is associated, say so plainly.
`.replace(/^\s+|\s+$/gu, ""),
    );
  useTool(ping);

  return coreSystemPrompt;
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal,
 * and Flue requires it to be a literal here.
 */
ChatAgent.agentName = "brunch-chat-agent";
ChatAgent.initialData = sdcpnInitialDataSchema;
