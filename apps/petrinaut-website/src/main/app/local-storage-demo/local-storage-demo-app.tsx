/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable
 * state. Switching files replaces the active handle instead of keeping
 * handles alive for background nets.
 *
 * Everything assistant-related is a plugin under `../assistants`; this file
 * only decides which plugins to install and hands them the document facts
 * they cannot read from Petrinaut.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createReadableStore,
  type MinimalNetMetadata,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  CommandRegistryProvider,
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
import { createBrunchPlugin } from "../assistants/brunch";
import { resolveBrunchPreviewConfig } from "../assistants/brunch/brunch-preview-config";
import { resolveDefaultAssistant } from "../assistants/default-assistant";
import { createStockPlugin } from "../assistants/stock";
import { createVoicePlugin, loadVoiceConfigFromApi } from "../assistants/voice";
import { commandPalettePlugin } from "../command-palette";
import { sentryFeedbackPlugin } from "../sentry-feedback-plugin";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { UnsavedChangeNotice } from "./unsaved-change-notice";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type {
  DocumentRecord,
  DocumentRepository,
} from "./documents/document-repository";

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);
const defaultAssistant = resolveDefaultAssistant(
  import.meta.env.VITE_PETRINAUT_DEFAULT_ASSISTANT,
);

/**
 * The repository's `settleRevision` behind a stable function, so plugins
 * built once keep dispatching to the latest repository.
 */
const useCurrentSettlementAction = (
  settleRevision: DocumentRepository["settleRevision"],
): DocumentRepository["settleRevision"] => {
  const latest = useRef(settleRevision);
  useLayoutEffect(() => {
    latest.current = settleRevision;
  }, [settleRevision]);
  return useCallback((revision) => latest.current(revision), []);
};

/**
 * The plugins this demo installs, built once: the chrome plugins, the stock
 * assistant, and, when an endpoint is configured, Brunch with Voice mode. The
 * first assistant in the list is the default; User settings can pick another.
 */
const useDemoPlugins = (
  repository: DocumentRepository,
): readonly PetrinautPlugin[] => {
  // Plugins outlive documents, so they read the open record from a store.
  const [documentStore] = useState(() =>
    createReadableStore<DocumentRecord | null>(null),
  );
  const currentDocument = repository.current;
  useLayoutEffect(() => {
    documentStore.set(currentDocument);
  }, [documentStore, currentDocument]);
  const settleRevision = useCurrentSettlementAction(
    // eslint-disable-next-line typescript/unbound-method -- repository actions do not use `this`
    repository.settleRevision,
  );

  return useMemo(() => {
    const stock = createStockPlugin();
    if (!brunchPreviewConfig.isBrunchConfigured) {
      return [sentryFeedbackPlugin, commandPalettePlugin, stock];
    }
    const brunch = createBrunchPlugin({
      chatEndpoint: brunchPreviewConfig.chatEndpoint,
      document: documentStore,
      settleRevision,
    });
    const voice = createVoicePlugin({ loadConfig: loadVoiceConfigFromApi });
    const assistants =
      defaultAssistant === "brunch" ? [brunch, stock] : [stock, brunch];
    return [sentryFeedbackPlugin, commandPalettePlugin, ...assistants, voice];
  }, [documentStore, settleRevision]);
};

export const LocalStorageDemoApp = ({
  onSearchChange,
  search,
}: {
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
}) => {
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

  // Documents: the repository of saved nets and the live handle of the open one.
  const { controller } = useDocumentController({
    onOpenDocument: clearSharedLocation,
  });
  const { repository } = controller;
  const currentDocument = repository.current;
  const { activeHandle, unsavedChangeMessage } = useActiveHandle(repository);
  const plugins = useDemoPlugins(repository);

  // Net management, as Petrinaut's File menu sees it.
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

  if (
    repository.status.state === "loading" ||
    currentDocument === null ||
    !activeHandle ||
    activeHandle.document.documentId !== currentDocument.documentId
  ) {
    return <p>Loading document…</p>;
  }

  return (
    <div style={{ height: "100vh", position: "relative", width: "100vw" }}>
      {unsavedChangeMessage !== null && (
        <UnsavedChangeNotice message={unsavedChangeMessage} />
      )}
      {/* Settings and commands are mounted above the editor so the plugins'
          roots, which live beside it, read the same instances it does. */}
      <UserSettingsProvider>
        <CommandRegistryProvider>
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
        </CommandRegistryProvider>
      </UserSettingsProvider>
    </div>
  );
};
