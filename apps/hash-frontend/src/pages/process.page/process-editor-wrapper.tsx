import "@hashintel/petrinaut/dist/main.css";

import type { EntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import type { SDCPN } from "@hashintel/petrinaut";
import { Petrinaut } from "@hashintel/petrinaut";
import { Box, Stack } from "@mui/material";
import { produce } from "immer";
import { useCallback, useMemo, useState } from "react";

import { ProcessEditBar } from "./process-editor-wrapper/process-edit-bar";
import {
  type PersistedNet,
  useProcessSaveAndLoad,
} from "./process-editor-wrapper/use-process-save-and-load";

export const ProcessEditorWrapper = () => {
  const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);
  const [title, setTitle] = useState<string>("Process");

  const [petriNetDefinition, setPetriNetDefinition] = useState<SDCPN>({
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  });

  const mutatePetriNetDefinition = useCallback(
    (mutationFn: (petriNetDefinition: SDCPN) => void) => {
      setPetriNetDefinition((netDefinition) => {
        const updatedNetDefinition = produce(netDefinition, (draft) => {
          mutationFn(draft);
        });

        return updatedNetDefinition;
      });
    },
    [setPetriNetDefinition],
  );

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
    setPetriNet: setPetriNetDefinition,
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
      setPetriNetDefinition(newPetriNetDefinition);

      setSelectedNetId(null);
      setUserEditable(true);
      setTitle(newTitle);
    },
    [setSelectedNetId, setUserEditable, setTitle],
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
          createNewNet={createNewNet}
          existingNets={existingNetOptions}
          hideNetManagementControls={false}
          loadPetriNet={(id) => loadNetFromId(id as EntityId)}
          petriNetDefinition={petriNetDefinition}
          petriNetId={selectedNetId}
          mutatePetriNetDefinition={mutatePetriNetDefinition}
          readonly={!userEditable}
          setTitle={setTitle}
          title={title}
        />
      </Box>
    </Stack>
  );
};
