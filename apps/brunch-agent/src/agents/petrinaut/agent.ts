"use agent";
/**
 * Brunch for Petrinaut: its guidance (prompt, skills, Ledger tools and
 * `query_basis`) over the shared Petrinaut browser tools, net freshness and
 * transport. Everything the model reads and every Ledger tool lives in this
 * directory; a candidate agent is a copy of it with its own `agentName`,
 * registered in `../index.ts`.
 */

import {
  useContextProjection,
  useDelivery,
  useInitialData,
  useTool,
  type AgentProps,
} from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { createFlueClient } from "@flue/sdk";

import {
  browserToolMutatesDocument,
  canonicalContent,
  parsePetrinautUserMessageBody,
  readPetrinautSubmissionContext,
  type SdcpnInitialData,
  sdcpnInitialDataSchema,
} from "@hashintel/brunch-agent";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../shared/chat-model.ts";
import { createBrunchContextProjection } from "../../shared/context-projection.ts";
import { issueBrowserCall } from "../../shared/conversation/browser-call-rendezvous.ts";
import { latestCanonicalNetReadBefore } from "../../shared/conversation/net-changes.ts";
import {
  createNetViewTracker,
  expectedNetRevision,
} from "../../shared/conversation/net-freshness.ts";
import { usePetrinautTools } from "../../shared/petrinaut-tools.ts";
import { ping } from "../../shared/ping.ts";
import { loadTestCompactionConfig } from "../../shared/test-compaction-config.ts";
import { useWords } from "../../shared/words.ts";
import { useGuidance } from "./guidance.ts";

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

/** Instance IDs are unique only within an agent name, so each copy keeps its own. */
const netViewTracker = createNetViewTracker();

export function PetrinautAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  // Initial data is fixed when the conversation is created; the current user
  // delivery carries the changing host context. An absent or malformed
  // allowance means Off, and absent or malformed words an empty snapshot.
  const delivery = useDelivery();
  const submitted =
    delivery.kind === "user"
      ? readPetrinautSubmissionContext(
          parsePetrinautUserMessageBody(delivery.body),
        )
      : undefined;
  const words = useWords(submitted?.words);
  useContextProjection(
    createBrunchContextProjection({
      observe: (entries) => netViewTracker.observe(id, entries),
    }),
  );
  // Agent-local acquisition of this already-authorized instance's public history.
  // Reuse the existing router and storage; no listener, companion log or private records.
  const history = () => {
    const router = createAgentRouter(PetrinautAgent);
    return createFlueClient({
      url: `http://brunch.local/${id}`,
      fetch: async (input, init) =>
        router.fetch(
          input instanceof Request ? input : new Request(input, init),
        ),
    }).history();
  };
  const { system, createQueryBasisTool } = useGuidance(
    CHAT_MODEL_SPECIFIER,
    chatModelOptions,
    history,
    { interviewBudget: submitted?.interviewBudget, words },
  );
  usePetrinautTools(
    initialData
      ? {
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
            return issueBrowserCall({
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
 * Conversation storage keys on this literal, and Flue requires it to be a
 * literal here. Changing it starts every conversation fresh; a candidate copy
 * of this agent takes its own.
 */
PetrinautAgent.agentName = "brunch-chat-agent";
PetrinautAgent.initialData = sdcpnInitialDataSchema;
