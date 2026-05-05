import "@hashintel/petrinaut/dist/main.css";

import type { EntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import {
  createJsonDocHandle,
  Petrinaut,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut";
import { Box, Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProcessEditBar } from "./process-editor-wrapper/process-edit-bar";
import {
  type PersistedNet,
  useProcessSaveAndLoad,
} from "./process-editor-wrapper/use-process-save-and-load";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

export const ProcessEditorWrapper = () => {
  const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);
  const [title, setTitle] = useState<string>("Process");

  /**
   * The handle is the source of truth for the current net's document. A
   * fresh handle is created when the user loads a different persisted net
   * or asks for a new empty one — this naturally resets undo/redo history.
   */
  const [handle, setHandle] = useState<PetrinautDocHandle>(() =>
    createJsonDocHandle({ initial: emptySDCPN }),
  );

  /**
   * Mirror of the handle's current document, kept in React state so the
   * save/load logic can read it as a plain SDCPN (for `isDirty` checks and
   * persisting to the graph). Updated synchronously when the handle changes
   * via `handle.subscribe`.
   */
  const [petriNetDefinition, setPetriNetDefinition] = useState<SDCPN>(
    () => handle.doc() ?? emptySDCPN,
  );
  useEffect(() => {
    setPetriNetDefinition(handle.doc() ?? emptySDCPN);
    return handle.subscribe((event) => {
      setPetriNetDefinition(event.next);
    });
  }, [handle]);

  const setPetriNet = useCallback((sdcpn: SDCPN) => {
    setHandle(createJsonDocHandle({ initial: sdcpn }));
  }, []);

  const [switchTargetPendingConfirmation, setSwitchTargetPendingConfirmation] =
    useState<PersistedNet | null>(null);

  const {
    discardChanges,
    isDirty,
    loadPersistedNet,
    persistedNets,
    persistPending,
    persistToGraph,
    userEditable,
    setUserEditable,
  } = useProcessSaveAndLoad({
    petriNet: petriNetDefinition,
    selectedNetId,
    setPetriNet,
    setSelectedNetId,
    setTitle,
    title,
  });

  const createNewNet = useCallback(
    ({
      petriNetDefinition: newPetriNetDefinition,
      title: newTitle,
    }: {
      petriNetDefinition: SDCPN;
      title: string;
    }) => {
      setPetriNet(newPetriNetDefinition);
      setSelectedNetId(null);
      setUserEditable(true);
      setTitle(newTitle);
    },
    [setPetriNet, setSelectedNetId, setUserEditable, setTitle],
  );

  const loadNetFromId = useCallback(
    (netId: EntityId) => {
      const foundNet = persistedNets.find((net) => net.entityId === netId);

      if (!foundNet) {
        throw new Error(`Net ${netId} not found`);
      }

      if (isDirty) {
        setSwitchTargetPendingConfirmation(foundNet);
      } else {
        loadPersistedNet(foundNet);
      }
    },
    [isDirty, loadPersistedNet, persistedNets],
  );

  const existingNetOptions = useMemo(() => {
    return persistedNets
      .filter((net) => net.userEditable && net.entityId !== selectedNetId)
      .map((net) => ({
        netId: net.entityId,
        title: net.title,
        lastUpdated: net.lastUpdated,
      }));
  }, [persistedNets, selectedNetId]);

  return (
    <Stack sx={{ height: "100%" }}>
      {switchTargetPendingConfirmation && (
        <AlertModal
          callback={() => {
            setSwitchTargetPendingConfirmation(null);
            loadPersistedNet(switchTargetPendingConfirmation);
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch to another net?"
          confirmButtonText="Switch"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Switch and discard changes?"
          open
          close={() => setSwitchTargetPendingConfirmation(null)}
          type="warning"
        />
      )}
      <ProcessEditBar
        discardChanges={discardChanges}
        isDirty={isDirty}
        persistToGraph={persistToGraph}
        persistPending={persistPending}
        userEditable={userEditable}
        selectedNetId={selectedNetId}
      />

      <Box sx={{ height: "100%" }}>
        <Petrinaut
          handle={handle}
          createNewNet={createNewNet}
          existingNets={existingNetOptions}
          hideNetManagementControls={false}
          loadPetriNet={(id) => loadNetFromId(id as EntityId)}
          readonly={!userEditable}
          setTitle={setTitle}
          title={title}
        />
      </Box>
    </Stack>
  );
};
