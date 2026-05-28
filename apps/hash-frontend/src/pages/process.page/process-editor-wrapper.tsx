import "@hashintel/petrinaut/dist/main.css";
import { Box, Stack } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertModal } from "@hashintel/design-system";
import { Button } from "@hashintel/ds-components";
import {
  createJsonDocHandle,
  Petrinaut,
  type PetrinautDocHandle,
  type PetrinautSlots,
  type SDCPN,
} from "@hashintel/petrinaut";

import {
  type PersistedNet,
  useProcessSaveAndLoad,
} from "./process-editor-wrapper/use-process-save-and-load";
import {
  type PetriNetRevision,
  usePetriNetRevisions,
} from "./process-editor-wrapper/use-process-save-and-load/use-petri-net-revisions";
import { VersionPicker } from "./process-editor-wrapper/version-picker";

import type { EntityId } from "@blockprotocol/type-system";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * Helper to ensure that we copy all fields of the SDCPN when loading a revision.
 */
const SDCPN_FIELDS = {
  places: true,
  transitions: true,
  types: true,
  differentialEquations: true,
  parameters: true,
  scenarios: true,
  metrics: true,
} as const satisfies Record<keyof SDCPN, true>;

/**
 * Mirror a single SDCPN field from `source` onto `target`.
 */
const copySdcpnField = <K extends keyof SDCPN>(
  target: SDCPN,
  source: SDCPN,
  key: K,
): void => {
  /* eslint-disable no-param-reassign -- mutating the Immer draft is
     the whole point of this helper. */
  if (source[key] === undefined) {
    delete (target as Partial<SDCPN>)[key];
  } else {
    target[key] = source[key];
  }
  /* eslint-enable no-param-reassign */
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

  /**
   * Decision-time of the server revision currently mirrored in the editor.
   */
  const [loadedRevisionTime, setLoadedRevisionTime] = useState<string | null>(
    null,
  );

  const { revisions, refetch: refetchRevisions } =
    usePetriNetRevisions(selectedNetId);

  const {
    isDirty,
    loadPersistedNet,
    persistedNets,
    persistPending,
    persistToGraph,
    userEditable,
    setUserEditable,
  } = useProcessSaveAndLoad({
    petriNet: petriNetDefinition,
    refetchRevisions,
    selectedNetId,
    setLoadedRevisionTime,
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
      setLoadedRevisionTime(null);
    },
    [setPetriNet, setSelectedNetId, setUserEditable, setTitle],
  );

  /**
   * Replace the editor state with a past revision of the active entity.
   * Doesn't change `selectedNetId` — it's still the same entity, just
   * pinned to an older decision time. Subsequent edits + save create a
   * new top revision on the existing baseId (linear-edit model).
   *
   * Mutates the existing handle in place via `change()` rather than
   * recreating it through `setPetriNet`. A fresh handle would force a
   * full editor remount (Petrinaut keys worker providers on `handle.id`).
   */
  const loadRevision = useCallback(
    (revision: PetriNetRevision) => {
      handle.change((draft) => {
        for (const key of Object.keys(SDCPN_FIELDS) as (keyof SDCPN)[]) {
          copySdcpnField(draft, revision.definition, key);
        }
      });
      setTitle(revision.title);
      setLoadedRevisionTime(revision.decisionTime);
    },
    [handle, setTitle],
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

  /**
   * Top-bar content injected into Petrinaut via the `slots` API:
   *  - `VersionPicker` — shows the active server revision (vN), a `Draft`
   *    badge when local edits diverge from the latest revision, and a
   *    dropdown to browse history. Hidden entirely when there are no
   *    saved revisions yet (i.e. brand-new net).
   *  - The Save/Create button — disabled until there's something to save.
   *
   * Hidden when the active net is not user-editable; we don't surface a
   * "save as copy" affordance from here today.
   */
  const slots = useMemo<PetrinautSlots>(() => {
    if (!userEditable) {
      return {};
    }

    return {
      topBarEnd: (
        <>
          <VersionPicker
            revisions={revisions}
            loadedRevisionTime={loadedRevisionTime}
            isDirty={isDirty && !persistPending}
            onLoadRevision={loadRevision}
          />
          <Button
            size="sm"
            onClick={persistToGraph}
            disabled={!isDirty || persistPending}
            loading={persistPending}
            tooltip={
              !isDirty && !persistPending ? "No changes to save" : undefined
            }
          >
            {selectedNetId ? (isDirty ? "Save" : "Saved") : "Create"}
          </Button>
        </>
      ),
    };
  }, [
    isDirty,
    loadRevision,
    loadedRevisionTime,
    persistPending,
    persistToGraph,
    revisions,
    selectedNetId,
    userEditable,
  ]);

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

      <Box sx={{ height: "100%" }}>
        <Petrinaut
          handle={handle}
          createNewNet={createNewNet}
          existingNets={existingNetOptions}
          hideNetManagementControls={false}
          loadPetriNet={(id) => loadNetFromId(id as EntityId)}
          readonly={!userEditable}
          setTitle={setTitle}
          slots={slots}
          title={title}
        />
      </Box>
    </Stack>
  );
};
