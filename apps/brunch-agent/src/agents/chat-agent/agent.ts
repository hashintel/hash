"use agent";
/**
 * Register and compose the Brunch agent for this Flue application: the
 * manual guidance (prompt, skills, Ledger tools and `query_basis`) over the
 * shared Petrinaut browser tools, net freshness and transport contracts.
 */

import {
  useContextProjection,
  useInitialData,
  useTool,
  type AgentProps,
} from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";

import {
  browserToolMutatesDocument,
  canonicalContent,
  type SdcpnInitialData,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../chat-model.ts";
import { issueBrowserCall } from "../../conversation/browser-call-rendezvous.ts";
import { latestCanonicalNetReadBefore } from "../../conversation/net-changes.ts";
import {
  expectedNetRevision,
  netViewTracker,
} from "../../conversation/net-freshness.ts";
import { usePetrinautTools } from "../../shared/petrinaut-tools.ts";
import { createBrunchContextProjection } from "./context-projection.ts";
import { useManualGuidance } from "./guidance/manual.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

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
  useContextProjection(
    createBrunchContextProjection({
      observe: (entries) => netViewTracker.observe(id, entries),
    }),
  );
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
  const { system, createQueryBasisTool } = useManualGuidance(
    CHAT_MODEL_SPECIFIER,
    chatModelOptions,
    history,
  );
  // The guidance's skills and tool descriptions carry the Petrinaut, runtime,
  // experiment and `query_basis` instructions, so none is mounted here.
  usePetrinautTools(
    initialData
      ? {
          instructions: {},
          authorizeDraft: async (draftCallId: string) => {
            if (!latestCanonicalNetReadBefore(await history(), draftCallId))
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
            const expected = browserToolMutatesDocument(toolName)
              ? expectedNetRevision(
                  await history(),
                  toolCallId,
                  netViewTracker.view(id),
                )
              : undefined;
            if (expected && "refusal" in expected)
              throw new Error(expected.refusal);
            const result = await issueBrowserCall({
              instanceId: id,
              toolCallId,
              toolName,
              canonicalInput: input,
              binding: canonicalContent(initialData.binding),
              ...(expected === undefined
                ? {}
                : { expectedRevision: expected.revision }),
              signal,
            });
            return { output: result.output, metadata: result.metadata };
          },
        }
      : {},
  );
  if (initialData)
    useTool(createQueryBasisTool({ browser: initialData, history }));
  useTool(ping);

  return system;
}

/**
 * Pinned, and never to be edited: conversation storage keys on this literal,
 * and Flue requires it to be a literal here.
 */
ChatAgent.agentName = "brunch-chat-agent";
ChatAgent.initialData = sdcpnInitialDataSchema;
