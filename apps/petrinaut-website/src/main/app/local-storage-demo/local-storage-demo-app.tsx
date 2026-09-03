/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { produce } from "immer";
import { useEffect, useMemo, useState } from "react";

import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
import {
  createJsonDocHandle,
  type MinimalNetMetadata,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  CommandRegistryProvider,
  useCommand,
} from "@hashintel/petrinaut/react";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiMessage,
  type PetrinautAiVoiceMode,
  type PetrinautAiVoiceModeContext,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";

import { VOICE_REQUEST_ID_HEADER } from "../../../voice-diagnostics";
import { CommandPalette } from "../command-palette";
import { useSentryFeedbackAction } from "../sentry-feedback-button";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
  VoiceInterviewControl,
} from "../voice-interview/voice-interview-control";
import { brunchAskInteractiveTool } from "./brunch-ask-interactive-tool";
import { getOrCreateBrunchConversationId } from "./brunch-conversation-id";
import { createBrunchPanelTransport } from "./brunch-panel-transport";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "./brunch-principal";
import { useFlueChatHistory } from "./use-flue-chat-history";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import {
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./use-local-storage-sdcpns";
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
}): SDCPNInLocalStorage => {
  const now = new Date();

  return {
    id: `net-${now.getTime()}`,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
  };
};

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

// Only Brunch keeps a conversation to hydrate from; the generic fallback route
// has no history door.
const brunchHistoryEndpoint = brunchPreviewConfig.isBrunchConfigured
  ? brunchPreviewConfig.chatEndpoint
  : null;

export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
): PetrinautAiVoiceMode | undefined =>
  config
    ? (context: PetrinautAiVoiceModeContext) => (
        <VoiceInterviewControl {...context} config={config} />
      )
    : undefined;

const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>
  createJsonDocHandle({
    id: net.id,
    initial: net.sdcpn,
    capabilities: DEMO_CAPABILITIES,
  });

const brunchPrincipal = getOrCreateBrunchPrincipal();

const stockChatTransport = new DefaultChatTransport({
  api: brunchPreviewConfig.chatEndpoint,
  headers: () => ({
    [BRUNCH_PRINCIPAL_HEADER]: brunchPrincipal,
    [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID(),
  }),
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
 * The demo's own palette command, registered beside Petrinaut's: picking it
 * in the palette starts a fresh net.
 */
const DemoCommands = ({
  createNewNet,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
}) => {
  useCommand({
    id: "demo.net.new",
    label: "Create a new empty net",
    category: "Demo",
    keywords: ["file"],
    run: () =>
      createNewNet({ petriNetDefinition: emptySDCPN, title: "New Process" }),
  });
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
export const LocalStorageDemoApp = () => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const [openAIVoiceConfig, setOpenAIVoiceConfig] =
    useState<OpenAIVoiceConfig | null>();
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();
  const storedSDCPNsForDisplay = getStoredSDCPNsForDisplay(storedSDCPNs);

  useEffect(() => {
    if (!brunchPreviewConfig.isBrunchConfigured) {
      // eslint-disable-next-line react-hooks-js/set-state-in-effect -- Resolve the loading sentinel when voice is not configured.
      setOpenAIVoiceConfig(null);
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
  }, []);

  const brunchVoiceMode = useMemo(
    () => getBrunchVoiceMode(openAIVoiceConfig),
    [openAIVoiceConfig],
  );

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
  };

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

  const conversationId = currentNetId
    ? getOrCreateBrunchConversationId(currentNetId)
    : null;
  const flueHistory = useFlueChatHistory(
    brunchHistoryEndpoint,
    conversationId ?? "",
    brunchPrincipal,
  );
  const petrinautAiChatTransport = useMemo(
    () =>
      conversationId === null
        ? createBrunchPanelTransport(stockChatTransport, "")
        : createBrunchPanelTransport(stockChatTransport, conversationId),
    [conversationId],
  );

  const aiAssistant = useMemo(
    () => ({
      ...(conversationId === null ? {} : { conversationId }),
      interactiveTools: [brunchAskInteractiveTool],
      transport: petrinautAiChatTransport,
      messages: flueHistory.ready
        ? flueHistory.messages
        : currentNetId
          ? aiMessagesByNetId[currentNetId]
          : undefined,
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
      ...(brunchVoiceMode
        ? {
            renderVoiceMode: brunchVoiceMode,
          }
        : {}),
    }),
    [
      aiMessagesByNetId,
      brunchVoiceMode,
      conversationId,
      currentNetId,
      flueHistory.messages,
      flueHistory.ready,
      petrinautAiChatTransport,
      setAiMessagesByNetId,
    ],
  );

  if (!currentNet) {
    return null;
  }

  if (!activeHandle || activeHandle.netId !== currentNet.id) {
    return null;
  }

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <CommandRegistryProvider>
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
        </WalkthroughProvider>
        <DemoCommands createNewNet={createNewNet} />
        <CommandPalette />
      </CommandRegistryProvider>
    </div>
  );
};
