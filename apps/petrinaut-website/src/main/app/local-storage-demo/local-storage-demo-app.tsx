/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
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
import {
  CommandRegistryProvider,
  ErrorTrackerContext,
  useCommand,
} from "@hashintel/petrinaut/react";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiComposerControlContext,
  type PetrinautAiMessage,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";

import { useSharedSearchNavigation } from "../../../examples/use-shared-search-navigation";
import { StatusPage } from "../../../shared/status-page";
import { VOICE_REQUEST_ID_HEADER } from "../../../voice-diagnostics";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../plugins/brunch/brunch-panel-transport";
import { resolveBrunchPreviewConfig } from "../plugins/brunch/brunch-preview-config";
import {
  brunchEvaluationConversationIdFrom,
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
} from "../plugins/brunch/conversation/brunch-conversation-id";
import { getOrCreateBrunchPrincipal } from "../plugins/brunch/conversation/brunch-principal";
import { useFlueChatHistory } from "../plugins/brunch/conversation/use-flue-chat-history";
import {
  useProcessAgentBinding,
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
} from "../plugins/brunch/conversation/use-process-agent-binding";
import { foldBrunchWorkpieceHistory } from "../plugins/brunch/ledger/brunch-workpiece-history";
import { BrunchWorkpiecePane } from "../plugins/brunch/ledger/brunch-workpiece-pane";
import { requestFlueStop } from "../plugins/brunch/plugin/request-flue-stop";
import { useImmutableReplayBaseline } from "../plugins/brunch/plugin/use-immutable-replay-baseline";
import { brunchPetrinautClientToolNames } from "../plugins/brunch/tools/brunch-client-tools";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "../plugins/brunch/tools/brunch-draft-experiment-interactive-tool";
import { BrunchExperimentFollowUp } from "../plugins/brunch/tools/brunch-experiment-follow-up";
import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "../plugins/brunch/tools/brunch-mutation-approval";
import {
  createCanonicalPetrinautHostTools,
  issuedCanonicalCallsFromHistory,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  type CanonicalPetrinautReplay,
  type CanonicalPetrinautReplayReadiness,
} from "../plugins/brunch/tools/brunch-petrinaut-tools";
import { resolveBrunchToolPresentation } from "../plugins/brunch/tools/brunch-tool-presentation";
import { createInBandBrowserCalls } from "../plugins/brunch/tools/in-band-browser-call";
import { CommandPalette } from "../plugins/command-palette/plugin/command-palette";
import { useLocalStorageAiMessages } from "../plugins/petrinaut-ai/plugin/use-local-storage-ai-messages";
import { getBrunchVoiceMode } from "../plugins/voice/brunch-voice-mode";
import { useVoiceMediationHistory } from "../plugins/voice/history/use-voice-mediation-history";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
} from "../plugins/voice/session/voice-interview-control";
import { walkthroughSteps } from "../plugins/walkthrough/walkthrough-steps";
import { useSentryFeedbackAction } from "../sentry-feedback-button";
import { AssistantLabsSettings } from "./assistant-labs-settings";
import {
  isBrunchSelected,
  stockChatEndpoint,
  type AssistantSelection,
  useAssistantSelection,
} from "./assistant-selection";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { UnsavedChangeNotice } from "./unsaved-change-notice";
import { useRealtimePreference, useVoicePreference } from "./voice-preference";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

const brunchPrincipal = getOrCreateBrunchPrincipal();

const subscribeToNothing = () => () => {};
const readNothing = () => undefined;

// The stock assistant's transport is the same whether or not Brunch is
// configured: selecting the stock assistant must not route it through Brunch.
const stockChatTransport = new DefaultChatTransport({
  api: stockChatEndpoint,
  headers: () => ({
    [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID(),
  }),
});

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

const createConversationTrackerFor = (
  _conversationId: string | null,
): BrunchPanelConversationTracker => new BrunchPanelConversationTracker();

const useProcessAgentSession = (input: {
  readonly binding: ProcessAgentBinding | null;
  readonly brunchSelected: boolean;
}) => {
  return useMemo(() => {
    const conversationTracker = createConversationTrackerFor(
      input.binding?.conversationId ?? null,
    );
    const flueClientPromise =
      input.brunchSelected && input.binding !== null
        ? createBrunchFlueClient(input.binding.conversationId)
        : null;
    return { conversationTracker, flueClientPromise };
  }, [input.binding, input.brunchSelected]);
};

/**
 * The demo's own palette commands, registered beside Petrinaut's.
 * Brunch and Stock are selected through the product UI.
 */
const DemoCommands = ({
  brunchSelected,
  selectAssistant,
}: {
  brunchSelected: boolean;
  selectAssistant: (selection: "brunch" | "stock") => void;
}) => {
  useCommand(
    {
      id: "demo.assistant.switch",
      label: brunchSelected
        ? "Use the stock Petrinaut assistant"
        : "Use Brunch",
      category: "Demo",
      keywords: ["assistant", "brunch", "stock", "ai"],
      run: () => selectAssistant(brunchSelected ? "stock" : "brunch"),
    },
    { when: brunchPreviewConfig.isBrunchConfigured },
  );
  return null;
};

/**
 * Local-storage demo shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets.
 */
export const LocalStorageDemoApp = ({
  netId,
  onOpenNet,
  onSearchChange,
  search,
}: {
  /** The open net, named by the URL. */
  netId: string;
  /** Opens another net, by passing it back as `netId`. */
  onOpenNet: (netId: string) => void;
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
}) => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const {
    ready: assistantSelectionReady,
    selection: assistantSelection,
    setSelection: setAssistantSelection,
  } = useAssistantSelection();
  const {
    enabled: voiceEnabled,
    ready: voicePreferenceReady,
    setEnabled: setVoiceEnabled,
  } = useVoicePreference();
  const {
    enabled: realtimeEnabled,
    ready: realtimePreferenceReady,
    setEnabled: setRealtimeEnabled,
  } = useRealtimePreference();
  const brunchSelected =
    assistantSelectionReady &&
    isBrunchSelected(
      brunchPreviewConfig.isBrunchConfigured,
      assistantSelection,
    );
  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  const selectAssistant = (selection: AssistantSelection) => {
    setOpenAIVoiceConfig(selection === "brunch" ? undefined : null);
    setAssistantSelection(selection);
    if (selection === "brunch") setVoiceEnabled(true);
  };
  /**
   * History is left to the library's default on purpose. That default already
   * replaces rather than pushes while an intent continues, so a drag-select
   * records one entry instead of one per intermediate selection, and a discrete
   * click is the only thing that pushes. Making selections replace as well
   * removed every entry this page can produce, which left the first Back press
   * leaving the site instead of retracing the net.
   */
  const navigation = useSharedSearchNavigation(search, onSearchChange, {
    // The location belongs to the open net. Petrinaut resets its own location
    // per document, but not a controlled one, so the host resets this one.
    resetKey: netId,
  });
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const { controller } = useDocumentController({
    documentId: netId,
    onOpenDocument: onOpenNet,
  });
  const { repository } = controller;
  const currentDocument = repository.current;
  const currentNetId = currentDocument?.documentId ?? null;

  useEffect(() => {
    if (!brunchSelected) {
      return;
    }

    const abortController = new AbortController();
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- reset stale capability before a newly selected Brunch session checks Voice
    setOpenAIVoiceConfig(undefined);
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((config) => {
      if (!abortController.signal.aborted) {
        setOpenAIVoiceConfig(config);
      }
    });

    return () => abortController.abort();
  }, [brunchSelected]);

  const { activeHandle, unsavedChangeMessage } = useActiveHandle(repository);

  const existingNets: MinimalNetMetadata[] = repository.records
    .map((document) => ({
      netId: document.documentId,
      title: document.title,
      lastUpdated: document.lastUpdated ?? new Date(0).toISOString(),
    }))
    .toSorted(
      (left, right) =>
        new Date(right.lastUpdated).getTime() -
        new Date(left.lastUpdated).getTime(),
    );

  const createNewNet = (params: { petriNetDefinition: SDCPN; title: string }) =>
    controller.createAndOpen({
      definition: params.petriNetDefinition,
      title: params.title,
    });

  const loadPetriNet = (petriNetId: string) => {
    repository.open(petriNetId);
  };

  const renameCurrentDocument = repository.actions.rename;
  const setTitle =
    currentDocument === null
      ? undefined
      : (title: string) =>
          renameCurrentDocument({
            documentId: currentDocument.documentId,
            title,
          });
  const [freshConversationIds, setFreshConversationIds] = useState<
    Record<string, string>
  >({});
  const baseConstructionConversationId = useMemo(() => {
    if (!brunchSelected || currentNetId === null) return undefined;
    const initialId = ordinaryConstructionConversationIdFrom(currentNetId);
    return (
      freshConversationIds[currentNetId] ??
      getOrCreateBrunchConversationId(
        initialId,
        window.localStorage,
        () => initialId,
      )
    );
  }, [brunchSelected, currentNetId, freshConversationIds]);
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
  const processAgentBinding = useMemo(
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
  // Each binding gets its own non-persisted approval authority.
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
  const processAgentSession = useProcessAgentSession({
    binding: processAgentBinding,
    brunchSelected,
  });
  const { conversationTracker, flueClientPromise } = processAgentSession;
  // Failures the host contains — a stopped batch operation, an unrecordable
  // transition, a lost history observation, a failed server tool — resolve
  // normally for the panel and the model; this is where they become visible.
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
    ? `${constructionBrowser.binding.documentId}:${constructionBrowser.binding.conversationId}`
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
      readTitle: () => activeHandle.document.title,
      replayReadiness: canonicalReplayReadiness,
    });
  }, [activeHandle, canonicalReplayReadiness, constructionBrowser]);
  const mediationHistory = useVoiceMediationHistory(conversationId);
  const mapVoiceMessages = useSyncExternalStore(
    mediationHistory?.subscribe ?? subscribeToNothing,
    mediationHistory?.getSnapshot ?? readNothing,
    mediationHistory?.getSnapshot ?? readNothing,
  );
  useLayoutEffect(() => {
    mediationHistory?.sync(flueHistory.snapshot);
  }, [mediationHistory, flueHistory.snapshot]);
  useEffect(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  }, [flueHistory.error, flueHistory.phase, reportBrunchFailure]);
  const brunchVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        brunchSelected &&
          voicePreferenceReady &&
          voiceEnabled &&
          realtimePreferenceReady &&
          openAIVoiceConfig
          ? {
              ...openAIVoiceConfig,
              provider: realtimeEnabled ? "realtime" : "live",
            }
          : null,
        conversationTracker,
        flueHistory.settlements,
        flueHistory.snapshot,
        mediationHistory,
        (toolCallId) => mutationApproval.coordinator.approvalState(toolCallId),
      ),
    [
      brunchSelected,
      conversationTracker,
      flueHistory.settlements,
      flueHistory.snapshot,
      mediationHistory,
      mutationApproval,
      openAIVoiceConfig,
      realtimeEnabled,
      realtimePreferenceReady,
      voiceEnabled,
      voicePreferenceReady,
    ],
  );
  const transportClientPromise = flueClientPromise;
  const petrinautAiChatTransport = useMemo(() => {
    if (transportClientPromise !== null) {
      return createBrunchPanelTransport(
        transportClientPromise,
        conversationTracker,
        {
          ...(constructionBrowser
            ? { initialData: { binding: constructionBrowser.binding } }
            : {}),
          ...(transportClientPromise === flueClientPromise &&
          conversationId !== null
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
                  : {
                      mapClientToolInput: (call) => call.input,
                    }),
              }),
          onAdmission: flueHistory.refresh,
          onToolOutputError: (event) =>
            reportBrunchFailure("server-tool", new Error(event.errorText), {
              submissionId: event.submissionId,
              toolCallId: event.toolCallId,
              toolName: event.toolName ?? "unknown",
            }),
        },
      );
    }
    return stockChatTransport;
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
    transportClientPromise,
  ]);

  const inBandBrowserTools = useMemo(
    () =>
      constructionBrowser && flueClientPromise
        ? createInBandBrowserCalls({
            client: flueClientPromise,
            principalKey: brunchPrincipal,
            binding: constructionBrowser.binding,
            metadataFor: (toolCallId, output) =>
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
  const aiAssistant = useMemo(() => {
    const activityIdentities =
      constructionBrowser && flueHistory.ready
        ? flueHistory.phase === "absent"
          ? []
          : flueHistory.snapshot === undefined
            ? undefined
            : foldBrunchWorkpieceHistory(
                flueHistory.snapshot.messages,
                constructionBrowser.binding,
              ).activityIdentities
        : undefined;
    return {
      additionalTab: constructionBrowser
        ? {
            label: "Ledger",
            activityIdentities,
            content: (
              <BrunchWorkpiecePane
                messages={flueHistory.snapshot?.messages ?? []}
                binding={constructionBrowser.binding}
              />
            ),
          }
        : undefined,
      ...(brunchSelected
        ? {
            primaryLabel: "Chat",
            presentation: "brunch" as const,
            mapMessagesForDisplay: mapVoiceMessages,
            resolveToolPresentation: resolveBrunchToolPresentation,
            workingLabel: "Working…",
            renderComposerControl: (
              context: PetrinautAiComposerControlContext,
            ) => <BrunchExperimentFollowUp context={context} />,
          }
        : {}),
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
      messages:
        flueClientPromise === null
          ? currentNetId
            ? aiMessagesByNetId[currentNetId]
            : undefined
          : flueHistory.messages,
      onMessages: (messages: PetrinautAiMessage[]) => {
        if (!currentNetId || flueClientPromise !== null) {
          return;
        }

        setAiMessagesByNetId((prev) => ({
          ...prev,
          [currentNetId]: messages,
        }));
      },
      onClearMessages: () => {
        if (flueClientPromise !== null && currentNetId !== null) {
          const initialId =
            ordinaryConstructionConversationIdFrom(currentNetId);
          const nextId = `${initialId}:${crypto.randomUUID()}`;
          replaceBrunchConversationId(initialId, nextId);
          setFreshConversationIds((current) => ({
            ...current,
            [currentNetId]: nextId,
          }));
          return;
        }
        if (!currentNetId || flueClientPromise !== null) {
          return;
        }

        setAiMessagesByNetId((prev) => {
          const next = { ...prev };
          delete next[currentNetId];
          return next;
        });
      },
      ...(brunchVoiceMode
        ? {
            renderVoiceMode: brunchVoiceMode,
          }
        : {}),
    };
  }, [
    aiMessagesByNetId,
    mapVoiceMessages,
    brunchSelected,
    brunchVoiceMode,
    canonicalHostTools,
    inBandBrowserTools,
    draftInteractiveTool,
    mutationApprovalTools,
    constructionBrowser,
    conversationTracker,
    conversationId,
    currentNetId,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
    petrinautAiChatTransport,
    setAiMessagesByNetId,
  ]);

  if (repository.status.state === "ready" && currentDocument === null) {
    return (
      <StatusPage
        title="Local document not found"
        body="Documents are saved in the browser that created them. Open this link in that browser, or go back to your documents."
      />
    );
  }

  if (
    repository.status.state === "loading" ||
    currentDocument === null ||
    !activeHandle ||
    activeHandle.document.documentId !== currentDocument.documentId
  ) {
    return <p>Loading document…</p>;
  }

  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        width: "100vw",
      }}
    >
      {unsavedChangeMessage !== null ? (
        <UnsavedChangeNotice message={unsavedChangeMessage} />
      ) : null}
      <CommandRegistryProvider>
        <WalkthroughProvider steps={walkthroughSteps}>
          <Petrinaut
            aiAssistant={aiAssistant}
            handle={activeHandle.handle}
            existingNets={existingNets}
            createNewNet={createNewNet}
            loadPetriNet={loadPetriNet}
            navigation={navigation}
            readonly={false}
            setTitle={setTitle}
            slots={{
              settingsLabs: (
                <AssistantLabsSettings
                  assistantReady={assistantSelectionReady}
                  brunchConfigured={brunchPreviewConfig.isBrunchConfigured}
                  brunchSelected={brunchSelected}
                  openAIVoiceConfig={openAIVoiceConfig}
                  realtimeEnabled={realtimeEnabled}
                  realtimePreferenceReady={realtimePreferenceReady}
                  selectAssistant={selectAssistant}
                  setRealtimeEnabled={setRealtimeEnabled}
                  setVoiceEnabled={setVoiceEnabled}
                  voiceEnabled={brunchSelected && voiceEnabled}
                  voicePreferenceReady={voicePreferenceReady}
                />
              ),
            }}
            title={currentDocument.title}
            viewportActions={[sentryFeedbackAction]}
          />
        </WalkthroughProvider>
        <DemoCommands
          brunchSelected={brunchSelected}
          selectAssistant={selectAssistant}
        />
        <CommandPalette />
      </CommandRegistryProvider>
    </div>
  );
};
