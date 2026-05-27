import "@hashintel/petrinaut/dist/main.css";
import { Box, Stack } from "@mui/material";
import * as Sentry from "@sentry/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertModal } from "@hashintel/design-system";
import {
  createJsonDocHandle,
  ErrorTrackerContext,
  Petrinaut,
  type PetrinautDocHandle,
  type SDCPN,
} from "@hashintel/petrinaut";
import { createIframeSandbox } from "@hashintel/petrinaut/sandbox-iframe";

import { ProcessEditBar } from "./process-editor-wrapper/process-edit-bar";
import {
  type PersistedNet,
  useProcessSaveAndLoad,
} from "./process-editor-wrapper/use-process-save-and-load";

import type { EntityId } from "@blockprotocol/type-system";

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

  /**
   * Petrinaut surfaces user-code errors through `ErrorTrackerContext`;
   * we point that at Sentry so any uncaught exceptions in user-authored
   * scenarios/metrics/visualizers show up in the same dashboard as the
   * rest of the app.
   *
   * The same callback is wired into `createIframeSandbox.onError` so
   * errors that originate *inside* the sandbox iframe (forwarded over
   * `postMessage` by the sandbox runtime's `error` / `unhandledrejection`
   * listeners) also reach Sentry — the iframe itself has
   * `connect-src 'none'`, so it can't report directly.
   *
   * Held in `useState` (lazy-init) rather than `useMemo` because React
   * may legitimately re-invoke `useMemo` factories (Strict Mode dev
   * double-render, future caching policies). `useState`'s init runs
   * exactly once per mount.
   */
  const [errorTracker] = useState(() => ({
    captureException: (error: unknown) => {
      Sentry.captureException(error);
    },
  }));

  /**
   * Build the iframe sandbox once per editor mount. User-authored
   * code (scenarios, metrics, visualizers, simulation lambdas) runs
   * inside `/petrinaut-sandbox` — a separate Next.js page served from
   * an iframe with `sandbox="allow-scripts"` and a CSP that allows
   * `unsafe-eval` but `connect-src 'none'`.
   *
   * Lazy-init via `useState` (not `useMemo`) because `createIframeSandbox`
   * has side effects — it appends iframes to `document.body`. `useMemo`
   * factories are documented as pure; React Strict Mode dev would leak
   * orphan iframes per render. `useState`'s init runs exactly once.
   *
   * See `apps/hash-frontend/src/pages/petrinaut-sandbox.page.tsx` and
   * `apps/hash-frontend/src/lib/csp.ts` (`buildSandboxCspHeader`).
   */
  const [evalSandbox] = useState(() =>
    createIframeSandbox({
      src: "/petrinaut-sandbox",
      onError: (error, origin) => {
        Sentry.captureException(error, {
          tags: { petrinautSandbox: origin },
        });
      },
    }),
  );

  // Tear down the sandbox iframe(s) when the editor unmounts.
  useEffect(() => {
    return () => {
      evalSandbox.dispose();
    };
  }, [evalSandbox]);

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
        <ErrorTrackerContext value={errorTracker}>
          <Petrinaut
            handle={handle}
            createNewNet={createNewNet}
            evalSandbox={evalSandbox}
            existingNets={existingNetOptions}
            hideNetManagementControls={false}
            loadPetriNet={(id) => loadNetFromId(id as EntityId)}
            readonly={!userEditable}
            setTitle={setTitle}
            title={title}
          />
        </ErrorTrackerContext>
      </Box>
    </Stack>
  );
};
