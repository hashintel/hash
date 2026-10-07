import { createFlueClient } from "@flue/sdk";
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../brunch-panel-transport";
import { brunchPreviewConfig } from "../brunch-preview-config";
import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
  storedBrunchConversationId,
} from "../conversation/brunch-conversation-id";
import { getOrCreateBrunchPrincipal } from "../conversation/brunch-principal";
import {
  type ProcessAgentBinding,
  processAgentBindingFor,
} from "../conversation/process-agent-binding";
import { useFlueChatHistory } from "../conversation/use-flue-chat-history";
import { foldBrunchWorkpieceHistory } from "../ledger/brunch-workpiece-history";
import {
  createEditorDrafts,
  type EditorDrafts,
} from "../shared/brunch-draft-experiment-drafts";
import { brunchPetrinautClientToolNames } from "../tools/brunch-client-tools";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "../tools/brunch-draft-experiment-interactive-tool";
import { BrunchExperimentFollowUp } from "../tools/brunch-experiment-follow-up";
import {
  type BrunchMutationApprovalCoordinator,
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "../tools/brunch-mutation-approval";
import {
  type CanonicalPetrinautReplayReadiness,
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  issuedCanonicalCallsFromHistory,
} from "../tools/brunch-petrinaut-tools";
import { resolveBrunchToolPresentation } from "../tools/brunch-tool-presentation";
import { createInBandBrowserCalls } from "../tools/in-band-browser-call";
import { requestFlueStop } from "./request-flue-stop";
import { useImmutableReplayBaseline } from "./use-immutable-replay-baseline";
import { useInstanceFor } from "./use-instance-for";

import type { AssistantChatProps } from "../../_shared/chat/assistant-chat";
import type { BrunchConversation, createBrunchPlugin } from "../definition";
import type { BrunchWorkpieceHistoryMessage } from "../ledger/brunch-workpiece-history";
import type { PluginApi } from "@hashintel/petrinaut/ui";

const brunchPrincipal = getOrCreateBrunchPrincipal();

const createBrunchFlueClient = async (conversationId: string) => {
  const identity = { conversationId, principalKey: brunchPrincipal };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(
    brunchPreviewConfig.chatEndpoint,
    window.location.origin,
  );
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => agentOwnershipHeaders(identity),
  });
};

/** The tools one binding works with, built from the plugin's stable families. */
const createBrunchTools = ({
  document,
  experiments,
  editorDrafts,
  binding,
  client,
  coordinator,
  replayReadiness,
}: Pick<PluginApi<typeof createBrunchPlugin>, "document" | "experiments"> & {
  editorDrafts: EditorDrafts;
  binding: ProcessAgentBinding;
  client: ReturnType<typeof createBrunchFlueClient>;
  coordinator: BrunchMutationApprovalCoordinator;
  replayReadiness: CanonicalPetrinautReplayReadiness;
}) => {
  const canonical = createCanonicalPetrinautHostTools({
    document,
    replayReadiness,
  });
  const inBand = createInBandBrowserCalls({
    client,
    principalKey: brunchPrincipal,
    binding,
    metadataFor: canonical.clientToolResultMetadataFor,
    prepareInput: (call) => {
      canonical.mapClientToolInput(call);
    },
    admit: createBrunchMutationAdmission(coordinator),
  });

  return {
    canonical,
    inBand,
    approvals: createBrunchMutationApprovalInteractiveTools(
      coordinator,
      document.net,
    ),
    draft: createBrunchDraftExperimentInteractiveTool({
      document,
      experiments,
      editorDrafts,
      browserCalls: inBand,
      readDraftAuthority: async (toolCallId) =>
        resolveDraftAuthorityFromHistory(
          await (await client).history(),
          toolCallId,
        ),
    }),
  };
};

const subscribeToNothing = () => () => {};
const zeroVersion = () => 0;

interface BrunchSession {
  /** The chat's props, but `api`; `null` while another assistant is shown. */
  readonly chat: Omit<AssistantChatProps, "api"> | null;
  /** What the Ledger tab shows; `null` while another assistant is shown. */
  readonly ledger: {
    readonly binding: ProcessAgentBinding;
    readonly messages: readonly BrunchWorkpieceHistoryMessage[];
    /** `undefined` until the history is known. */
    readonly activityIdentities: readonly string[] | undefined;
  } | null;
  readonly conversation: BrunchConversation | null;
}

/**
 * Brunch's session for the open document while Brunch is the shown
 * assistant: the conversation the document is bound to, its Flue client and
 * history, and the tools that act on the document through `api`.
 */
export const useBrunchSession = ({
  document,
  experiments,
  errors,
  assistant,
}: PluginApi<typeof createBrunchPlugin>): BrunchSession => {
  // One construction conversation per net; clearing the chat starts another.
  const initialConversationId = ordinaryConstructionConversationIdFrom(
    document.id,
  );
  const [constructionConversationId, setConstructionConversationId] = useState(
    () =>
      storedBrunchConversationId(initialConversationId) ??
      initialConversationId,
  );
  const conversationId = assistant.isActive
    ? brunchEvaluationConversationIdFrom(constructionConversationId)
    : null;

  // One binding, approval authority, tracker and client per conversation: a
  // replaced authority settles the approvals still waiting on it.
  const session = useInstanceFor(conversationId, (id) => ({
    binding: processAgentBindingFor(document.id, id),
    coordinator: createBrunchMutationApprovalCoordinator(),
    tracker: new BrunchPanelConversationTracker(),
    client: createBrunchFlueClient(id),
  }));
  const coordinator = session?.coordinator;
  useEffect(() => {
    if (coordinator === undefined) return;
    coordinator.open();
    return () => coordinator.close();
  }, [coordinator]);
  const approvalVersion = useSyncExternalStore(
    coordinator?.subscribe ?? subscribeToNothing,
    coordinator?.getVersion ?? zeroVersion,
  );

  const flueHistory = useFlueChatHistory(
    session?.client ?? null,
    conversationId ?? "",
    brunchPetrinautClientToolNames,
    brunchPetrinautClientToolNames,
  );

  // Failures Brunch contains (a lost history observation, a failed server
  // tool) resolve normally for the chat and the model; this is where they
  // become visible.
  const reportFailure = (
    failureSource: string,
    error: unknown,
    tags: Readonly<Record<string, string | number | boolean>>,
  ) => errors.capture(error, { source: `brunch.${failureSource}`, tags });
  const reportHistoryError = useEffectEvent((error: Error) =>
    reportFailure("history", error, { phase: flueHistory.phase ?? "unknown" }),
  );
  useEffect(() => {
    if (flueHistory.error !== undefined) reportHistoryError(flueHistory.error);
  }, [flueHistory.error]);

  const replayReadiness = useImmutableReplayBaseline({
    bindingKey: conversationId ?? undefined,
    emptyReplay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    historyPhase: flueHistory.phase,
    snapshot: flueHistory.snapshot,
    derive: (snapshot) => issuedCanonicalCallsFromHistory({ snapshot }),
  });

  // Unsent drafts belong to the plugin: they last as long as it runs.
  const [editorDrafts] = useState(createEditorDrafts);
  // One tool set per conversation and replay baseline: the canonical tools
  // record the revision before each call and the metadata of its result, so
  // their identity is part of the protocol.
  const toolsKey =
    conversationId && `${conversationId}:${replayReadiness.status}`;
  const tools = useInstanceFor(
    toolsKey,
    () =>
      session &&
      createBrunchTools({
        ...session,
        document,
        experiments,
        editorDrafts,
        replayReadiness,
      }),
  );
  // A registered widget replaces the tool's row, so only calls waiting for a
  // decision render as approvals. The chat reads `shouldHandle` when the list
  // changes, so the list is new for every version of the pending set while
  // its tools, and their widgets, stay the same.
  const interactiveTools = useInstanceFor(
    toolsKey && `${toolsKey}:${approvalVersion}`,
    () => (tools === null ? [] : [...tools.approvals, tools.draft]),
  );

  if (session === null || tools === null || interactiveTools === null) {
    return { chat: null, ledger: null, conversation: null };
  }
  const { binding, client, tracker } = session;
  const transport = createBrunchPanelTransport(client, tracker, {
    initialData: { binding },
    liveToolStream: {
      headers: agentOwnershipHeaders({
        conversationId: binding.conversationId,
        principalKey: brunchPrincipal,
      }),
    },
    clientToolNames: brunchPetrinautClientToolNames,
    dynamicClientToolNames: brunchPetrinautClientToolNames,
    mapClientToolInput: (call) => call.input,
    onAdmission: flueHistory.refresh,
    onToolOutputError: (event) =>
      reportFailure("server-tool", new Error(event.errorText), {
        submissionId: event.submissionId,
        toolCallId: event.toolCallId,
        toolName: event.toolName ?? "unknown",
      }),
  });
  const { snapshot } = flueHistory;

  return {
    chat: {
      primaryLabel: "Chat",
      presentation: "brunch",
      resolveToolPresentation: resolveBrunchToolPresentation,
      workingLabel: "Working…",
      renderComposerControl: (context) => (
        <BrunchExperimentFollowUp context={context} drafts={editorDrafts} />
      ),
      conversationId: binding.conversationId,
      canClearMessages: true,
      // These exact-name tools override Petrinaut's static registry; every
      // other canonical capability stays on it.
      inBandBrowserTools: tools.inBand,
      automaticTools: tools.canonical.tools,
      interactiveTools,
      transport,
      requestStop: () => requestFlueStop(client, tracker),
      followMessages: {
        // This closure and `messages` below describe the same observed
        // snapshot, never a later mutable settlement cache.
        canReplace: () => tracker.canReplaceMessages(snapshot),
      },
      messages: flueHistory.messages,
      onClearMessages: () => {
        const nextId = `${initialConversationId}:${crypto.randomUUID()}`;
        replaceBrunchConversationId(initialConversationId, nextId);
        setConstructionConversationId(nextId);
      },
    },
    ledger: {
      binding,
      messages: snapshot?.messages ?? [],
      activityIdentities: !flueHistory.ready
        ? undefined
        : flueHistory.phase === "absent"
          ? []
          : snapshot &&
            foldBrunchWorkpieceHistory(snapshot.messages, binding)
              .activityIdentities,
    },
    conversation: {
      conversationId: binding.conversationId,
      tracker,
      settlements: flueHistory.settlements,
      snapshot,
      toolApprovalState: session.coordinator.approvalState,
    },
  };
};
