import { produce } from "immer";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createJsonDocHandle,
  isSDCPNEqual,
  type MinimalNetMetadata,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiChatTransport,
  type PetrinautAiMessage,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";

import { useSentryFeedbackAction } from "../sentry-feedback-button";
import { brunchAskInteractiveTool } from "./brunch-ask-interactive-tool";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import {
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./use-local-storage-sdcpns";
import { VoiceExperiment } from "./voice-experiment";
import { createElevenLabsAdapter } from "./voice-experiment/elevenlabs-adapter";
import {
  createMockInterviewDraft,
  createMockInterviewProjection,
  type FinalizeInterviewInput,
  type InterviewDraftResult,
} from "./voice-experiment/interview-draft";
import { createOpenAIRealtimeAdapter } from "./voice-experiment/openai-realtime-adapter";
import { getVoiceExperimentSelection } from "./voice-experiment/voice-experiment-selection";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0 &&
  (sdcpn.subnets ?? []).length === 0 &&
  (sdcpn.componentInstances ?? []).length === 0 &&
  (sdcpn.scenarios ?? []).length === 0 &&
  (sdcpn.metrics ?? []).length === 0;

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const createDefaultStoredSDCPN = (): SDCPNInLocalStorage => ({
  id: "net-1",
  title: "New Process",
  sdcpn: emptySDCPN,
  lastUpdated: new Date(0).toISOString(),
});

/**
 * Creates the localStorage record for a newly created net, keeping the generated
 * id and last-updated timestamp in sync.
 */
const createLocalStorageNetRecord = (params: {
  petriNetDefinition: SDCPN;
  title: string;
  voiceInterview?: SDCPNInLocalStorage["voiceInterview"];
}): SDCPNInLocalStorage => {
  const now = new Date();

  return {
    id: `net-${now.getTime()}`,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
    ...(params.voiceInterview ? { voiceInterview: params.voiceInterview } : {}),
  };
};

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>
  createJsonDocHandle({
    id: net.id,
    initial: net.sdcpn,
    capabilities: DEMO_CAPABILITIES,
  });

const petrinautAiChatTransport: PetrinautAiChatTransport =
  new DefaultChatTransport({
    api: "/api/chat",
  });

const getStoredSDCPNsForDisplay = (
  storedSDCPNs: Record<string, SDCPNInLocalStorage>,
): Record<string, SDCPNInLocalStorage> => {
  if (Object.values(storedSDCPNs).length > 0) {
    return storedSDCPNs;
  }

  const defaultStoredSDCPN = createDefaultStoredSDCPN();
  return { [defaultStoredSDCPN.id]: defaultStoredSDCPN };
};

type ActiveHandle = {
  handle: PetrinautDocHandle;
  netId: string;
  fallbackNet: SDCPNInLocalStorage;
};

const createActiveHandle = (net: SDCPNInLocalStorage): ActiveHandle => ({
  handle: createHandle(net),
  netId: net.id,
  fallbackNet: net,
});

/**
 * Local-storage demo shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets.
 */
export const LocalStorageDemoApp = () => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const voiceExperiment = getVoiceExperimentSelection(window.location);
  const [voiceConversationId] = useState(() => crypto.randomUUID());
  const lastVoiceProjectionRevisionRef = useRef(0);
  const voiceDraftEditedRef = useRef(false);
  const voiceDraftNetIdRef = useRef<string | null>(null);
  const voiceProvider = voiceExperiment?.provider;
  const voiceElicitor = voiceExperiment?.elicitor;
  const voiceExperimentAdapter = useMemo(() => {
    if (voiceProvider === "openai" && voiceElicitor) {
      return createOpenAIRealtimeAdapter({
        conversationId: voiceConversationId,
        elicitor: voiceElicitor,
      });
    }
    if (voiceProvider === "elevenlabs" && voiceElicitor === "brunch") {
      return createElevenLabsAdapter();
    }
    return undefined;
  }, [voiceConversationId, voiceElicitor, voiceProvider]);
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();
  const storedSDCPNsForDisplay = getStoredSDCPNsForDisplay(storedSDCPNs);

  // Pick the most recently modified net
  const mostRecentlyModifiedNet =
    Object.values(storedSDCPNsForDisplay).sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    )[0] ?? null;

  // The net currently selected in the UI.
  const [currentNetId, setCurrentNetId] = useState<string | null>(
    () => mostRecentlyModifiedNet?.id ?? null,
  );

  // Metadata and persisted SDCPN snapshot for the selected net.
  const currentNet = currentNetId
    ? (storedSDCPNsForDisplay[currentNetId] ?? null)
    : null;

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(() =>
    mostRecentlyModifiedNet
      ? createActiveHandle(mostRecentlyModifiedNet)
      : null,
  );

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { fallbackNet, handle, netId } = activeHandle;

    return handle.subscribe((event) => {
      const lastUpdated = new Date().toISOString();
      if (
        netId === voiceDraftNetIdRef.current &&
        !isSDCPNEqual(event.next, fallbackNet.sdcpn)
      ) {
        voiceDraftEditedRef.current = true;
      }

      setStoredSDCPNs((prev) => {
        const stored = prev[netId] ?? fallbackNet;

        return produce(prev, (draft) => {
          draft[netId] = {
            ...stored,
            sdcpn: event.next,
            lastUpdated,
          };
        });
      });
    });
  }, [activeHandle, setStoredSDCPNs]);

  const existingNets: MinimalNetMetadata[] = Object.values(storedSDCPNs)
    .map((net) => ({
      netId: net.id,
      title: net.title,
      lastUpdated: net.lastUpdated,
    }))
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );

  const createNewNet = (params: {
    petriNetDefinition: SDCPN;
    title: string;
    voiceInterview?: SDCPNInLocalStorage["voiceInterview"];
  }) => {
    const newNet = createLocalStorageNetRecord(params);
    const previousNet =
      currentNetId && currentNetId !== newNet.id ? currentNet : null;
    const previousNetIdToRemove = previousNet !== null ? currentNetId : null;

    setStoredSDCPNs((prev) => {
      const next = { ...prev, [newNet.id]: newNet };

      // Remove the previous net if it was empty and unmodified
      if (
        previousNetIdToRemove &&
        previousNet &&
        isEmptySDCPN(prev[previousNetIdToRemove]?.sdcpn ?? previousNet.sdcpn)
      ) {
        delete next[previousNetIdToRemove];
      }

      return next;
    });
    setActiveHandle(createActiveHandle(newNet));
    setCurrentNetId(newNet.id);
    return newNet.id;
  };

  const applyVoiceProjection = (result: InterviewDraftResult): boolean => {
    if (result.revision <= lastVoiceProjectionRevisionRef.current) {
      return false;
    }
    lastVoiceProjectionRevisionRef.current = result.revision;
    const voiceInterview: NonNullable<SDCPNInLocalStorage["voiceInterview"]> = {
      conversationId: result.conversationId,
      revision: result.revision,
      source: result.source,
      transcript: result.transcript,
      warnings: result.warnings,
    };
    const voiceDraftNetId = voiceDraftNetIdRef.current;
    if (!voiceDraftNetId) {
      voiceDraftNetIdRef.current = createNewNet({
        petriNetDefinition: result.petriNetDefinition,
        title: result.title,
        voiceInterview,
      });
      return true;
    }
    if (voiceDraftEditedRef.current) {
      setStoredSDCPNs((previous) => {
        const existingDraft = previous[voiceDraftNetId];
        return existingDraft
          ? {
              ...previous,
              [voiceDraftNetId]: {
                ...existingDraft,
                lastUpdated: new Date().toISOString(),
                voiceInterview: {
                  ...voiceInterview,
                  warnings: [
                    ...voiceInterview.warnings,
                    "A newer projection was not applied because the draft was manually edited.",
                  ],
                },
              },
            }
          : previous;
      });
      return false;
    }

    const updatedNet: SDCPNInLocalStorage = {
      id: voiceDraftNetId,
      lastUpdated: new Date().toISOString(),
      sdcpn: result.petriNetDefinition,
      title: result.title,
      voiceInterview,
    };
    setStoredSDCPNs((previous) => ({
      ...previous,
      [voiceDraftNetId]: updatedNet,
    }));
    if (currentNetId === voiceDraftNetId) {
      setActiveHandle(createActiveHandle(updatedNet));
    }
    return true;
  };

  const projectVoiceInterview =
    voiceExperiment?.projector === "mock"
      ? (input: FinalizeInterviewInput): boolean => {
          const result = createMockInterviewProjection(input);
          return result ? applyVoiceProjection(result) : false;
        }
      : undefined;

  const finalizeVoiceInterview =
    voiceExperiment?.projector === "mock"
      ? (input: FinalizeInterviewInput) => {
          const result = createMockInterviewDraft(input);
          applyVoiceProjection(result);
        }
      : undefined;

  const loadPetriNet = (petriNetId: string) => {
    const netToLoad = storedSDCPNsForDisplay[petriNetId];
    if (!netToLoad) {
      return;
    }

    // Remove the current net if it was empty and unmodified
    if (currentNetId && currentNetId !== petriNetId) {
      const previousNetIdToRemove =
        currentNet && isEmptySDCPN(currentNet.sdcpn) ? currentNetId : null;

      setStoredSDCPNs((prev) => {
        const prevNet = previousNetIdToRemove
          ? prev[previousNetIdToRemove]
          : null;

        if (previousNetIdToRemove && prevNet && isEmptySDCPN(prevNet.sdcpn)) {
          const next = { ...prev };
          delete next[previousNetIdToRemove];
          return next;
        }
        return prev;
      });
    }
    setActiveHandle(createActiveHandle(netToLoad));
    setCurrentNetId(petriNetId);
  };

  const setTitle = (title: string) => {
    if (!currentNetId || !currentNet) {
      return;
    }

    const lastUpdated = new Date().toISOString();

    setStoredSDCPNs((prev) =>
      produce(prev, (draft) => {
        draft[currentNetId] = {
          ...(draft[currentNetId] ?? currentNet),
          title,
          lastUpdated,
        };
      }),
    );
  };

  const aiAssistant = useMemo(
    () => ({
      interactiveTools: [brunchAskInteractiveTool],
      transport: petrinautAiChatTransport,
      messages: currentNetId ? aiMessagesByNetId[currentNetId] : undefined,
      onMessages: (messages: PetrinautAiMessage[]) => {
        if (!currentNetId) {
          return;
        }

        setAiMessagesByNetId((prev) => ({
          ...prev,
          [currentNetId]: messages,
        }));
      },
      onClearMessages: () => {
        if (!currentNetId) {
          return;
        }

        setAiMessagesByNetId((prev) => {
          const next = { ...prev };
          delete next[currentNetId];
          return next;
        });
      },
    }),
    [aiMessagesByNetId, currentNetId, setAiMessagesByNetId],
  );

  if (!currentNet) {
    return null;
  }

  if (!activeHandle || activeHandle.netId !== currentNet.id) {
    return null;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <WalkthroughProvider steps={walkthroughSteps}>
        <Petrinaut
          aiAssistant={aiAssistant}
          handle={activeHandle.handle}
          existingNets={existingNets}
          createNewNet={createNewNet}
          loadPetriNet={loadPetriNet}
          readonly={false}
          setTitle={setTitle}
          title={currentNet.title}
          viewportActions={[sentryFeedbackAction]}
        />
        {voiceExperiment ? (
          <VoiceExperiment
            adapter={voiceExperimentAdapter}
            conversationId={voiceConversationId}
            experiment={voiceExperiment}
            onFinalize={finalizeVoiceInterview}
            onProject={projectVoiceInterview}
          />
        ) : null}
      </WalkthroughProvider>
    </div>
  );
};
