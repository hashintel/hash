/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable
 * state. Switching files replaces the active handle instead of keeping
 * handles alive for background nets.
 *
 * Everything assistant-related is a plugin under `../plugins`; this file
 * only decides which plugins the editor gets and provides the facts they
 * cannot read from Petrinaut.
 */

import { useCallback, useState } from "react";

import { Petrinaut, type PetrinautPlugin } from "@hashintel/petrinaut/ui";

import {
  useSharedSearchNavigation,
  withClearedSharedLocation,
} from "../../../examples/use-shared-search-navigation";
import {
  type BrunchHost,
  BrunchHostContext,
} from "../plugins/brunch/brunch-host";
import { resolveBrunchPreviewConfig } from "../plugins/brunch/brunch-preview-config";
import { brunchPlugin } from "../plugins/brunch/plugin";
import { commandPalettePlugin } from "../plugins/command-palette/plugin";
import { petrinautAiPlugin } from "../plugins/petrinaut-ai/plugin";
import { sentryFeedbackPlugin } from "../plugins/sentry-feedback/plugin";
import { voicePlugin } from "../plugins/voice/plugin";
import { walkthroughPlugin } from "../plugins/walkthrough/plugin";
import { resolveDefaultAssistant } from "./default-assistant";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { UnsavedChangeNotice } from "./unsaved-change-notice";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);
const defaultAssistant = resolveDefaultAssistant(
  import.meta.env.VITE_PETRINAUT_DEFAULT_ASSISTANT,
);

/**
 * The plugins this demo gives the editor: the chrome plugins, the welcome
 * guide, Petrinaut AI, and, when an endpoint is configured, Brunch with
 * Voice mode. The first assistant in the list is the default; User settings
 * can pick another.
 */
const selectDemoPlugins = (): readonly PetrinautPlugin[] => {
  const chrome = [
    sentryFeedbackPlugin,
    commandPalettePlugin,
    walkthroughPlugin,
  ];
  if (!brunchPreviewConfig.isBrunchConfigured) {
    return [...chrome, petrinautAiPlugin];
  }
  const assistants =
    defaultAssistant === "brunch"
      ? [brunchPlugin, petrinautAiPlugin]
      : [petrinautAiPlugin, brunchPlugin];

  return [...chrome, ...assistants, voicePlugin];
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
  // The plugin list is chosen once; what changes reaches them through context.
  const [plugins] = useState(selectDemoPlugins);
  const brunchHost: BrunchHost = {
    chatEndpoint: brunchPreviewConfig.chatEndpoint,
    document: currentDocument,
    // eslint-disable-next-line typescript/unbound-method -- repository actions do not use `this`
    settleRevision: repository.settleRevision,
  };

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
      <BrunchHostContext value={brunchHost}>
        <Petrinaut
          handle={activeHandle.handle}
          plugins={plugins}
          existingNets={existingNets}
          createNewNet={createNewNet}
          loadPetriNet={loadPetriNet}
          navigation={navigation}
          readonly={false}
          setTitle={setTitle}
          title={currentDocument.title}
        />
      </BrunchHostContext>
    </div>
  );
};
