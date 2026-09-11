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
import { diagnostics } from "../../runtime-diagnostics.ts";

export { ACTIVATE_SKILL_TOOL_NAME };
import {
  deriveNetFreshness,
  NET_STALE_SIGNAL,
  netStaleSignalBody,
} from "../../conversation/net-freshness.ts";
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
    // Dropped members stay dropped; the drop itself must not be silent.
    const results = parseClientToolResults(delivery.body, (issue) =>
      diagnostics.note("client-tool-result.parse", {
        ...issue,
        instanceId: id,
      }),
    );
    for (const result of results) {
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
  useAgentStart(async ({ append }) => {
    if (browserContext && delivery.kind === "user") {
      // Flue history is the only ledger of what the model has observed. The
      // marker joins this response ahead of the model's first turn; it asks for
      // a read and never withdraws the tool.
      const freshness = await deriveNetFreshness(
        await history(),
        browserContext,
      );
      if (freshness.kind !== "current")
        append({
          kind: "signal",
          type: NET_STALE_SIGNAL,
          tagName: NET_STALE_SIGNAL,
          attributes: { kind: freshness.kind },
          body: netStaleSignalBody(freshness),
        });
    }
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
A client-tool-result signal is JSON [{ toolCallId, toolName, output, metadata? }]. Treat output as the browser's canonical result for that call and continue helping the user once; never reapply a completed mutation. For a joined root arc, metadata.mutationRecord contains verified observations and effects, not assistant prose or user testimony. Failed, stale, no-op and unknown attempts are not causes.
A ${NET_STALE_SIGNAL} signal at the start of a user turn means this conversation holds no verified read of the net now open in Petrinaut, or the net changed after your last verified read. When it is present, call ${getLatestNetDefinitionToolName} in its own proposal and wait for its browser result before explaining, reviewing, interviewing about, or changing the model, and do not say the net is unavailable or ask for an upload or description. When it is absent, the most recent ${getLatestNetDefinitionToolName} result in this conversation is the current net.
`.replace(/^\s+|\s+$/gu, ""),
  );
  if (browserContext)
    useInstruction(
      `
When the user asks why a visible part of the net exists or is shaped as it is (a place, transition, arc, type, parameter or equation, named in their own words), do not answer from memory of this conversation. Take two turns. Turn one: call getLatestNetDefinition and nothing else, then end your response; brunch_why is a server tool and cannot share a proposal with it. Turn two, after that client result has arrived: call brunch_why citing that result's toolCallId and the element the user named, resolved to its recorded name or ID, then answer in ordinary language from the returned standing, scope and basis. If the record has no basis for that element, or the element is not recorded, say so plainly. Your recollection of having built something is not a basis.
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
