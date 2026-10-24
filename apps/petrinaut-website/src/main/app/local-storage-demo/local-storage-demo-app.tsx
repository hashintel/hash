/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { type ComponentProps, use, useMemo, useState } from "react";

import {
  CommandRegistryProvider,
  UserSettingsContext,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import { pickAssistant } from "@hashintel/petrinaut/ui/plugin";

import { useSharedSearchNavigation } from "../../../examples/use-shared-search-navigation";
import { StatusPage } from "../../../shared/status-page";
import {
  BrunchAssistantContext,
  brunchPlugin,
} from "../plugins/brunch/editor-api-plugin";
import {
  brunchPreviewConfig,
  useBrunchAssistant,
} from "../plugins/brunch/use-brunch-assistant";
import { demoPlugins } from "../plugins/demo-plugins";
import { petrinautAiPlugin } from "../plugins/petrinaut-ai/plugin";
import { AssistantLabsSettings } from "./assistant-labs-settings";
import { readAssistantSelection } from "./assistant-selection";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { useInterviewBudgetPreference } from "./interview-budget-preference";
import { UnsavedChangeNotice } from "./unsaved-change-notice";
import { useRealtimePreference, useVoicePreference } from "./voice-preference";
import { useWordsPreference } from "./words-preference";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

/**
 * The editor's plugins, with Petrinaut AI and, once configured, Brunch.
 * Petrinaut shows the first assistant until the user chooses one, so the
 * saved or default selection goes first.
 */
const editorPlugins = () => {
  if (!brunchPreviewConfig.isBrunchConfigured) {
    return [...demoPlugins, petrinautAiPlugin];
  }
  return readAssistantSelection() === "brunch"
    ? [...demoPlugins, brunchPlugin, petrinautAiPlugin]
    : [...demoPlugins, petrinautAiPlugin, brunchPlugin];
};

const LocalStorageDemoEditor = ({
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
  const {
    level: interviewBudgetLevel,
    setLevel: setInterviewBudgetLevel,
    enabled: interviewBudgetEnabled,
    setEnabled: setInterviewBudgetEnabled,
    ready: interviewBudgetPreferenceReady,
  } = useInterviewBudgetPreference();
  const {
    enabled: wordsEnabled,
    ready: wordsPreferenceReady,
    setEnabled: setWordsEnabled,
  } = useWordsPreference();
  const [plugins] = useState(editorPlugins);
  const { assistantPluginId, disabledPluginIds } = use(UserSettingsContext);
  // Brunch connects only while the editor shows its assistant.
  const brunchActive =
    pickAssistant(
      plugins.filter(
        ({ manifest }) =>
          manifest.assistant === true &&
          !disabledPluginIds.includes(manifest.id),
      ),
      assistantPluginId,
    ) === brunchPlugin;
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
  const { controller } = useDocumentController({
    documentId: netId,
    onOpenDocument: onOpenNet,
  });
  const { repository } = controller;
  const currentDocument = repository.current;
  const currentNetId = currentDocument?.documentId ?? null;

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

  const [createRefusal, setCreateRefusal] = useState<string | null>(null);
  // A refusal belongs to the net it was shown on: opening another net, from
  // the menu or through Back and Forward, clears it.
  const [refusalNetId, setRefusalNetId] = useState(netId);
  if (netId !== refusalNetId) {
    setRefusalNetId(netId);
    setCreateRefusal(null);
  }
  const createNewNet = (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => {
    try {
      controller.createAndOpen({
        definition: params.petriNetDefinition,
        title: params.title,
      });
      setCreateRefusal(null);
    } catch (error) {
      setCreateRefusal(error instanceof Error ? error.message : String(error));
    }
  };

  const loadPetriNet = (petriNetId: string) => {
    repository.open(petriNetId);
  };
  const notice = unsavedChangeMessage ?? createRefusal;

  const renameCurrentDocument = repository.actions.rename;
  const setTitle =
    currentDocument === null
      ? undefined
      : (title: string) =>
          renameCurrentDocument({
            documentId: currentDocument.documentId,
            title,
          });
  const brunchEditor = useMemo(
    () =>
      activeHandle === null
        ? null
        : {
            handle: activeHandle.handle,
            readTitle: () => activeHandle.document.title,
          },
    [activeHandle],
  );
  const brunchOpenDocument = useMemo(
    () =>
      currentNetId === null
        ? null
        : { documentId: currentNetId, editor: brunchEditor },
    [currentNetId, brunchEditor],
  );
  const brunch = useBrunchAssistant({
    selected: brunchActive,
    openDocument: brunchOpenDocument,
    voice: {
      enabled: voicePreferenceReady && voiceEnabled && realtimePreferenceReady,
      realtime: realtimeEnabled,
    },
    interviewBudget: {
      enabled: interviewBudgetPreferenceReady && interviewBudgetEnabled,
      level: interviewBudgetLevel,
      setLevel: setInterviewBudgetLevel,
    },
    words: { enabled: wordsPreferenceReady && wordsEnabled },
  });

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
      {notice !== null ? <UnsavedChangeNotice message={notice} /> : null}
      <CommandRegistryProvider>
        {/* Brunch's plugin renders its chat from this, inside the editor. */}
        <BrunchAssistantContext value={brunch.assistant}>
          <Petrinaut
            handle={activeHandle.handle}
            existingNets={existingNets}
            createNewNet={createNewNet}
            loadPetriNet={loadPetriNet}
            navigation={navigation}
            plugins={plugins}
            readonly={false}
            setTitle={setTitle}
            slots={{
              settingsLabs: brunchPreviewConfig.isBrunchConfigured ? (
                <AssistantLabsSettings
                  brunchActive={brunchActive}
                  interviewBudgetEnabled={interviewBudgetEnabled}
                  interviewBudgetPreferenceReady={
                    interviewBudgetPreferenceReady
                  }
                  openAIVoiceConfig={brunch.openAIVoiceConfig}
                  realtimeEnabled={realtimeEnabled}
                  realtimePreferenceReady={realtimePreferenceReady}
                  setInterviewBudgetEnabled={setInterviewBudgetEnabled}
                  setRealtimeEnabled={setRealtimeEnabled}
                  setVoiceEnabled={setVoiceEnabled}
                  voiceEnabled={brunchActive && voiceEnabled}
                  voicePreferenceReady={voicePreferenceReady}
                  wordsEnabled={wordsEnabled}
                  wordsPreferenceReady={wordsPreferenceReady}
                  setWordsEnabled={setWordsEnabled}
                />
              ) : undefined,
            }}
            title={currentDocument.title}
          />
        </BrunchAssistantContext>
      </CommandRegistryProvider>
    </div>
  );
};

/**
 * Local-storage demo shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets.
 */
export const LocalStorageDemoApp = (
  props: ComponentProps<typeof LocalStorageDemoEditor>,
) => (
  // Above the editor, so the shell reads which assistant it shows.
  <UserSettingsProvider>
    <LocalStorageDemoEditor {...props} />
  </UserSettingsProvider>
);
