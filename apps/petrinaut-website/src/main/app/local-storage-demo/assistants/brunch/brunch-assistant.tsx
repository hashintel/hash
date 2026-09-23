import {
  createFlueClient,
  type FlueConversationSettlement,
  type FlueConversationState,
} from "@flue/sdk";
import {
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { batchedConstructionMode } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_DOCUMENT_REVISION_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import {
  type PetrinautAiAssistant,
  type PetrinautAiStopResult,
  type PetrinautAiVoiceMode,
  type PetrinautAiVoiceModeContext,
  usePetrinautAiAssistant,
} from "@hashintel/petrinaut/ui";

import {
  type OpenAIVoiceConfig,
  VoiceInterviewControl,
} from "../../../voice-interview/voice-interview-control";
import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
} from "../../brunch-client-tools";
import { ordinaryConstructionConversationIdFrom } from "../../brunch-conversation-id";
import { createBrunchDraftExperimentInteractiveTool } from "../../brunch-draft-experiment-interactive-tool";
import {
  BrunchPanelConversationTracker,
  type BrunchPanelAdmissionTarget,
  createBrunchPanelTransport,
} from "../../brunch-panel-transport";
import { createBrunchPetrinautTools } from "../../brunch-petrinaut-tools";
import { resolveBrunchToolPresentation } from "../../brunch-tool-presentation";
import { foldBrunchWorkpieceHistory } from "../../brunch-workpiece-history";
import { BrunchWorkpiecePane } from "../../brunch-workpiece-pane";
import {
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
} from "../../mutation-record";
import { useFlueChatHistory } from "../../use-flue-chat-history";
import { useDemoAssistantHost } from "../demo-assistant-host";
import { brunchPreviewConfig, brunchPrincipal } from "./brunch-site-config";
import {
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
  useProcessAgentBinding,
} from "./use-process-agent-binding";

import type { ActiveHandle } from "../../active-handle";

export const brunchAssistantId = "website.brunch";

export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
  tracker?: BrunchPanelConversationTracker,
  settlements?: readonly FlueConversationSettlement[],
  snapshot?: FlueConversationState,
): PetrinautAiVoiceMode | undefined => {
  if (!config) return undefined;

  const resolveInputSubmission = tracker?.submissionForInput.bind(tracker);
  const resolveResponseSubmission =
    tracker?.submissionsForResponse.bind(tracker);
  const subscribeToResponseMessageCompleted =
    tracker?.subscribeToResponseMessageCompleted.bind(tracker);
  const subscribeToResponseMessageStarted =
    tracker?.subscribeToResponseMessageStarted.bind(tracker);
  const subscribeToStopRequested =
    tracker?.subscribeToStopRequested.bind(tracker);
  const subscribeToAdmission =
    tracker === undefined
      ? undefined
      : (target: BrunchPanelAdmissionTarget, listener: (id: string) => void) =>
          tracker.subscribeToAdmission(target, ({ admission }) =>
            listener(admission.submissionId),
          );
  const subscribeToAdmissionFailure =
    tracker?.subscribeToAdmissionFailure.bind(tracker);

  return (context: PetrinautAiVoiceModeContext) => (
    <VoiceInterviewControl
      {...context}
      config={config}
      settlements={settlements}
      // Voice only observes this snapshot. Message replacement remains gated
      // independently by followMessages.canReplace below.
      snapshot={snapshot}
      resolveInputSubmission={resolveInputSubmission}
      resolveResponseSubmission={resolveResponseSubmission}
      subscribeToResponseMessageCompleted={subscribeToResponseMessageCompleted}
      subscribeToResponseMessageStarted={subscribeToResponseMessageStarted}
      subscribeToStopRequested={subscribeToStopRequested}
      subscribeToAdmission={subscribeToAdmission}
      subscribeToAdmissionFailure={subscribeToAdmissionFailure}
    />
  );
};

const createBrunchFlueClient = async (
  conversationId: string,
  currentRevisionId: () => string | undefined,
) => {
  const identity = { conversationId, principalKey: brunchPrincipal };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(
    brunchPreviewConfig.chatEndpoint,
    window.location.origin,
  );
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => {
      const revisionId = currentRevisionId();
      return {
        ...agentOwnershipHeaders(identity),
        ...(revisionId === undefined
          ? {}
          : { [BRUNCH_DOCUMENT_REVISION_HEADER]: revisionId }),
      };
    },
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

const useProcessAgentSession = (input: {
  readonly activeHandleRef: RefObject<ActiveHandle | null>;
  readonly binding: ProcessAgentBinding | null;
}) => {
  "use no memo"; // The Flue header callback deliberately reads the live handle ref after render.

  const readCurrentRevisionId = useCallback(() => {
    const handle = input.activeHandleRef.current;
    return input.binding !== null &&
      handle?.document.documentId === input.binding.documentId &&
      handle.document.incarnationId === input.binding.incarnationId
      ? handle.handle.revisionId.get()
      : undefined;
  }, [input.activeHandleRef, input.binding]);

  return useMemo(() => {
    const conversationTracker = new BrunchPanelConversationTracker();
    const flueClientPromise =
      input.binding === null
        ? null
        : createBrunchFlueClient(
            input.binding.conversationId,
            readCurrentRevisionId,
          );
    return { conversationTracker, flueClientPromise };
  }, [input.binding, readCurrentRevisionId]);
};

/**
 * Brunch, the process-construction agent. Mounted only while Brunch is the
 * active assistant, so with the stock assistant active no Flue client is
 * created, no Brunch tools exist, and no Brunch history is read or written.
 * It passes `null` until the conversation is bound to the open document.
 */
export const BrunchAssistant = () => {
  const {
    activeHandle,
    activeHandleRef,
    document: currentDocument,
    processAgentSeed,
    settleRevision,
    voice,
  } = useDemoAssistantHost();
  const currentNetTitle = currentDocument.title;

  const productConstructionConversationId =
    ordinaryConstructionConversationIdFrom(currentDocument.incarnationId);
  const fixtureProcessAgentConfiguration =
    useMemo<FixtureProcessAgentConfiguration>(
      () => ({ conversationId: productConstructionConversationId }),
      [productConstructionConversationId],
    );
  const processAgentBinding = useProcessAgentBinding({
    document: currentDocument,
    seed: processAgentSeed,
    fixture: fixtureProcessAgentConfiguration,
  });
  const conversationId = processAgentBinding?.conversationId ?? null;
  const { conversationTracker, flueClientPromise } = useProcessAgentSession({
    activeHandleRef,
    binding: processAgentBinding,
  });
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
      processAgentBinding === null ||
      activeHandle.document.documentId !== processAgentBinding.documentId
        ? undefined
        : { binding: processAgentBinding },
    [activeHandle, processAgentBinding],
  );
  // The handle mutates behind a stable identity. Subscribe to its real snapshot;
  // a render-time read alone can be memoized by React Compiler across hand edits.
  const subscribeToObservedLiveHash = useCallback(
    (changed: () => void) =>
      constructionBrowser ? activeHandle.handle.subscribe(changed) : () => {},
    [activeHandle, constructionBrowser],
  );
  const getObservedLiveHash = useCallback(
    () =>
      constructionBrowser && activeHandle.handle.doc()
        ? observeBrowserDefinition(activeHandle.handle).sha256
        : undefined,
    [activeHandle, constructionBrowser],
  );
  const getServerObservedLiveHash = useCallback(() => undefined, []);
  const observedLiveHash = useSyncExternalStore(
    subscribeToObservedLiveHash,
    getObservedLiveHash,
    getServerObservedLiveHash,
  );
  const mutationRecorder = useMemo(
    () =>
      constructionBrowser
        ? createJoinedBrowserMutationRecorder({
            handle: activeHandle.handle,
            ...constructionBrowser,
            onContainedFailure: (failure) =>
              reportBrunchFailure("mutation-record", failure.error, {
                kind: failure.kind,
                toolCallId: failure.toolCallId,
              }),
          })
        : undefined,
    [constructionBrowser, activeHandle, reportBrunchFailure],
  );
  const constructionClientTools = batchedConstructionClientToolNames;
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    constructionClientTools,
    mutationRecorder?.mapClientToolInput,
    mutationRecorder?.validatedClientToolNames,
    brunchPetrinautDynamicToolNames,
  );
  useEffect(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  }, [flueHistory.error, flueHistory.phase, reportBrunchFailure]);
  const brunchVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        voice.ready && voice.enabled ? voice.config : null,
        conversationTracker,
        flueHistory.settlements,
        flueHistory.snapshot,
      ),
    [
      conversationTracker,
      flueHistory.settlements,
      flueHistory.snapshot,
      voice.config,
      voice.enabled,
      voice.ready,
    ],
  );
  const transport = useMemo(
    () =>
      flueClientPromise === null
        ? null
        : createBrunchPanelTransport(flueClientPromise, conversationTracker, {
            ...(constructionBrowser
              ? {
                  initialData: {
                    mode: batchedConstructionMode,
                    construction: { binding: constructionBrowser.binding },
                  },
                }
              : {}),
            dynamicClientToolNames: brunchPetrinautDynamicToolNames,
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
            clientToolNames: constructionClientTools,
            mapClientToolInput: mutationRecorder?.mapClientToolInput,
            validatedClientToolNames:
              mutationRecorder?.validatedClientToolNames,
            clientToolResultMetadata:
              mutationRecorder?.clientToolResultMetadata,
            clientToolResultOutput: mutationRecorder?.clientToolResultOutput,
            onAdmission: flueHistory.refresh,
            onToolOutputError: (event) =>
              reportBrunchFailure("server-tool", new Error(event.errorText), {
                submissionId: event.submissionId,
                toolCallId: event.toolCallId,
                toolName: event.toolName ?? "unknown",
              }),
          }),
    [
      conversationTracker,
      conversationId,
      constructionClientTools,
      constructionBrowser,
      flueClientPromise,
      flueHistory.refresh,
      reportBrunchFailure,
      mutationRecorder,
    ],
  );

  const assistant = useMemo((): PetrinautAiAssistant | null => {
    if (flueClientPromise === null || transport === null) {
      return null;
    }
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
                liveHash={observedLiveHash}
              />
            ),
          }
        : undefined,
      primaryLabel: "Chat",
      resolveToolPresentation: resolveBrunchToolPresentation,
      workingLabel: "Brunch is working",
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: false,
      // Brunch's own tool names wrap canonical Petrinaut operations here, in
      // the host; Petrinaut keeps its names and executes only what it is told.
      automaticTools: createBrunchPetrinautTools({
        readTitle: () => currentNetTitle,
        ...(constructionBrowser
          ? {
              mutation: {
                binding: constructionBrowser.binding,
                retainAttempt: mutationRecorder?.retainAttempt,
                onOperationFailure: (failure) =>
                  reportBrunchFailure("mutate-petrinet", failure.error, {
                    toolCallId: failure.toolCallId,
                    operationId: failure.operationId,
                    operationType: failure.operationType,
                    status: failure.status,
                  }),
              },
            }
          : {}),
        settleDocumentRevision: (revisionId) =>
          settleRevision({
            documentId: currentDocument.documentId,
            revisionId,
          }),
      }),
      // The drafted-experiment card is the one Brunch tool the person answers
      // in the panel: it prepares against the live model, reports "drafted",
      // and waits for Run or Dismiss. Session-only; nothing is persisted.
      interactiveTools: [
        createBrunchDraftExperimentInteractiveTool({
          readTitle: () => currentNetTitle,
        }),
      ],
      transport,
      ...(mutationRecorder === undefined
        ? {}
        : { executeMutation: mutationRecorder.executeMutation }),
      requestStop: () =>
        requestFlueStop(flueClientPromise, conversationTracker),
      followMessages: {
        // This closure and `messages` below describe the same observed
        // snapshot, never a later mutable settlement cache.
        canReplace: () =>
          conversationTracker.canReplaceMessages(flueHistory.snapshot),
      },
      messages: flueHistory.messages,
      ...(brunchVoiceMode ? { renderVoiceMode: brunchVoiceMode } : {}),
    };
  }, [
    brunchVoiceMode,
    observedLiveHash,
    constructionBrowser,
    conversationTracker,
    conversationId,
    currentDocument.documentId,
    currentNetTitle,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
    transport,
    reportBrunchFailure,
    mutationRecorder,
    settleRevision,
  ]);

  usePetrinautAiAssistant(assistant);
  return null;
};
