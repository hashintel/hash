"use agent";
/**
 * Brunch for HASH: the Petrinaut agent's guidance (prompt and skills, copied
 * here so they can diverge) and its Ledger and `query_basis` tools (imported
 * from `../petrinaut/tools/`), over the shared Petrinaut browser tools, net
 * freshness and transport, plus reads of the HASH graph that HASH's process
 * page executes. HASH's process page talks to it.
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
  hashGraphReadToolNames,
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
import { createHashGraphReadTools } from "./tools/hash-graph-reads.ts";
import { createHashSaveTool } from "./tools/hash-save.ts";
import { withVersionLoadNotes } from "./version-load-note.ts";

import type { BrowserToolExecutor } from "../../shared/petrinaut-tools/petrinaut-construction.ts";

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

export function HashAgent({ id }: AgentProps) {
  const initialData = useInitialData<SdcpnInitialData>();
  // Initial data is fixed when the conversation is created; the current user
  // delivery carries the changing host context. An absent or malformed
  // allowance means Off, and absent or malformed words an empty snapshot. A
  // signal delivery, such as a turn of Ledger comments, carries neither: it
  // sits outside the interview, and the kept words still apply.
  const delivery = useDelivery();
  const submitted =
    delivery.kind === "user"
      ? readPetrinautSubmissionContext(
          parsePetrinautUserMessageBody(delivery.body),
        )
      : undefined;
  const words = useWords(submitted?.words);
  // A turn sent after the user loaded another saved version tells the model
  // which one, once, where it happened.
  useContextProjection(
    withVersionLoadNotes(
      createBrunchContextProjection({
        observe: (entries) => netViewTracker.observe(id, entries),
        // The HASH graph reads are rendered as compact text for the model.
        textResultToolNames: hashGraphReadToolNames,
      }),
    ),
  );
  // Agent-local acquisition of this already-authorized instance's public history.
  // Reuse the existing router and storage; no listener, companion log or private records.
  const history = () => {
    const router = createAgentRouter(HashAgent);
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
  const executeBrowserTool: BrowserToolExecutor | undefined = initialData
    ? async ({ toolName, input, toolCallId, signal }) => {
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
      }
    : undefined;
  usePetrinautTools(
    initialData
      ? {
          authorizeDraft: async (draftCallId: string) => {
            if (!latestCanonicalNetReadBefore(await history(), draftCallId))
              throw new Error(
                "Experiment draft requires a prior canonical net read.",
              );
          },
          executeBrowserTool,
        }
      : {},
  );
  if (initialData) {
    useTool(createQueryBasisTool({ browser: initialData, history }));
    // HASH's page runs them as the signed-in user, like net reads.
    if (executeBrowserTool) {
      for (const read of createHashGraphReadTools(executeBrowserTool))
        useTool(read);
      // A document change: issued against the model's last view of the net.
      useTool(
        createHashSaveTool(executeBrowserTool, initialData.binding.documentId),
      );
    }
  }
  useTool(ping);

  return system;
}

/**
 * Conversation storage keys on this literal, and Flue requires it to be a
 * literal here. Changing it starts every conversation fresh. It differs from
 * the Petrinaut agent's, so the two never share a conversation.
 */
HashAgent.agentName = "brunch-hash-agent";
HashAgent.initialData = sdcpnInitialDataSchema;
