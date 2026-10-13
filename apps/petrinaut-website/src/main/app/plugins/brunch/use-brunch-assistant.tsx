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
} from "@hashintel/brunch-agent";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";

import { createBrunchFlueAdapter } from "./brunch-flue-adapter";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import {
  brunchEvaluationConversationIdFrom,
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
} from "./conversation/brunch-conversation-id";
import { getOrCreateBrunchPrincipal } from "./conversation/brunch-principal";
import { useFlueChatHistory } from "./conversation/use-flue-chat-history";
import {
  useProcessAgentBinding,
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
} from "./conversation/use-process-agent-binding";
import { foldBrunchLedgerHistory } from "./ledger/brunch-ledger-history";
import { BrunchLedgerPane } from "./ledger/brunch-ledger-pane";
import { brunchPlugin, WithBrunchEditorApi } from "./plugin";
import {
  brunchPetrinautClientToolNames,
  canonicalPetrinautClientToolNames,
} from "./tools/brunch-client-tools";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "./tools/brunch-draft-experiment-interactive-tool";
import { BrunchExperimentFollowUp } from "./tools/brunch-experiment-follow-up";
import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "./tools/brunch-mutation-approval";
import {
  createCanonicalPetrinautHostTools,
  issuedCanonicalCallsFromHistory,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  type CanonicalPetrinautReplay,
  type CanonicalPetrinautReplayReadiness,
} from "./tools/brunch-petrinaut-tools";
import { resolveBrunchToolPresentation } from "./tools/brunch-tool-presentation";
import { createInBandBrowserCalls } from "./tools/in-band-browser-call";
import { requestFlueStop } from "./use-brunch-assistant/request-flue-stop";
import { useImmutableReplayBaseline } from "./use-brunch-assistant/use-immutable-replay-baseline";
import { getBrunchVoiceMode } from "./voice/brunch-voice-mode";
import { useVoiceMediationHistory } from "./voice/history/use-voice-mediation-history";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
} from "./voice/session/voice-interview-control";

import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type {
  PetrinautAiAssistant,
  PetrinautAiComposerControlContext,
} from "@hashintel/petrinaut/ui";
import type { PetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

export const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

const brunchPrincipal = getOrCreateBrunchPrincipal();

const subscribeToNothing = () => () => {};
const readNothing = () => undefined;

const noPlugins: readonly PetrinautPlugin[] = [];
const brunchPlugins: readonly PetrinautPlugin[] = [brunchPlugin];

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

/** The open document as Brunch's browser tools reach it. */
export interface BrunchEditorDocument {
  readonly handle: PetrinautDocHandle;
  readonly readTitle: () => string;
}

/** Brunch's Voice choices, as the host stores them. */
export interface BrunchVoicePreferences {
  /** The host's Voice preference is loaded and on. */
  readonly enabled: boolean;
  /** Use Realtime rather than Live for the next Voice session. */
  readonly realtime: boolean;
}

export interface BrunchAssistant {
  /**
   * Brunch's assistant configuration for `<Petrinaut aiAssistant>`, or `null`
   * while Brunch is not selected or no document is bound.
   */
  readonly assistant: PetrinautAiAssistant | null;
  /**
   * The open document's bound conversation id. Computed whichever assistant is
   * selected: the stock assistant currently takes it as its chat identity.
   */
  readonly conversationId: string | null;
  /**
   * Whether the server offers Voice: `undefined` while checking, `null` when it
   * does not or Brunch is not selected.
   */
  readonly openAIVoiceConfig: OpenAIVoiceConfig | null | undefined;
  /**
   * The plugins Brunch adds to the editor while it is the assistant: its cards
   * read the editor through their `api`.
   */
  readonly plugins: readonly PetrinautPlugin[];
}

/**
 * Brunch as the editor's assistant: binds the open document to its Flue
 * conversation and assembles the chat, the Ledger tab, Brunch's browser tools
 * and Voice.
 */
export const useBrunchAssistant = ({
  selected,
  document,
  editor,
  voice,
}: {
  /** Brunch is configured and chosen as the assistant. */
  readonly selected: boolean;
  /** The open document, or `null` while none is open. */
  readonly document: { readonly documentId: string } | null;
  /** The open document's live handle, or `null` while it is loading. */
  readonly editor: BrunchEditorDocument | null;
  readonly voice: BrunchVoicePreferences;
}): BrunchAssistant => {
  const currentNetId = document?.documentId ?? null;

  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  // A newly selected Brunch checks Voice afresh; until then it reads as checking.
  const [voiceCheckSelected, setVoiceCheckSelected] = useState(selected);
  if (selected !== voiceCheckSelected) {
    setVoiceCheckSelected(selected);
    setOpenAIVoiceConfig(undefined);
  }
  useEffect(() => {
    if (!selected) {
      return;
    }

    const abortController = new AbortController();
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((config) => {
      if (!abortController.signal.aborted) {
        setOpenAIVoiceConfig(config);
      }
    });

    return () => abortController.abort();
  }, [selected]);

  const [freshConversationIds, setFreshConversationIds] = useState<
    Record<string, string>
  >({});
  const baseConstructionConversationId = useMemo(() => {
    if (!selected || currentNetId === null) return undefined;
    const initialId = ordinaryConstructionConversationIdFrom(currentNetId);
    return (
      freshConversationIds[currentNetId] ??
      getOrCreateBrunchConversationId(
        initialId,
        window.localStorage,
        () => initialId,
      )
    );
  }, [selected, currentNetId, freshConversationIds]);
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
    document,
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
    brunchSelected: selected,
  });
  const { conversationTracker, flueClientPromise } = processAgentSession;
  // Failures the host contains — a stopped batch operation, an unrecordable
  // transition, a lost history observation, a failed server tool, a dropped
  // update stream — resolve normally for the panel and the model; this is
  // where they become visible.
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
      selected && processAgentBinding !== null
        ? { binding: processAgentBinding }
        : undefined,
    [selected, processAgentBinding],
  );
  const dynamicClientToolNames =
    constructionBrowser === undefined
      ? undefined
      : brunchPetrinautClientToolNames;
  const constructionClientTools = selected
    ? brunchPetrinautClientToolNames
    : undefined;
  const flueAdapter = useMemo(
    () =>
      createBrunchFlueAdapter(
        {
          clientToolNames:
            constructionClientTools ?? canonicalPetrinautClientToolNames,
          dynamicClientToolNames,
        },
        {
          onInvalidReopenedMetadata: ({ messageId, error }) =>
            reportBrunchFailure("reopened-metadata", error, { messageId }),
        },
      ),
    [constructionClientTools, dynamicClientToolNames, reportBrunchFailure],
  );
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    flueAdapter,
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
    if (!constructionBrowser || !editor) return undefined;
    return createCanonicalPetrinautHostTools({
      handle: editor.handle,
      readTitle: editor.readTitle,
      replayReadiness: canonicalReplayReadiness,
    });
  }, [editor, canonicalReplayReadiness, constructionBrowser]);
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
        selected && voice.enabled && openAIVoiceConfig
          ? {
              ...openAIVoiceConfig,
              provider: voice.realtime ? "realtime" : "live",
            }
          : null,
        conversationTracker,
        flueHistory.settlements,
        flueHistory.snapshot,
        mediationHistory,
        (toolCallId) => mutationApproval.coordinator.approvalState(toolCallId),
      ),
    [
      selected,
      conversationTracker,
      flueHistory.settlements,
      flueHistory.snapshot,
      mediationHistory,
      mutationApproval,
      openAIVoiceConfig,
      voice.enabled,
      voice.realtime,
    ],
  );
  const brunchChatTransport = useMemo(
    () =>
      flueClientPromise === null
        ? null
        : createBrunchPanelTransport(flueClientPromise, conversationTracker, {
            ...(constructionBrowser
              ? { initialData: { binding: constructionBrowser.binding } }
              : {}),
            ...(conversationId === null
              ? {}
              : {
                  liveToolStream: {
                    headers: agentOwnershipHeaders({
                      conversationId,
                      principalKey: brunchPrincipal,
                    }),
                  },
                }),
            adapter: flueAdapter,
            onAdmission: flueHistory.refresh,
            onToolOutputError: (event) =>
              reportBrunchFailure("server-tool", new Error(event.errorText), {
                submissionId: event.submissionId,
                toolCallId: event.toolCallId,
                toolName: event.toolName ?? "unknown",
              }),
            onReattach: (event) =>
              reportBrunchFailure("stream-reattach", event.error, {
                submissionId: event.submissionId,
                attempt: event.attempt,
              }),
            onDisconnect: flueHistory.refresh,
          }),
    [
      conversationTracker,
      conversationId,
      constructionBrowser,
      flueAdapter,
      flueClientPromise,
      flueHistory.refresh,
      reportBrunchFailure,
    ],
  );

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
            acceptsRevision: (expected) =>
              canonicalHostTools?.acceptsRevision(expected) ?? false,
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
      constructionBrowser && editor && flueClientPromise && inBandBrowserTools
        ? createBrunchDraftExperimentInteractiveTool({
            browserCalls: inBandBrowserTools,
            readTitle: editor.readTitle,
            readDefinition: () => editor.handle.doc(),
            readDraftAuthority: async (toolCallId) => {
              const client = await flueClientPromise;
              return resolveDraftAuthorityFromHistory(
                await client.history(),
                toolCallId,
              );
            },
          })
        : undefined,
    [editor, flueClientPromise, inBandBrowserTools, constructionBrowser],
  );
  const assistant = useMemo((): PetrinautAiAssistant | null => {
    if (flueClientPromise === null || brunchChatTransport === null) {
      return null;
    }
    const activityIdentities =
      constructionBrowser && flueHistory.ready
        ? flueHistory.phase === "absent"
          ? []
          : flueHistory.snapshot === undefined
            ? undefined
            : foldBrunchLedgerHistory(flueHistory.snapshot.messages)
                .activityIdentities
        : undefined;
    return {
      additionalTab: constructionBrowser
        ? {
            label: "Ledger",
            activityIdentities,
            content: (
              <BrunchLedgerPane
                messages={flueHistory.snapshot?.messages ?? []}
              />
            ),
          }
        : undefined,
      primaryLabel: "Chat",
      presentation: "brunch",
      mapMessagesForDisplay: mapVoiceMessages,
      resolveToolPresentation: resolveBrunchToolPresentation,
      workingLabel: "Working…",
      renderComposerControl: (context: PetrinautAiComposerControlContext) => (
        <WithBrunchEditorApi>
          {(api) => (
            <BrunchExperimentFollowUp
              context={context}
              net={api.document.net}
            />
          )}
        </WithBrunchEditorApi>
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
      transport: brunchChatTransport,
      requestStop: () =>
        requestFlueStop(flueClientPromise, conversationTracker),
      followMessages: {
        // This closure and `messages` below describe the same observed
        // snapshot, never a later mutable settlement cache.
        canReplace: () =>
          conversationTracker.canReplaceMessages(flueHistory.snapshot),
      },
      messages: flueHistory.messages,
      onClearMessages: () => {
        if (currentNetId === null) return;
        const initialId = ordinaryConstructionConversationIdFrom(currentNetId);
        const nextId = `${initialId}:${crypto.randomUUID()}`;
        replaceBrunchConversationId(initialId, nextId);
        setFreshConversationIds((current) => ({
          ...current,
          [currentNetId]: nextId,
        }));
      },
      ...(brunchVoiceMode
        ? {
            renderVoiceMode: brunchVoiceMode,
          }
        : {}),
    };
  }, [
    brunchChatTransport,
    brunchVoiceMode,
    canonicalHostTools,
    constructionBrowser,
    conversationId,
    conversationTracker,
    currentNetId,
    draftInteractiveTool,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
    inBandBrowserTools,
    mapVoiceMessages,
    mutationApprovalTools,
  ]);

  return {
    assistant,
    conversationId,
    openAIVoiceConfig: selected ? openAIVoiceConfig : null,
    plugins: assistant === null ? noPlugins : brunchPlugins,
  };
};
