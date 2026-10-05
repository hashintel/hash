/**
 * The Brunch plugin's body: runs the Brunch integration for the open document
 * as a hook and returns the chat configuration Petrinaut's chat kit renders,
 * the Ledger tab, and the conversation other plugins read through the
 * `BrunchConversation` token. The manifest and the binding are in
 * `../plugin.ts`; the host's contract is `../brunch-host.ts`.
 */

import { createFlueClient } from "@flue/sdk";
import {
  use,
  useEffect,
  useEffectEvent,
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
  type PetrinautAiAssistant,
  type PetrinautAiComposerControlContext,
  type PetrinautAiStopResult,
  type PetrinautPluginBody,
} from "@hashintel/petrinaut/ui";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "../../_shared/brunch-panel-transport";
import { BrunchHostContext } from "../brunch-host";
import {
  brunchEvaluationConversationIdFrom,
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
} from "../conversation/brunch-conversation-id";
import { getOrCreateBrunchPrincipal } from "../conversation/brunch-principal";
import { useFlueChatHistory } from "../conversation/use-flue-chat-history";
import {
  type ProcessAgentBinding,
  useProcessAgentBinding,
} from "../conversation/use-process-agent-binding";
import { foldBrunchWorkpieceHistory } from "../ledger/brunch-workpiece-history";
import { BrunchWorkpiecePane } from "../ledger/brunch-workpiece-pane";
import { brunchPetrinautClientToolNames } from "../tools/brunch-client-tools";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "../tools/brunch-draft-experiment-interactive-tool";
import { BrunchExperimentFollowUp } from "../tools/brunch-experiment-follow-up";
import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "../tools/brunch-mutation-approval";
import {
  createCanonicalPetrinautHostTools,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  issuedCanonicalCallsFromHistory,
  type CanonicalPetrinautReplay,
  type CanonicalPetrinautReplayReadiness,
} from "../tools/brunch-petrinaut-tools";
import { resolveBrunchToolPresentation } from "../tools/brunch-tool-presentation";
import { createInBandBrowserCalls } from "../tools/in-band-browser-call";
import { useImmutableReplayBaseline } from "./use-immutable-replay-baseline";
import { useInstanceFor } from "./use-instance-for";

import type { BrunchManifest } from "../plugin";

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

const bindingKey = (binding: ProcessAgentBinding) =>
  `${binding.documentId}:${binding.incarnationId}:${binding.conversationId}`;

/** The binding Brunch evaluates against: the construction binding's evaluation conversation. */
const evaluationBinding = (base: ProcessAgentBinding): ProcessAgentBinding => ({
  ...base,
  conversationId: brunchEvaluationConversationIdFrom(base.conversationId),
});

const subscribeToNothing = () => () => {};
const zeroVersion = () => 0;

/**
 * Runs the Brunch integration for the open document and returns the result.
 * The Flue client and the conversation tracker are rebuilt per document
 * binding, as the demo shell did before.
 */
export const useBrunchPlugin: PetrinautPluginBody<BrunchManifest> = (api) => {
  const host = use(BrunchHostContext);
  if (host === null) {
    throw new Error(
      "The Brunch plugin reads BrunchHostContext; provide it above the editor.",
    );
  }
  const brunchSelected = api.assistant.isActive;
  const currentDocument = host.document;
  const { handle } = api.document;
  // The host's record and Petrinaut's handle describe the same document only
  // once both have switched; in between, Brunch holds back.
  const activeHandle =
    currentDocument !== null && handle.id === currentDocument.documentId
      ? { handle, document: currentDocument }
      : null;

  // --- Conversation identity: one conversation per document incarnation.
  const [freshConversationIds, setFreshConversationIds] = useState<
    Record<string, string>
  >({});
  const incarnationId = currentDocument?.incarnationId;
  const initialConversationId =
    incarnationId === undefined
      ? undefined
      : ordinaryConstructionConversationIdFrom(incarnationId);
  const baseConstructionConversationId =
    brunchSelected &&
    incarnationId !== undefined &&
    initialConversationId !== undefined
      ? (freshConversationIds[incarnationId] ??
        getOrCreateBrunchConversationId(
          initialConversationId,
          window.localStorage,
          () => initialConversationId,
        ))
      : undefined;
  const baseProcessAgentBinding = useProcessAgentBinding({
    document: currentDocument,
    fixture:
      baseConstructionConversationId === undefined
        ? undefined
        : { conversationId: baseConstructionConversationId },
  });
  const processAgentBinding =
    baseProcessAgentBinding === null
      ? null
      : evaluationBinding(baseProcessAgentBinding);
  const conversationId = processAgentBinding?.conversationId ?? null;
  /** The binding Brunch works against: only while it is the shown assistant. */
  const binding = brunchSelected ? processAgentBinding : null;

  // --- Mutation approvals: one authority per binding, with the decisions the
  // panel's widgets resolve against, so it is an instance keyed on the binding.
  const coordinator = useInstanceFor(
    processAgentBinding === null ? null : bindingKey(processAgentBinding),
    createBrunchMutationApprovalCoordinator,
  );
  // The panel stays mounted when the binding changes, so a replaced authority
  // must settle the approvals still waiting on it.
  useEffect(() => {
    if (coordinator === null) return;
    coordinator.open();

    return () => coordinator.close();
  }, [coordinator]);
  const approvalVersion = useSyncExternalStore(
    coordinator?.subscribe ?? subscribeToNothing,
    coordinator?.getVersion ?? zeroVersion,
    coordinator?.getVersion ?? zeroVersion,
  );
  const approvalTools = useInstanceFor(
    processAgentBinding === null ? null : bindingKey(processAgentBinding),
    () =>
      coordinator === null
        ? []
        : createBrunchMutationApprovalInteractiveTools(coordinator),
  );
  // A registered widget replaces the tool's row, so only calls still waiting
  // for a decision render as approvals. The panel reads `shouldHandle` when
  // the list changes, so the list is rebuilt for every version of the pending
  // set while its tools, and their widgets, stay the same.
  const mutationApprovalTools = useInstanceFor(
    processAgentBinding === null
      ? null
      : `${bindingKey(processAgentBinding)}:${approvalVersion}`,
    () => [...(approvalTools ?? [])],
  );

  // --- Session: a tracker and a Flue client per shown binding.
  const session = useInstanceFor(
    binding === null ? null : bindingKey(binding),
    () => ({
      tracker: new BrunchPanelConversationTracker(),
      client: createBrunchFlueClient(
        host.chatEndpoint,
        // `binding` is set whenever the key is.
        binding?.conversationId ?? "",
      ),
    }),
  );
  const flueClientPromise = session?.client ?? null;

  // Failures Brunch contains, a stopped batch operation, a lost history
  // observation, a failed server tool, resolve normally for the panel and
  // the model; this is where they become visible.
  const reportBrunchFailure = (
    failureSource: string,
    error: unknown,
    tags?: Readonly<Record<string, string | number | boolean>>,
  ) =>
    api.errors.capture(error, {
      source: `brunch.${failureSource}`,
      ...(tags === undefined ? {} : { tags }),
    });

  // --- History and canonical tool replay.
  const constructionClientTools = brunchSelected
    ? brunchPetrinautClientToolNames
    : undefined;
  const dynamicClientToolNames =
    binding === null ? undefined : brunchPetrinautClientToolNames;
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    constructionClientTools,
    dynamicClientToolNames,
  );
  const replayBindingKey = binding === null ? undefined : bindingKey(binding);
  const canonicalReplayReadiness = useImmutableReplayBaseline<
    NonNullable<typeof flueHistory.snapshot>,
    CanonicalPetrinautReplay
  >({
    bindingKey: replayBindingKey,
    emptyReplay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    historyPhase: flueHistory.phase,
    snapshot: flueHistory.snapshot,
    derive: async (snapshot) =>
      binding === null
        ? EMPTY_CANONICAL_PETRINAUT_REPLAY
        : issuedCanonicalCallsFromHistory({ snapshot }),
  }) satisfies CanonicalPetrinautReplayReadiness;
  const { settleRevision } = host;
  // Records the revision before each call and the metadata of its result, so
  // its identity is part of the protocol: kept for one handle, document
  // record, binding and replay baseline. Built from those inputs directly,
  // because the derived `binding` and `activeHandle` are fresh objects each
  // render as far as the dependency lint can tell.
  const canonicalHostTools = useMemo(() => {
    if (
      !brunchSelected ||
      baseProcessAgentBinding === null ||
      currentDocument === null ||
      handle.id !== currentDocument.documentId
    ) {
      return undefined;
    }

    return createCanonicalPetrinautHostTools({
      handle,
      binding: evaluationBinding(baseProcessAgentBinding),
      readTitle: () => currentDocument.title,
      replayReadiness: canonicalReplayReadiness,
      settleRevision,
    });
  }, [
    brunchSelected,
    baseProcessAgentBinding,
    currentDocument,
    handle,
    canonicalReplayReadiness,
    settleRevision,
  ]);
  const reportHistoryError = useEffectEvent(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  });
  useEffect(() => {
    reportHistoryError();
  }, [flueHistory.error]);

  // --- Transport, in-band browser calls and the draft-experiment tool.
  const transport =
    session === null
      ? null
      : createBrunchPanelTransport(session.client, session.tracker, {
          ...(binding === null ? {} : { initialData: { binding } }),
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
  const inBandBrowserTools =
    binding !== null && session !== null && coordinator !== null
      ? createInBandBrowserCalls({
          client: session.client,
          principalKey: brunchPrincipal,
          binding,
          metadataFor: async (toolCallId, output) =>
            canonicalHostTools?.clientToolResultMetadataFor(toolCallId, output),
          prepareInput: (call) => {
            canonicalHostTools?.mapClientToolInput(call);
          },
          admit: createBrunchMutationAdmission(coordinator),
        })
      : undefined;
  const draftInteractiveTool =
    activeHandle !== null && session !== null && inBandBrowserTools
      ? createBrunchDraftExperimentInteractiveTool({
          browserCalls: inBandBrowserTools,
          readTitle: () => activeHandle.document.title,
          readDraftAuthority: async (toolCallId) => {
            const client = await session.client;

            return resolveDraftAuthorityFromHistory(
              await client.history(),
              toolCallId,
            );
          },
        })
      : undefined;

  // --- The Ledger tab.
  const ledger =
    binding !== null && flueHistory.ready
      ? {
          binding,
          messages: flueHistory.snapshot?.messages ?? [],
          activityIdentities:
            flueHistory.phase === "absent"
              ? []
              : flueHistory.snapshot === undefined
                ? undefined
                : foldBrunchWorkpieceHistory(
                    flueHistory.snapshot.messages,
                    binding,
                  ).activityIdentities,
        }
      : null;

  // --- The chat configuration, the Ledger tab and the conversation.
  const chat: PetrinautAiAssistant | null =
    !brunchSelected || transport === null || session === null
      ? null
      : {
          primaryLabel: "Chat",
          presentation: "brunch",
          resolveToolPresentation: resolveBrunchToolPresentation,
          workingLabel: "Working…",
          renderComposerControl: (
            context: PetrinautAiComposerControlContext,
          ) => <BrunchExperimentFollowUp context={context} />,
          ...(conversationId === null ? {} : { conversationId }),
          canClearMessages: true,
          // These exact-name tools override the static registry only while a
          // document binding is attached. Every other canonical capability
          // remains on Petrinaut's registry.
          inBandBrowserTools,
          automaticTools: [...(canonicalHostTools?.tools ?? [])],
          interactiveTools: [
            ...(inBandBrowserTools ? (mutationApprovalTools ?? []) : []),
            ...(draftInteractiveTool ? [draftInteractiveTool] : []),
          ],
          transport,
          requestStop: () => requestFlueStop(session.client, session.tracker),
          followMessages: {
            // This closure and `messages` below describe the same observed
            // snapshot, never a later mutable settlement cache.
            canReplace: () =>
              session.tracker.canReplaceMessages(flueHistory.snapshot),
          },
          messages: flueHistory.messages,
          // Brunch's history lives on the server; the panel never writes it back.
          onMessages: () => {},
          onClearMessages: () => {
            if (
              incarnationId === undefined ||
              initialConversationId === undefined
            )
              return;
            const nextId = `${initialConversationId}:${crypto.randomUUID()}`;
            replaceBrunchConversationId(initialConversationId, nextId);
            setFreshConversationIds((current) => ({
              ...current,
              [incarnationId]: nextId,
            }));
          },
        };

  return {
    assistant: {
      chat,
      tabs:
        ledger === null
          ? []
          : [
              {
                id: "ledger",
                label: "Ledger",
                mark: <Icon name="bars" size="xs" />,
                activityIdentities: ledger.activityIdentities,
                content: (
                  <BrunchWorkpiecePane
                    messages={ledger.messages}
                    binding={ledger.binding}
                  />
                ),
              },
            ],
    },
    provides: {
      conversation: {
        conversation:
          session === null || conversationId === null
            ? null
            : {
                conversationId,
                tracker: session.tracker,
                settlements: flueHistory.settlements,
                snapshot: flueHistory.snapshot,
              },
      },
    },
  };
};
