/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import {
  Petrinaut,
  type PetrinautPlugin,
  PetrinautPluginsProvider,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";

import {
  useSharedSearchNavigation,
  withClearedSharedLocation,
} from "../../../examples/use-shared-search-navigation";
import { sentryFeedbackPlugin } from "../../../sentry/sentry-feedback-plugin";
import { commandPalettePlugin } from "../command-palette";
import {
  type AssistantSelection,
  assistantSelectionStorageKey,
  parseAssistantSelection,
} from "./assistant-selection";
import { brunchAssistantPlugin } from "./assistants/brunch/brunch-assistant-plugin";
import {
  brunchPreviewConfig,
  brunchPrincipal,
} from "./assistants/brunch/brunch-site-config";
import {
  type DemoAssistantHost,
  DemoAssistantHostContext,
} from "./assistants/demo-assistant-host";
import { stockAssistantPlugin } from "./assistants/stock/stock-assistant-plugin";
import { readBrowserStorage } from "./browser-storage";
import { useDocumentController } from "./documents/use-document-controller";
import { localStorageDemoRouteIdentity } from "./local-storage-demo-search";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import { emptySDCPN } from "./use-local-storage-sdcpns";
import { useVoicePreference } from "./voice-preference";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { OpenAIVoiceConfig } from "../voice-interview/voice-interview-control";
import type { ActiveHandle } from "./active-handle";
import type { DocumentRecord } from "./documents/document-repository";
import type { LocalStorageDemoSearch } from "./local-storage-demo-search";

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

// The demo's plugins: a feedback button under the zoom controls and the ⌘K
// palette with its top-bar button. The editor's built-ins stay installed.
const demoPlugins = [sentryFeedbackPlugin, commandPalettePlugin];

/**
 * The assistants each route offers, as plugins. Stock is the default and
 * Brunch the alternate where a Brunch endpoint is configured; the first is
 * active until the user chooses in User settings. A remote worked-model
 * document is Brunch's alone.
 */
const assistantPlugins = {
  stockOnly: [stockAssistantPlugin, ...demoPlugins],
  stockFirst: [stockAssistantPlugin, brunchAssistantPlugin, ...demoPlugins],
  brunchFirst: [brunchAssistantPlugin, stockAssistantPlugin, ...demoPlugins],
  brunchOnly: [brunchAssistantPlugin, ...demoPlugins],
} satisfies Record<string, readonly PetrinautPlugin[]>;

const readLegacyAssistantChoice = (): AssistantSelection =>
  parseAssistantSelection(
    readBrowserStorage(localStorage, assistantSelectionStorageKey),
  );

const createHandle = (document: DocumentRecord): PetrinautDocHandle =>
  createJsonDocHandle({
    id: document.documentId,
    initial: document.definition,
    initialRevisionId: document.revisionId,
    capabilities: DEMO_CAPABILITIES,
  });

type PersistFailure = {
  /** The handle whose change was refused; it is replaced, not kept. */
  handle: PetrinautDocHandle;
  documentId: DocumentRecord["documentId"];
  incarnationId: DocumentRecord["incarnationId"];
  error: Error;
};

const createActiveHandle = (document: DocumentRecord): ActiveHandle => {
  const handle = createHandle(document);
  return {
    handle,
    document,
    emittedRevisionIds: new Set([document.revisionId]),
  };
};

/**
 * The demo's own palette commands, registered beside Petrinaut's: one starts
 * a fresh net, and one projects a worked-model template into a fresh net.
 */
const DemoCommands = ({
  createNewNet,
  createCleanNetProjection,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  createCleanNetProjection?: () => Promise<void>;
}) => {
  useCommand({
    id: "demo.net.new",
    label: "Create a new empty net",
    category: "Demo",
    keywords: ["file"],
    run: () =>
      createNewNet({ petriNetDefinition: emptySDCPN, title: "New Process" }),
  });
  useCommand(
    {
      id: "demo.worked-model.fresh-net-projection",
      label: "Create a fresh net projection from this template",
      category: "Demo",
      keywords: ["fresh", "net", "projection", "template"],
      run: () => {
        void createCleanNetProjection?.();
      },
    },
    { when: createCleanNetProjection !== undefined },
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
  onSearchChange,
  search,
}: {
  onSearchChange: (
    search: LocalStorageDemoSearch,
    history: "push" | "replace",
  ) => void;
  search: LocalStorageDemoSearch;
}) => {
  const routeIdentity = localStorageDemoRouteIdentity(search);
  const remoteRouteSelected =
    routeIdentity === "worked-model-bundle" && search.bundle !== undefined;
  // Which assistant comes first, and so is active until the user chooses in
  // User settings: this site's earlier browser-local choice, else the build's
  // default. Read once, the first time a local route renders.
  const [defaultAssistant, setDefaultAssistant] =
    useState<AssistantSelection | null>(() =>
      remoteRouteSelected ? null : readLegacyAssistantChoice(),
    );
  if (!remoteRouteSelected && defaultAssistant === null) {
    setDefaultAssistant(readLegacyAssistantChoice());
  }
  const plugins = remoteRouteSelected
    ? brunchPreviewConfig.isBrunchConfigured
      ? assistantPlugins.brunchOnly
      : assistantPlugins.stockOnly
    : !brunchPreviewConfig.isBrunchConfigured
      ? assistantPlugins.stockOnly
      : defaultAssistant === "brunch"
        ? assistantPlugins.brunchFirst
        : assistantPlugins.stockFirst;
  const {
    enabled: voiceEnabled,
    ready: voicePreferenceReady,
    setEnabled: setVoiceEnabled,
  } = useVoicePreference();
  // Brunch's assistant checks whether this deployment offers Voice while it is
  // active; its Labs group reads the answer here.
  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  /**
   * History is left to the library's default on purpose. That default already
   * replaces rather than pushes while an intent continues, so a drag-select
   * records one entry instead of one per intermediate selection, and a discrete
   * click is the only thing that pushes. Making selections replace as well
   * removed every entry this page can produce, which left the first Back press
   * leaving the site instead of retracing the net.
   */
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  /**
   * The location belongs to the net that was open. Petrinaut resets its own
   * location per document by keying on the handle id, but that only resets an
   * uncontrolled location, so the host clears this one.
   *
   * Cleared through the controller rather than by writing an empty search: the
   * shared projection is lossy, so a location the URL already renders as empty
   * leaves the search prop unchanged and the in-memory selection would survive
   * into the next net.
   */
  const clearSharedLocation = useCallback(() => {
    navigation.onNavigate(withClearedSharedLocation, {
      history: "replace",
      intent: { cause: "normalization", action: "selection" },
    });
  }, [navigation]);
  const { aiMessagesByNetId, setAiMessagesByNetId } = useLocalStorageAiMessages(
    { enabled: !remoteRouteSelected },
  );
  const selectLocalRoute = useCallback(
    () =>
      onSearchChange(
        {
          bundle: undefined,
        },
        "push",
      ),
    [onSearchChange],
  );
  const { controller } = useDocumentController({
    bundleKey: search.bundle,
    chatEndpoint: brunchPreviewConfig.chatEndpoint,
    currentOrigin: window.location.origin,
    isBrunchConfigured: brunchPreviewConfig.isBrunchConfigured,
    principalKey: brunchPrincipal,
    remoteRouteSelected,
    onOpenDocument: clearSharedLocation,
    onSelectLocalRoute: selectLocalRoute,
  });
  const { source } = controller;
  const currentDocument = source.repository.current;

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(null);
  const activeHandleRef = useRef<ActiveHandle | null>(null);

  useLayoutEffect(() => {
    activeHandleRef.current = activeHandle;
  }, [activeHandle]);

  // The most recent change the repository refused to persist, if any. It is
  // about the open document: cleared once a later change to that document
  // lands, or when another document is opened in its place.
  const [persistFailure, setPersistFailure] = useState<PersistFailure | null>(
    null,
  );

  // The handle follows the repository: it is recreated from the repository's
  // record whenever the two diverge — the record shows a revision this handle
  // never emitted (another tab wrote it), or the repository refused one of
  // this handle's changes, after which every further change from it would be
  // refused too, because each names the rejected revision as predecessor.
  useEffect(() => {
    if (currentDocument === null) {
      // eslint-disable-next-line react-hooks-js/set-state-in-effect -- repository selection synchronizes the selected document handle
      setActiveHandle(null);
      return;
    }
    setActiveHandle((previous) =>
      previous?.document.documentId === currentDocument.documentId &&
      previous.document.incarnationId === currentDocument.incarnationId &&
      previous.emittedRevisionIds.has(currentDocument.revisionId) &&
      persistFailure?.handle !== previous.handle
        ? previous
        : createActiveHandle(currentDocument),
    );
    setPersistFailure((failure) =>
      failure !== null &&
      (failure.documentId !== currentDocument.documentId ||
        failure.incarnationId !== currentDocument.incarnationId)
        ? null
        : failure,
    );
  }, [currentDocument, persistFailure]);

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { document, emittedRevisionIds, handle } = activeHandle;
    const repository = source.repository;
    return handle.subscribe((event) => {
      emittedRevisionIds.add(event.revisionId);
      repository
        .persistRevision({
          documentId: document.documentId,
          incarnationId: document.incarnationId,
          definition: event.next,
          previousRevisionId: event.previousRevisionId,
          revisionId: event.revisionId,
        })
        .then(
          () =>
            setPersistFailure((failure) =>
              failure?.documentId === document.documentId &&
              failure.incarnationId === document.incarnationId
                ? null
                : failure,
            ),
          (error: unknown) =>
            setPersistFailure({
              handle,
              documentId: document.documentId,
              incarnationId: document.incarnationId,
              error: error instanceof Error ? error : new Error(String(error)),
            }),
        );
    });
  }, [activeHandle, source.repository]);
  const unsavedChangeMessage =
    persistFailure !== null &&
    persistFailure.documentId === currentDocument?.documentId &&
    persistFailure.incarnationId === currentDocument.incarnationId
      ? persistFailure.error.message
      : null;

  const existingNets: MinimalNetMetadata[] = source.repository.records
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
    controller.createLocalAndOpen({
      definition: params.petriNetDefinition,
      title: params.title,
    });

  const loadPetriNet = (petriNetId: string) => {
    source.repository.open(petriNetId);
  };

  const renameCurrentDocument = source.repository.actions.rename;
  const setTitle =
    currentDocument === null || renameCurrentDocument === undefined
      ? undefined
      : (title: string) =>
          renameCurrentDocument({
            documentId: currentDocument.documentId,
            title,
          });
  const { repository } = source;
  const settleRevision = useCallback<DemoAssistantHost["settleRevision"]>(
    (input) => repository.settleRevision(input),
    [repository],
  );
  const processAgentSeed = source.processAgentSeed;
  // What the assistant plugins read. Absent until the open document has its
  // live handle, which is also when the editor renders.
  const assistantHost = useMemo((): DemoAssistantHost | null => {
    if (
      currentDocument === null ||
      activeHandle === null ||
      activeHandle.document.documentId !== currentDocument.documentId
    ) {
      return null;
    }
    return {
      activeHandle,
      activeHandleRef,
      document: currentDocument,
      processAgentSeed,
      settleRevision,
      stockMessages: {
        byNetId: aiMessagesByNetId,
        setByNetId: setAiMessagesByNetId,
      },
      voice: {
        enabled: voiceEnabled,
        ready: voicePreferenceReady,
        setEnabled: setVoiceEnabled,
        config: openAIVoiceConfig,
        setConfig: setOpenAIVoiceConfig,
      },
    };
  }, [
    activeHandle,
    aiMessagesByNetId,
    currentDocument,
    openAIVoiceConfig,
    processAgentSeed,
    setAiMessagesByNetId,
    setVoiceEnabled,
    settleRevision,
    voiceEnabled,
    voicePreferenceReady,
  ]);

  if (source.repository.status.state === "unavailable") {
    return (
      <main role="main">
        <h1>Worked-model document unavailable</h1>
        <p>{source.repository.status.error.message}</p>
      </main>
    );
  }

  if (
    source.repository.status.state === "loading" ||
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
      {remoteRouteSelected || unsavedChangeMessage !== null ? (
        // Host notices are centred below Petrinaut's 64px top bar and stacked
        // above its side panels (z-index 1097) and bar (1100), so neither can
        // hide them.
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 14,
            gap: 8,
            left: "50%",
            maxWidth: "calc(100vw - 32px)",
            pointerEvents: "none",
            position: "fixed",
            top: 80,
            transform: "translateX(-50%)",
            zIndex: 1200,
          }}
        >
          {remoteRouteSelected ? (
            <p
              style={{
                background: "#edf6ff",
                border: "1px solid #91caff",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
                color: "#0958d9",
                margin: 0,
                padding: "10px 12px",
              }}
            >
              This document uses the Brunch process assistant
            </p>
          ) : null}
          {unsavedChangeMessage !== null ? (
            <p
              role="alert"
              style={{
                background: "#fff1f0",
                border: "1px solid #ffa39e",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
                color: "#a8071a",
                margin: 0,
                padding: "10px 12px",
              }}
            >
              Changes not saved: {unsavedChangeMessage} The editor shows the
              last saved version.
            </p>
          ) : null}
        </div>
      ) : null}
      {/* The settings are mounted here, above the editor, so the demo's own
          commands read the same persisted state the editor does. */}
      <UserSettingsProvider>
        <CommandRegistryProvider>
          <DemoAssistantHostContext value={assistantHost}>
            <PetrinautPluginsProvider plugins={plugins}>
              <WalkthroughProvider steps={walkthroughSteps}>
                <Petrinaut
                  handle={activeHandle.handle}
                  existingNets={existingNets}
                  createNewNet={createNewNet}
                  loadPetriNet={loadPetriNet}
                  navigation={navigation}
                  readonly={false}
                  setTitle={setTitle}
                  title={currentDocument.title}
                />
              </WalkthroughProvider>
            </PetrinautPluginsProvider>
          </DemoAssistantHostContext>
          <DemoCommands
            createNewNet={createNewNet}
            createCleanNetProjection={
              source.repository.actions.createCleanNetProjection
            }
          />
        </CommandRegistryProvider>
      </UserSettingsProvider>
    </div>
  );
};
