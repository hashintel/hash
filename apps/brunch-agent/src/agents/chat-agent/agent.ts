"use agent";
/**
 * Register and compose the Brunch agent for this Flue application.
 *
 * The app selects baseline or app-owned experimental guidance. All variants
 * retain the same Ledger, browser tools and transport contracts.
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

import { brunchTools, composeLedgerProfile } from "@hashintel/brunch-agent";
import {
  browserToolMutatesDocument,
  canonicalContent,
  sdcpnInitialDataSchema,
  sdcpnLedgerProfile,
  type SdcpnInitialData,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  useSdcpnPlugin,
  useSdcpnTools,
} from "@hashintel/brunch-agent-plugin-sdcpn/flue";

import {
  selectChatModelSpecifier,
  selectChatThinking,
} from "../../chat-model.ts";
import { issueBrowserCall } from "../../conversation/browser-call-rendezvous.ts";
import { latestNetReadBefore } from "../../conversation/net-changes.ts";
import {
  expectedNetRevision,
  netViewTracker,
} from "../../conversation/net-freshness.ts";
import { createQueryBasisTool } from "../../conversation/why.ts";
import { selectLedgerNoteShape } from "../../ledger-note-shape.ts";
import { createBrunchContextProjection } from "./context-projection.ts";
import { selectGuidanceVariant } from "./guidance-variant.ts";
import { useChatGuidance } from "./guidance.ts";
import { loadTestCompactionConfig } from "./test-compaction-config.ts";
import { ping } from "./tools/ping.ts";

const CHAT_MODEL_SPECIFIER = selectChatModelSpecifier();
const chatThinkingLevel = selectChatThinking();
const ledgerProfile = composeLedgerProfile(sdcpnLedgerProfile);
const ledgerNoteShape = selectLedgerNoteShape();
const guidanceVariant = selectGuidanceVariant();
const useConstruction =
  guidanceVariant === "baseline" ? useSdcpnPlugin : useSdcpnTools;

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
  const coreSystemPrompt = useChatGuidance(
    guidanceVariant,
    CHAT_MODEL_SPECIFIER,
    chatModelOptions,
    {
      profile: ledgerProfile,
      noteShape: ledgerNoteShape,
      readHistory: history,
    },
  );
  useConstruction(
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

  useInstruction(
    `
Call ping when you need to confirm the server tool path.
${
  initialData
    ? "Canonical browser tools return actual browser outputs as ordinary tool results, under the output key with host-only metadata; continue the task after each result. A browser operation does not require a prior Ledger commit. Independent server and browser calls may share a proposal, but a concurrent Ledger commit is not evidence of a settled browser effect; make a call that depends on another's result only after that result has returned. Calls whose inputs you choose yourself, such as a fragment's elements and arcs with your own IDs, do not depend on each other; send them together. Never repeat an attempted write whose outcome is unknown. A net change starts only when a current view of the net is in your context and the document has not changed by other means since; the latest change's result carries netAfterChanges, the net's structure after that proposal's changes."
    : "This conversation has no browser tools; use the available server tools and modelling skill."
}
`.replace(/^\s+|\s+$/gu, ""),
  );
  if (initialData)
    useInstruction(
      `
When the user asks why a visible element exists, do not answer from memory. If no current net read exists or the net may have changed since it, read the net first, then call ${brunchTools.queryBasis} with the element's kind and recorded name or ID (for an arc, the transition ID, direction and place ID). The answer lists the calls that changed it, the Ledger revision current at each, and the Notes recorded earlier in the same turn; compile those Notes when you need their content. Chronological association is not semantic justification. If no call is associated, say so plainly.
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
