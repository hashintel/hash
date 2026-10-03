/**
 * The Brunch assistant as a Petrinaut plugin.
 *
 * The plugin's body runs once per host mount and returns two things: a root
 * component that runs the existing Brunch integration hooks (`brunch/`), and
 * an assistant provider that publishes what those hooks produce, namely the
 * chat configuration Petrinaut's chat kit renders and the Ledger tab. Voice
 * mode is a separate plugin that reaches Brunch through the
 * `BrunchConversation` token this plugin provides.
 */

import { createFlueClient } from "@flue/sdk";
import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import { Icon } from "@hashintel/ds-components";
import {
  createReadableStore,
  type DocumentRevisionId,
  type ReadableStore,
} from "@hashintel/petrinaut-core";
import { ErrorTrackerContext, useStore } from "@hashintel/petrinaut/react";
import {
  definePetrinautPlugin,
  type PetrinautAiAssistant,
  type PetrinautAiComposerControlContext,
  type PetrinautAiStopResult,
  type PetrinautAssistantTab,
  type PetrinautPluginApi,
} from "@hashintel/petrinaut/ui";

import {
  type BrunchConversationApi,
  BrunchConversation,
  type BrunchConversationState,
  type BrunchInputMode,
} from "./brunch-conversation";
import { brunchPetrinautClientToolNames } from "./brunch/brunch-client-tools";
import {
  brunchEvaluationConversationIdFrom,
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
} from "./brunch/brunch-conversation-id";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "./brunch/brunch-draft-experiment-interactive-tool";
import { BrunchExperimentFollowUp } from "./brunch/brunch-experiment-follow-up";
import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "./brunch/brunch-mutation-approval";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch/brunch-panel-transport";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  issuedCanonicalCallsFromHistory,
  type CanonicalPetrinautReplay,
  type CanonicalPetrinautReplayReadiness,
} from "./brunch/brunch-petrinaut-tools";
import { getOrCreateBrunchPrincipal } from "./brunch/brunch-principal";
import { resolveBrunchToolPresentation } from "./brunch/brunch-tool-presentation";
import { foldBrunchWorkpieceHistory } from "./brunch/brunch-workpiece-history";
import { BrunchWorkpiecePane } from "./brunch/brunch-workpiece-pane";
import { createInBandBrowserCalls } from "./brunch/in-band-browser-call";
import { useFlueChatHistory } from "./brunch/use-flue-chat-history";
import { useImmutableReplayBaseline } from "./brunch/use-immutable-replay-baseline";
import {
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
  useProcessAgentBinding,
} from "./brunch/use-process-agent-binding";

import type { DocumentRecord } from "../local-storage-demo/documents/document-repository";

/** What the host gives Brunch: its endpoint and the document facts only it knows. */
export interface BrunchHostConfig {
  /** The Brunch chat endpoint, e.g. `VITE_BRUNCH_CHAT_ENDPOINT`. */
  readonly chatEndpoint: string;
  /** The open document's record: id, incarnation, title, revision. `null` between documents. */
  readonly document: ReadableStore<DocumentRecord | null>;
  /** Resolves once the host has stored the revision, so tool results can cite it. */
  readonly settleRevision: (input: {
    readonly documentId: string;
    readonly revisionId: DocumentRevisionId;
  }) => Promise<void>;
}

const brunchManifest = {
  id: "website.brunch",
  name: "Brunch",
  assistant: { label: "Brunch" },
  provides: { conversation: BrunchConversation },
} as const;

type BrunchApi = PetrinautPluginApi<typeof brunchManifest>;

const brunchPrincipal = getOrCreateBrunchPrincipal();

const createBrunchFlueClient = async (
  chatEndpoint: string,
  conversationId: string,
) => {
  const identity = { conversationId, principalKey: brunchPrincipal };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(chatEndpoint, window.location.origin);
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => agentOwnershipHeaders(identity),
  });
};

/**
 * Flue's `abort()` is conversation-wide and only reaches unsettled work, so a
 * Stop pressed while `send()` is still in flight must first let that admission
 * land; otherwise `aborted: false` would read as "already settled" while the
 * admitted turn keeps running.
 */
export const requestFlueStop = async (
  clientPromise: Promise<ReturnType<typeof createFlueClient>>,
  tracker: BrunchPanelConversationTracker,
): Promise<PetrinautAiStopResult> => {
  tracker.recordStopRequested();
  const client = await clientPromise;
  await tracker.settleInFlightSubmissions();
  const result = await client.abort();
  return result.aborted ? "stop-requested" : "already-settled";
};

/** The stores the body creates and the root fills; the provider reads them. */
interface BrunchStores {
  readonly chat: ReturnType<
    typeof createReadableStore<PetrinautAiAssistant | null>
  >;
  readonly tabs: ReturnType<
    typeof createReadableStore<readonly PetrinautAssistantTab[]>
  >;
  readonly conversation: ReturnType<
    typeof createReadableStore<BrunchConversationState | null>
  >;
  readonly inputMode: ReturnType<
    typeof createReadableStore<BrunchInputMode | null>
  >;
}

/**
 * Counts Ledger entries the user has not seen. The first history observed is
 * the baseline; later entries count until the Ledger tab is shown. Kept in a
 * small external store so the count updates from an effect without setting
 * React state there.
 */
const createLedgerAttentionStore = () => {
  const store = createReadableStore(0);
  let seen: Set<string> | undefined;
  return {
    subscribe: (listener: () => void) => store.subscribe(listener),
    getSnapshot: () => store.get(),
    update(
      activityIdentities: readonly (number | string)[] | undefined,
      viewing: boolean,
    ) {
      if (viewing) store.set(0);
      if (activityIdentities === undefined) return;
      const current = new Set(
        activityIdentities.map(
          (identity) => `${typeof identity}:${String(identity)}`,
        ),
      );
      const additions =
        seen === undefined
          ? 0
          : [...current].filter((identity) => !seen?.has(identity)).length;
      seen = current;
      if (additions > 0 && !viewing) store.set(store.get() + additions);
    },
  };
};

const useLedgerAttention = (
  api: BrunchApi,
  activityIdentities: readonly (number | string)[] | undefined,
): number => {
  const isOpen = useStore(api.assistant.window.isOpen);
  const activeTab = useStore(api.assistant.window.activeTab);
  const viewing = isOpen && activeTab === "ledger";
  const [attention] = useState(createLedgerAttentionStore);
  useEffect(() => {
    attention.update(activityIdentities, viewing);
  }, [attention, activityIdentities, viewing]);
  return useSyncExternalStore(attention.subscribe, attention.getSnapshot);
};

/**
 * Runs the Brunch integration for the open document and publishes the result.
 * One instance per host mount: the Flue client and the conversation tracker
 * are rebuilt per document binding, as the demo shell did before.
 */
const BrunchRoot = ({
  api,
  config,
  stores,
}: {
  api: BrunchApi;
  config: BrunchHostConfig;
  stores: BrunchStores;
}) => {
  const brunchSelected = useStore(api.assistant.isActive);
  const currentDocument = useStore(config.document);
  const editorDocument = useStore(api.document);
  // The host's record and Petrinaut's handle describe the same document only
  // once both have switched; in between, Brunch holds back.
  const activeHandle = useMemo(
    () =>
      currentDocument !== null &&
      editorDocument?.id === currentDocument.documentId
        ? { handle: editorDocument.handle, document: currentDocument }
        : null,
    [currentDocument, editorDocument],
  );
  const inputMode = useStore(stores.inputMode);

  // --- Conversation identity: one conversation per document incarnation.
  const [freshConversationIds, setFreshConversationIds] = useState<
    Record<string, string>
  >({});
  const incarnationId = currentDocument?.incarnationId;
  const baseConstructionConversationId = useMemo(() => {
    if (!brunchSelected || incarnationId === undefined) return undefined;
    const initialId = ordinaryConstructionConversationIdFrom(incarnationId);
    return (
      freshConversationIds[incarnationId] ??
      getOrCreateBrunchConversationId(
        initialId,
        window.localStorage,
        () => initialId,
      )
    );
  }, [brunchSelected, freshConversationIds, incarnationId]);
  const fixtureProcessAgentConfiguration = useMemo<
    FixtureProcessAgentConfiguration | undefined
  >(
    () =>
      baseConstructionConversationId === undefined
        ? undefined
        : { conversationId: baseConstructionConversationId },
    [baseConstructionConversationId],
  );
  const baseProcessAgentBinding = useProcessAgentBinding({
    document: currentDocument,
    fixture: fixtureProcessAgentConfiguration,
  });
  const processAgentBinding = useMemo<ProcessAgentBinding | null>(
    () =>
      baseProcessAgentBinding === null
        ? null
        : {
            ...baseProcessAgentBinding,
            conversationId: brunchEvaluationConversationIdFrom(
              baseProcessAgentBinding.conversationId,
            ),
          },
    [baseProcessAgentBinding],
  );
  const conversationId = processAgentBinding?.conversationId ?? null;

  // --- Mutation approvals: each binding gets its own non-persisted authority.
  const mutationApproval = useMemo(
    () => ({
      binding: processAgentBinding,
      coordinator: createBrunchMutationApprovalCoordinator(),
    }),
    [processAgentBinding],
  );
  // The panel stays mounted when the binding changes, so a replaced authority
  // must settle the approvals still waiting on it.
  useEffect(() => {
    const { coordinator } = mutationApproval;
    coordinator.open();
    return () => coordinator.close();
  }, [mutationApproval]);
  const allMutationApprovalTools = useMemo(
    () =>
      createBrunchMutationApprovalInteractiveTools(
        mutationApproval.coordinator,
      ),
    [mutationApproval],
  );
  // A registered widget replaces the tool's row, so only calls still waiting
  // for a decision render as approvals. Refresh the registry when call identities
  // change; shouldHandle is the single gate, including for same-name calls.
  const approvalVersion = useSyncExternalStore(
    mutationApproval.coordinator.subscribe,
    mutationApproval.coordinator.getVersion,
    mutationApproval.coordinator.getVersion,
  );
  const mutationApprovalTools = useMemo(
    () => ({
      version: approvalVersion,
      tools: [...allMutationApprovalTools],
    }),
    [allMutationApprovalTools, approvalVersion],
  ).tools;

  // --- Session: a tracker and a Flue client per binding.
  const { conversationTracker, flueClientPromise } = useMemo(() => {
    const tracker = new BrunchPanelConversationTracker();
    const client =
      brunchSelected && processAgentBinding !== null
        ? createBrunchFlueClient(
            config.chatEndpoint,
            processAgentBinding.conversationId,
          )
        : null;
    return { conversationTracker: tracker, flueClientPromise: client };
  }, [brunchSelected, config.chatEndpoint, processAgentBinding]);

  // Failures Brunch contains — a stopped batch operation, a lost history
  // observation, a failed server tool — resolve normally for the panel and
  // the model; this is where they become visible.
  const { captureException } = use(ErrorTrackerContext);
  const reportBrunchFailure = useCallback(
    (
      failureSource: string,
      error: unknown,
      tags?: Readonly<Record<string, string | number | boolean>>,
    ) =>
      captureException(error, {
        source: `brunch.${failureSource}`,
        ...(tags === undefined ? {} : { tags }),
      }),
    [captureException],
  );

  // --- History and canonical tool replay.
  const constructionBrowser = useMemo(
    () =>
      brunchSelected && processAgentBinding !== null
        ? { binding: processAgentBinding }
        : undefined,
    [brunchSelected, processAgentBinding],
  );
  const dynamicClientToolNames =
    constructionBrowser === undefined
      ? undefined
      : brunchPetrinautClientToolNames;
  const constructionClientTools = brunchSelected
    ? brunchPetrinautClientToolNames
    : undefined;
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    constructionClientTools,
    dynamicClientToolNames,
  );
  const replayBindingKey = constructionBrowser
    ? `${constructionBrowser.binding.documentId}:${constructionBrowser.binding.incarnationId}:${constructionBrowser.binding.conversationId}`
    : undefined;
  const deriveCanonicalReplay = useCallback(
    async (snapshot: NonNullable<typeof flueHistory.snapshot>) => {
      if (constructionBrowser === undefined)
        return EMPTY_CANONICAL_PETRINAUT_REPLAY;
      return issuedCanonicalCallsFromHistory({ snapshot });
    },
    [constructionBrowser],
  );
  const canonicalReplayReadiness = useImmutableReplayBaseline<
    NonNullable<typeof flueHistory.snapshot>,
    CanonicalPetrinautReplay
  >({
    bindingKey: replayBindingKey,
    emptyReplay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    historyPhase: flueHistory.phase,
    snapshot: flueHistory.snapshot,
    derive: deriveCanonicalReplay,
  }) satisfies CanonicalPetrinautReplayReadiness;
  const canonicalHostTools = useMemo(() => {
    if (!constructionBrowser || !activeHandle) return undefined;
    return createCanonicalPetrinautHostTools({
      handle: activeHandle.handle,
      binding: constructionBrowser.binding,
      readTitle: () => activeHandle.document.title,
      replayReadiness: canonicalReplayReadiness,
      settleRevision: config.settleRevision,
    });
  }, [
    activeHandle,
    canonicalReplayReadiness,
    constructionBrowser,
    config.settleRevision,
  ]);
  useEffect(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  }, [flueHistory.error, flueHistory.phase, reportBrunchFailure]);

  // --- Transport, in-band browser calls and the draft-experiment tool.
  const petrinautAiChatTransport = useMemo(() => {
    if (flueClientPromise === null) return null;
    return createBrunchPanelTransport(flueClientPromise, conversationTracker, {
      ...(constructionBrowser
        ? { initialData: { binding: constructionBrowser.binding } }
        : {}),
      ...(conversationId !== null
        ? {
            liveToolStream: {
              headers: agentOwnershipHeaders({
                conversationId,
                principalKey: brunchPrincipal,
              }),
            },
          }
        : {}),
      ...(constructionClientTools === undefined
        ? {}
        : {
            clientToolNames: constructionClientTools,
            dynamicClientToolNames,
            ...(canonicalHostTools === undefined
              ? {}
              : { mapClientToolInput: (call) => call.input }),
          }),
      onAdmission: flueHistory.refresh,
      onToolOutputError: (event) =>
        reportBrunchFailure("server-tool", new Error(event.errorText), {
          submissionId: event.submissionId,
          toolCallId: event.toolCallId,
          toolName: event.toolName ?? "unknown",
        }),
    });
  }, [
    conversationTracker,
    conversationId,
    constructionClientTools,
    constructionBrowser,
    canonicalHostTools,
    dynamicClientToolNames,
    flueClientPromise,
    flueHistory.refresh,
    reportBrunchFailure,
  ]);
  const inBandBrowserTools = useMemo(
    () =>
      constructionBrowser && flueClientPromise
        ? createInBandBrowserCalls({
            client: flueClientPromise,
            principalKey: brunchPrincipal,
            binding: constructionBrowser.binding,
            metadataFor: async (toolCallId, output) =>
              canonicalHostTools?.clientToolResultMetadataFor(
                toolCallId,
                output,
              ),
            prepareInput: (call) => {
              canonicalHostTools?.mapClientToolInput(call);
            },
            admit: createBrunchMutationAdmission(mutationApproval.coordinator),
          })
        : undefined,
    [
      constructionBrowser,
      flueClientPromise,
      canonicalHostTools,
      mutationApproval,
    ],
  );
  const draftInteractiveTool = useMemo(
    () =>
      constructionBrowser &&
      activeHandle &&
      flueClientPromise &&
      inBandBrowserTools
        ? createBrunchDraftExperimentInteractiveTool({
            browserCalls: inBandBrowserTools,
            readTitle: () => activeHandle.document.title,
            readDraftAuthority: async (toolCallId) => {
              const client = await flueClientPromise;
              return resolveDraftAuthorityFromHistory(
                await client.history(),
                toolCallId,
              );
            },
          })
        : undefined,
    [activeHandle, flueClientPromise, inBandBrowserTools, constructionBrowser],
  );

  // --- The Ledger tab and its unseen-updates badge.
  const ledger = useMemo(() => {
    if (!constructionBrowser || !flueHistory.ready) return null;
    const messages = flueHistory.snapshot?.messages ?? [];
    return {
      binding: constructionBrowser.binding,
      messages,
      activityIdentities:
        flueHistory.phase === "absent"
          ? []
          : flueHistory.snapshot === undefined
            ? undefined
            : foldBrunchWorkpieceHistory(messages, constructionBrowser.binding)
                .activityIdentities,
    };
  }, [
    constructionBrowser,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
  ]);
  const ledgerAttention = useLedgerAttention(api, ledger?.activityIdentities);

  // --- Publish: the chat configuration, the Ledger tab, the conversation.
  const chat = useMemo<PetrinautAiAssistant | null>(() => {
    if (!brunchSelected || petrinautAiChatTransport === null) return null;
    return {
      primaryLabel: "Chat",
      presentation: "brunch",
      resolveToolPresentation: resolveBrunchToolPresentation,
      workingLabel: "Working…",
      renderComposerControl: (context: PetrinautAiComposerControlContext) => (
        <BrunchExperimentFollowUp context={context} />
      ),
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: true,
      // These exact-name tools override the static registry only while a
      // document binding is attached. Every other canonical capability remains
      // on Petrinaut's registry.
      inBandBrowserTools,
      automaticTools: [...(canonicalHostTools?.tools ?? [])],
      interactiveTools: [
        ...(inBandBrowserTools ? mutationApprovalTools : []),
        ...(draftInteractiveTool ? [draftInteractiveTool] : []),
      ],
      transport: petrinautAiChatTransport,
      ...(flueClientPromise === null
        ? {}
        : {
            requestStop: () =>
              requestFlueStop(flueClientPromise, conversationTracker),
            followMessages: {
              // This closure and `messages` below describe the same observed
              // snapshot, never a later mutable settlement cache.
              canReplace: () =>
                conversationTracker.canReplaceMessages(flueHistory.snapshot),
            },
          }),
      messages: flueHistory.messages,
      // Brunch's history lives on the server; the panel never writes it back.
      onMessages: () => {},
      onClearMessages: () => {
        if (incarnationId === undefined) return;
        const initialId = ordinaryConstructionConversationIdFrom(incarnationId);
        const nextId = `${initialId}:${crypto.randomUUID()}`;
        replaceBrunchConversationId(initialId, nextId);
        setFreshConversationIds((current) => ({
          ...current,
          [incarnationId]: nextId,
        }));
      },
      ...(inputMode?.mapMessagesForDisplay
        ? { mapMessagesForDisplay: inputMode.mapMessagesForDisplay }
        : {}),
      ...(inputMode?.renderVoiceMode
        ? { renderVoiceMode: inputMode.renderVoiceMode }
        : {}),
    };
  }, [
    brunchSelected,
    canonicalHostTools,
    conversationId,
    conversationTracker,
    draftInteractiveTool,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.snapshot,
    inBandBrowserTools,
    incarnationId,
    inputMode,
    mutationApprovalTools,
    petrinautAiChatTransport,
  ]);
  const tabs = useMemo<readonly PetrinautAssistantTab[]>(
    () =>
      ledger === null
        ? []
        : [
            {
              id: "ledger",
              label: "Ledger",
              mark: <Icon name="bars" size="xs" />,
              attention: ledgerAttention,
              render: () => (
                <BrunchWorkpiecePane
                  messages={ledger.messages}
                  binding={ledger.binding}
                />
              ),
            },
          ],
    [ledger, ledgerAttention],
  );
  useLayoutEffect(() => {
    stores.chat.set(chat);
  }, [stores.chat, chat]);
  useLayoutEffect(() => {
    stores.tabs.set(tabs);
  }, [stores.tabs, tabs]);
  useLayoutEffect(() => {
    stores.conversation.set(
      conversationId === null
        ? null
        : {
            conversationId,
            tracker: conversationTracker,
            settlements: flueHistory.settlements,
            snapshot: flueHistory.snapshot,
          },
    );
  }, [
    stores.conversation,
    conversationId,
    conversationTracker,
    flueHistory.settlements,
    flueHistory.snapshot,
  ]);
  return null;
};

export const createBrunchPlugin = (config: BrunchHostConfig) =>
  definePetrinautPlugin(brunchManifest, (api) => {
    const stores: BrunchStores = {
      chat: createReadableStore<PetrinautAiAssistant | null>(null),
      tabs: createReadableStore<readonly PetrinautAssistantTab[]>([]),
      conversation: createReadableStore<BrunchConversationState | null>(null),
      inputMode: createReadableStore<BrunchInputMode | null>(null),
    };
    const conversation: BrunchConversationApi = {
      active: api.assistant.isActive,
      conversation: stores.conversation,
      registerInputMode(mode) {
        stores.inputMode.set(mode);
        return () => {
          if (stores.inputMode.get() === mode) stores.inputMode.set(null);
        };
      },
    };
    return {
      root: () => <BrunchRoot api={api} config={config} stores={stores} />,
      assistant: { chat: stores.chat, tabs: stores.tabs },
      provides: { conversation },
    };
  });
