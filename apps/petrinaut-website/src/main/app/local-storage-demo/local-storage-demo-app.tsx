/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { useState } from "react";

import { Petrinaut } from "@hashintel/petrinaut/ui";

import { useSharedSearchNavigation } from "../../../examples/use-shared-search-navigation";
import { StatusPage } from "../../../shared/status-page";
import { demoPlugins } from "../plugins/demo-plugins";
import { useActiveHandle } from "./documents/use-active-handle";
import { useDocumentController } from "./documents/use-document-controller";
import { UnsavedChangeNotice } from "./unsaved-change-notice";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { MinimalNetMetadata, SDCPN } from "@hashintel/petrinaut-core";

/**
 * Local-storage demo shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets. Everything else the editor shows comes from the demo's
 * plugins.
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
      <Petrinaut
        handle={activeHandle.handle}
        existingNets={existingNets}
        createNewNet={createNewNet}
        loadPetriNet={loadPetriNet}
        navigation={navigation}
        plugins={demoPlugins}
        readonly={false}
        setTitle={setTitle}
        title={currentDocument.title}
      />
    </div>
  );
};
