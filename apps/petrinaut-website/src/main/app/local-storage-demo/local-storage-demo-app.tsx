/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { useMemo, useState } from "react";

import {
  CommandRegistryProvider,
  useCommand,
} from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { useSharedSearchNavigation } from "../../../examples/use-shared-search-navigation";
import { StatusPage } from "../../../shared/status-page";
import { BrunchAssistantContext } from "../plugins/brunch/editor-api-plugin";
import {
  brunchPreviewConfig,
  useBrunchAssistant,
} from "../plugins/brunch/use-brunch-assistant";
import { demoPlugins } from "../plugins/demo-plugins";
import { petrinautAiPlugin } from "../plugins/petrinaut-ai/plugin";
import { AssistantLabsSettings } from "./assistant-labs-settings";
import {
  isBrunchSelected,
  type AssistantSelection,
  useAssistantSelection,
} from "./assistant-selection";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { useInterviewBudgetPreference } from "./interview-budget-preference";
import { UnsavedChangeNotice } from "./unsaved-change-notice";
import { useRealtimePreference, useVoicePreference } from "./voice-preference";
import { useWordsPreference } from "./words-preference";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

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
  const brunchSelected =
    assistantSelectionReady &&
    isBrunchSelected(
      brunchPreviewConfig.isBrunchConfigured,
      assistantSelection,
    );
  const selectAssistant = (selection: AssistantSelection) => {
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
    selected: brunchSelected,
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
    plugins: demoPlugins,
  });
  // Petrinaut AI is the assistant until Brunch's is ready.
  const plugins =
    brunch.assistant === null
      ? [...brunch.plugins, petrinautAiPlugin]
      : brunch.plugins;

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
              settingsLabs: (
                <AssistantLabsSettings
                  assistantReady={assistantSelectionReady}
                  brunchConfigured={brunchPreviewConfig.isBrunchConfigured}
                  brunchSelected={brunchSelected}
                  interviewBudgetEnabled={interviewBudgetEnabled}
                  interviewBudgetPreferenceReady={
                    interviewBudgetPreferenceReady
                  }
                  openAIVoiceConfig={brunch.openAIVoiceConfig}
                  realtimeEnabled={realtimeEnabled}
                  realtimePreferenceReady={realtimePreferenceReady}
                  selectAssistant={selectAssistant}
                  setInterviewBudgetEnabled={setInterviewBudgetEnabled}
                  setRealtimeEnabled={setRealtimeEnabled}
                  setVoiceEnabled={setVoiceEnabled}
                  voiceEnabled={brunchSelected && voiceEnabled}
                  voicePreferenceReady={voicePreferenceReady}
                  wordsEnabled={wordsEnabled}
                  wordsPreferenceReady={wordsPreferenceReady}
                  setWordsEnabled={setWordsEnabled}
                />
              ),
            }}
            title={currentDocument.title}
          />
        </BrunchAssistantContext>
        <DemoCommands
          brunchSelected={brunchSelected}
          selectAssistant={selectAssistant}
        />
      </CommandRegistryProvider>
    </div>
  );
};
