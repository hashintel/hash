"use agent";
/**
 * Brunch for HASH: the Petrinaut agent's guidance (prompt and skills, copied
 * here so they can diverge), the Ledger and basis-query tools both agents
 * mount from `../shared/` (under HASH's names: `ledger_query`,
 * `ledger_query_basis`), HASH's own Petrinaut tools over the shared browser
 * calls, net freshness and transport, plus reads of the HASH graph and Save
 * that HASH's process page executes. HASH's process page talks to it.
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
  browserToolFacts,
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
import {
  BrowserCallNotStartedError,
  issueBrowserCall,
} from "../../shared/conversation/browser-call-rendezvous.ts";
import {
  createNetViewTracker,
  expectedNetRevision,
} from "../../shared/conversation/net-freshness.ts";
import { loadTestCompactionConfig } from "../../shared/test-compaction-config.ts";
import { useWords } from "../../shared/words.ts";
import { useGuidance } from "./guidance.ts";
import { createHashPetrinautSaveTool } from "./petrinaut/save-net.ts";
import { withPetrinautVersionLoadNotes } from "./petrinaut/version-load-note.ts";
import { createHashGraphReadTools } from "./tools/hash-graph-reads.ts";
import {
  createHashPetrinautTools,
  hashNoNetViewRefusal,
} from "./tools/hash-petrinaut-tools.ts";

import type { BrowserToolExecutor } from "../../shared/conversation/browser-tool-executor.ts";

const chatModelSpecifier = selectChatModelSpecifier();
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

export const HashAgent = ({ id }: AgentProps): string => {
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
    withPetrinautVersionLoadNotes(
      createBrunchContextProjection({
        observe: (entries) => netViewTracker.observe(id, entries),
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
    chatModelSpecifier,
    chatModelOptions,
    history,
    { interviewBudget: submitted?.interviewBudget, words },
  );
  if (initialData) {
    const executeBrowserTool: BrowserToolExecutor = async ({
      toolName,
      input,
      toolCallId,
      signal,
    }) => {
      const expected = browserToolFacts(toolName).requiresFreshView
        ? expectedNetRevision(
            await history(),
            toolCallId,
            netViewTracker.view(id),
          )
        : undefined;
      // HASH's own read is the one to make; the refusal is otherwise the same.
      if (expected && "refusal" in expected)
        throw new BrowserCallNotStartedError(hashNoNetViewRefusal);
      return issueBrowserCall({
        agentName: HashAgent.agentName,
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
    };
    // HASH's own tools read, change and run the net and read the user guide;
    // none of Petrinaut's own is mounted.
    for (const tool of createHashPetrinautTools(executeBrowserTool))
      useTool(tool);
    useTool(createQueryBasisTool({ browser: initialData, history }));
    // HASH's page runs them as the signed-in user, like net reads.
    for (const read of createHashGraphReadTools(executeBrowserTool))
      useTool(read);
    // A document change: issued against the model's last view of the net.
    useTool(
      createHashPetrinautSaveTool(
        executeBrowserTool,
        initialData.binding.documentId,
      ),
    );
  }
  // `ping` serves diagnostics runs only; the HASH agent's model doesn't get it.

  return system;
};

/**
 * Conversation storage keys on this literal, and Flue requires it to be a
 * literal here. Changing it starts every conversation fresh. It differs from
 * the Petrinaut agent's, so the two never share a conversation.
 */
HashAgent.agentName = "brunch-hash-agent";
HashAgent.initialData = sdcpnInitialDataSchema;
