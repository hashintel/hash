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
  parseClientToolResultMetadata,
  type ConstructionMutationRequest,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnInitialDataSchema,
  useSdcpnPlugin,
  type BrowserContext,
  type SdcpnInitialData,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { parseClientToolResults } from "@hashintel/brunch-agent-transport-aisdk";
import {
  createWorkpieceReadTool,
  useBrunchAgent,
} from "@hashintel/brunch-agent/flue";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { selectChatModel } from "../../chat-model.ts";
import {
  ACTIVATE_SKILL_TOOL_NAME,
  isClientToolResultDelivery,
} from "../../conversation/client-tools.ts";

export { ACTIVATE_SKILL_TOOL_NAME };
import {
  verifyRootArcResults,
  assertConstructionIdentity,
} from "../../conversation/root-arc.ts";
import {
  createRootArcWhyTool,
  recordedBrowserObservation,
} from "../../conversation/why.ts";
import {
  retainedSettledRevision,
  workpieceEvidenceSources,
} from "../../conversation/workpiece.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

export const CHAT_MODEL_ID = selectChatModel();

export const RUNBOOK_SKILL_NAME = SDCPN_MODELLING_SKILL_NAME;

const testCompactionConfig = loadTestCompactionConfig();

export function ChatAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  const delivery = useDelivery();
  const browserContext: BrowserContext | undefined = initialData?.construction
    ? { ...initialData.construction, construction: true }
    : initialData?.browser;
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
  const activeObservationCallIds: string[] = [];
  const suppliedObservationCallIds: string[] = [];
  const isClientResultDelivery = isClientToolResultDelivery(delivery);
  if (isClientResultDelivery) {
    for (const result of parseClientToolResults(delivery.body)) {
      if (result.toolName !== getLatestNetDefinitionToolName) continue;
      activeObservationCallIds.push(result.toolCallId);
      if (parseClientToolResultMetadata(result.metadata)?.observation)
        suppliedObservationCallIds.push(result.toolCallId);
    }
  }
  const coreSystemPrompt = useBrunchAgent(
    `anthropic/${CHAT_MODEL_ID}`,
    testCompactionConfig,
    (currentRevision) => {
      useSdcpnPlugin({
        currentRevision,
        retainedRevisionFor: async (revisionId) =>
          retainedSettledRevision(await history(), revisionId),
        ...(initialData?.construction
          ? {
              observationFor: async (
                callId: string,
                mutation?: Pick<
                  ConstructionMutationRequest,
                  "toolName" | "input"
                >,
              ) => {
                const snapshot = await history();
                const observed = await recordedBrowserObservation(
                  snapshot,
                  initialData.construction!,
                  callId,
                );
                if (mutation)
                  await assertConstructionIdentity(
                    snapshot,
                    observed,
                    mutation,
                    initialData.construction!.binding,
                    (id) =>
                      recordedBrowserObservation(
                        snapshot,
                        initialData.construction!,
                        id,
                      ),
                  );
                return observed;
              },
            }
          : {}),
      });
      if (browserContext) {
        useTool(createWorkpieceReadTool({ currentRevision, readSources }));
        useTool(
          createRootArcWhyTool({
            current: currentRevision,
            browser: browserContext,
            history,
            activeObservationCallIds,
          }),
        );
      }
    },
    ...(browserContext
      ? ([
          async (current: WorkpieceRevision | null) =>
            workpieceEvidenceSources(await history(), current),
        ] as const)
      : []),
  );
  useAgentStart(async () => {
    if (browserContext && isClientResultDelivery) {
      // Legacy recorded reads lack this optional sidecar. Only a why lookup that
      // actually cites an observation requires it; legacy continuation is unchanged.
      const snapshot = await history();
      const browser = browserContext;
      await Promise.all(
        suppliedObservationCallIds.map((callId) =>
          recordedBrowserObservation(snapshot, browser, callId),
        ),
      );
      await verifyRootArcResults({
        body: delivery.body,
        snapshot,
        ...browserContext,
        ...(initialData?.construction
          ? {
              observationFor: async (callId: string, beforeCallId: string) => {
                const index = snapshot.messages.findIndex((message) =>
                  message.parts.some(
                    (part) =>
                      part.type === "dynamic-tool" &&
                      part.toolCallId === beforeCallId,
                  ),
                );
                if (index < 0)
                  throw new Error("Unknown issued construction call.");
                return recordedBrowserObservation(
                  { ...snapshot, messages: snapshot.messages.slice(0, index) },
                  browserContext,
                  callId,
                );
              },
            }
          : {}),
      });
    }
  });

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
Submit at most one browser tool call per proposal, separately from server tools, and wait for its correlated client result before further browser work. Invalid proposals fail as a whole; do not rely on sibling execution order.
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
