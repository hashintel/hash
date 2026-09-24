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
  useContextProjection,
  useDelivery,
  useInitialData,
  useInstruction,
  useModel,
  useTool,
  type AgentProps,
} from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";

import {
  isReadPetrinautNetToolName,
  parseClientToolResultMetadata,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  SDCPN_MODELLING_SKILL_NAME,
  useSdcpnPlugin,
} from "@hashintel/brunch-agent-plugin-sdcpn/agent";
import {
  STOCK_OVER_FLUE_MODE,
  INTEGRATED_BRUNCH_MODE,
  isIntegratedPetrinautMode,
  sdcpnInitialDataSchema,
  type BrowserContext,
  type SdcpnInitialData,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";
import { parseClientToolResultPayload } from "@hashintel/brunch-agent-transport-aisdk";
import { useBrunchAgent } from "@hashintel/brunch-agent/agent";
import { createWorkpieceReadTool } from "@hashintel/brunch-agent/flue";
import {
  getLatestNetDefinitionToolName,
  petrinautAiPrompt,
} from "@hashintel/petrinaut-core";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../chat-model.ts";
import {
  ACTIVATE_SKILL_TOOL_NAME,
  isClientToolResultDelivery,
} from "../../conversation/client-tools.ts";
import { modelAdmissionScope } from "../../provider-admission.ts";
import { diagnostics } from "../../runtime-diagnostics.ts";

export { ACTIVATE_SKILL_TOOL_NAME };
import { issueBrowserCall } from "../../conversation/browser-call-rendezvous.ts";
import { verifyMutationResults } from "../../conversation/mutation-delivery.ts";
import {
  deriveNetFreshness,
  NET_STALE_SIGNAL,
  netStaleSignalBody,
} from "../../conversation/net-freshness.ts";
import {
  recordedBrowserObservation,
  verifiedDraftReadBefore,
} from "../../conversation/net-ledger.ts";
import { takeReportedDocumentRevision } from "../../conversation/reported-document-revision.ts";
import { verifyBrowserCallResult } from "../../conversation/verify-browser-call-result.ts";
import { createQueryWorkpieceTool } from "../../conversation/why.ts";
import {
  retainedSettledRevision,
  workpieceEvidenceSources,
} from "../../conversation/workpiece.ts";
import { projectBrunchContext } from "./context-projection.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

export const CHAT_MODEL_SPECIFIER = selectChatModelSpecifier();
const chatThinkingLevel = selectChatThinking();

export const RUNBOOK_SKILL_NAME = SDCPN_MODELLING_SKILL_NAME;

const testCompactionConfig = loadTestCompactionConfig();
const chatModelOptions = {
  thinkingLevel: chatThinkingLevel,
  ...(testCompactionConfig === undefined
    ? {}
    : { compaction: testCompactionConfig }),
};

const useStockOverFlueAgent = (): string => {
  useModel(CHAT_MODEL_SPECIFIER, chatModelOptions);
  useSdcpnPlugin();
  return petrinautAiPrompt;
};

export function ChatAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  const admission = modelAdmissionScope.getStore();
  if (admission)
    admission.asyncBrowserTools = initialData?.mode === INTEGRATED_BRUNCH_MODE;
  if (initialData?.mode === STOCK_OVER_FLUE_MODE)
    return useStockOverFlueAgent();

  useContextProjection(projectBrunchContext);
  const delivery = useDelivery();
  const integratedCanonicalMode = isIntegratedPetrinautMode(initialData?.mode);
  const integratedBrunchMode = initialData?.mode === INTEGRATED_BRUNCH_MODE;
  const netDefinitionReadToolName = integratedCanonicalMode
    ? getLatestNetDefinitionToolName
    : readPetrinautNetToolName;
  const browserContext: BrowserContext | undefined = initialData?.construction
    ? { binding: initialData.construction.binding }
    : undefined;
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
  const clientResultPayload = isClientResultDelivery
    ? parseClientToolResultPayload(delivery.body, (issue) =>
        diagnostics.note("client-tool-result.parse", {
          ...issue,
          instanceId: id,
        }),
      )
    : undefined;
  if (clientResultPayload) {
    // Dropped members stay dropped; the drop itself must not be silent.
    for (const result of clientResultPayload.results) {
      if (
        !isReadPetrinautNetToolName(result.toolName) &&
        result.toolName !== getLatestNetDefinitionToolName
      )
        continue;
      activeObservationCallIds.push(result.toolCallId);
      if (parseClientToolResultMetadata(result.metadata)?.observation)
        suppliedObservationCallIds.push(result.toolCallId);
    }
  }
  const coreSystemPrompt = useBrunchAgent(
    CHAT_MODEL_SPECIFIER,
    chatModelOptions,
    (currentRevision) => {
      useSdcpnPlugin({
        currentRevision,
        retainedRevisionFor: async (revisionId) =>
          retainedSettledRevision(await history(), revisionId),
        ...(browserContext
          ? {
              authorizeDraft: async (draftCallId: string) => {
                const snapshot = await history();
                const calls = snapshot.messages.flatMap((message) =>
                  message.role === "assistant" &&
                  message.purpose === "assistant"
                    ? message.parts
                    : [],
                );
                const draftIndex = calls.findIndex(
                  (part) =>
                    part.type === "dynamic-tool" &&
                    part.toolCallId === draftCallId,
                );
                if (
                  draftIndex < 0 ||
                  calls.filter(
                    (part) =>
                      part.type === "dynamic-tool" &&
                      part.toolCallId === draftCallId,
                  ).length !== 1
                )
                  throw new Error(
                    "Issued experiment draft is absent or ambiguous.",
                  );
                const settlement = calls
                  .slice(0, draftIndex)
                  .findLast(
                    (part) =>
                      part.type === "dynamic-tool" &&
                      part.toolName === "mutate_workpiece",
                  );
                const revision =
                  settlement?.type === "dynamic-tool"
                    ? retainedSettledRevision(snapshot, settlement.toolCallId)
                    : undefined;
                if (!revision)
                  throw new Error(
                    "Experiment draft requires a current settled Ledger basis.",
                  );
                return {
                  observation: await verifiedDraftReadBefore(
                    snapshot,
                    browserContext,
                    draftCallId,
                  ),
                  revisionId: revision.revisionId,
                };
              },
            }
          : {}),
        ...(initialData?.mode === INTEGRATED_BRUNCH_MODE && browserContext
          ? {
              executeCanonicalBrowserTool: async ({
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
                  binding: JSON.stringify(browserContext.binding),
                  signal,
                  verify: async (call) => {
                    const metadata = await verifyBrowserCallResult({
                      call,
                      canonicalInput: input,
                      binding: browserContext.binding,
                    });
                    return {
                      toolCallId: call.toolCallId,
                      toolName: call.toolName,
                      output: call.output,
                      ...(metadata === undefined ? {} : { metadata }),
                    };
                  },
                });
                return { output: result.output, metadata: result.metadata };
              },
            }
          : {}),
        ...(initialData?.construction
          ? {
              observationFor: async (callId: string) => {
                const snapshot = await history();
                return recordedBrowserObservation(
                  snapshot,
                  initialData.construction!,
                  callId,
                );
              },
            }
          : {}),
      });
      if (browserContext) {
        useTool(createWorkpieceReadTool({ currentRevision, readSources }));
        useTool(
          createQueryWorkpieceTool({
            current: currentRevision,
            browser: browserContext,
            history,
            activeObservationCallIds,
          }),
        );
      }
    },
    browserContext
      ? async (current: WorkpieceRevision | null) =>
          workpieceEvidenceSources(await history(), current)
      : undefined,
    initialData?.mode === INTEGRATED_BRUNCH_MODE,
  );
  useAgentStart(async ({ append }) => {
    if (browserContext && delivery.kind === "user") {
      // Always consume the reported revision so its per-submission entry is released.
      const reportedRevisionId = takeReportedDocumentRevision();
      // Flue history is the only ledger of what the model has observed. The
      // marker joins this response ahead of the model's first turn; it asks for
      // a read and never withdraws the tool. It is suspended in I: it was written
      // for terminal browser tools, where a read ended the submission, and as
      // the last user-role message it ended I's in-band loop after the read.
      const freshness = integratedBrunchMode
        ? undefined
        : await deriveNetFreshness(
            await history(),
            browserContext,
            reportedRevisionId,
          );
      if (freshness !== undefined && freshness.kind !== "current")
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
      await verifyMutationResults({
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

  if (clientResultPayload?.context)
    useInstruction(
      `Host diagnostics for this client-result continuation (context only, never user testimony or semantic evidence):\n${clientResultPayload.context}`,
    );
  useInstruction(
    `
Call ping when you need to confirm the server tool path.
${
  initialData?.mode === INTEGRATED_BRUNCH_MODE
    ? "Canonical browser tools return actual browser outputs as ordinary tool results, under the output key with host-only metadata; continue the task after each result. A browser operation does not require a prior Ledger revision. Independent server and browser calls may share a proposal, but a concurrent Ledger write is not evidence of a settled browser effect; make a dependent call only after the result it depends on has returned. Never repeat an attempted write whose outcome is unknown."
    : "Submit browser tool calls separately from server tools, and wait for their correlated client results before further browser work. Invalid proposals fail as a whole; do not rely on sibling execution order. A client-tool-result signal carries canonical results as JSON [{ toolCallId, toolName, output, metadata? }], optionally inside a host envelope with transient diagnostics context. Treat output as the browser's canonical result for that call, keep host context distinct from user testimony and semantic evidence, and continue helping the user once; never reapply a completed mutation."
}
`.replace(/^\s+|\s+$/gu, ""),
  );
  useInstruction(
    `
For a joined root arc, metadata.mutationRecord contains verified observations and effects, not assistant prose or user testimony. Failed, stale, no-op and unknown attempts are not causes.
${
  integratedBrunchMode
    ? ""
    : `A ${NET_STALE_SIGNAL} signal at the start of a user turn means this conversation holds no verified read of the net now open in Petrinaut, or the net changed after your last verified read. When it is present, call ${netDefinitionReadToolName} and wait for its browser result before explaining, reviewing, interviewing about, or changing the model, and do not say the net is unavailable or ask for an upload or description. When it is absent, the most recent ${netDefinitionReadToolName} result in this conversation is the current net.`
}
`.replace(/^\s+|\s+$/gu, ""),
  );
  if (browserContext)
    useInstruction(
      `
When the user asks why a visible part of the net exists or is shaped as it is (a place, transition, arc, type, parameter or equation, named in their own words), do not answer from memory of this conversation. Use the latest verified ${netDefinitionReadToolName} result for the currently confirmed document revision. ${
        integratedBrunchMode
          ? `If no verified read exists or the net may have changed since the last one, call ${netDefinitionReadToolName} first, then call query_workpiece after its result returns.`
          : `If ${NET_STALE_SIGNAL} is present or no current verified read exists, take two turns: turn one calls ${netDefinitionReadToolName} and nothing else, then ends; query_workpiece is a server tool and cannot share a proposal with it.`
      } Mutation success alone never establishes a current read or revision. With a current read available, call query_workpiece with the element the user named, resolved to its recorded name or ID; the host attaches the verified read's correlation rather than requiring you to copy a tool-call ID or hash. If the record has no basis for that element, or the element is not recorded, say so plainly. Your recollection of having built something is not a basis.
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
