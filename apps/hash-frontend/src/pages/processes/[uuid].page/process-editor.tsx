import "@hashintel/petrinaut/dist/main.css";
import { Box, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import { Button } from "@hashintel/ds-components";
import {
  createJsonDocHandle,
  Petrinaut,
  type PetrinautDocHandle,
  type PetrinautSlots,
  type SDCPN,
} from "@hashintel/petrinaut";

import { useProcessSaveAndLoad } from "./process-editor/use-process-save-and-load";
import {
  type PetriNetRevision,
  usePetriNetRevisions,
} from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import { VersionPicker } from "./process-editor/version-picker";

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

/**
 * URL-derived view that the editor renders. The host page resolves this from
 * `router.query` and passes it in; the editor reconciles its internal state
 * whenever the view changes.
 */
export type ProcessEditorView =
  | {
      kind: "draft";
      /**
       * Stable identifier for the seed — the example slug, or `null` for a
       * blank draft. Used by the editor to detect when the URL switches
       * from one example to another.
       */
      seedKey: string | null;
      seed?: { title: string; petriNetDefinition: SDCPN };
    }
  | { kind: "saved"; entityUuid: string };

type LoadedView =
  | { kind: "draft"; seedKey: string | null }
  | { kind: "saved"; entityId: EntityId };

const draftPathForSeedKey = (seedKey: string | null): string =>
  seedKey === null ? "/processes/draft" : `/processes/draft?example=${seedKey}`;

const pathForLoadedView = (loadedView: LoadedView): string => {
  if (loadedView.kind === "draft") {
    return draftPathForSeedKey(loadedView.seedKey);
  }
  return `/processes/${extractEntityUuidFromEntityId(loadedView.entityId)}`;
};

const viewMatchesLoaded = (
  view: ProcessEditorView,
  loadedView: LoadedView,
): boolean => {
  if (view.kind === "draft" && loadedView.kind === "draft") {
    return view.seedKey === loadedView.seedKey;
  }
  if (view.kind === "saved" && loadedView.kind === "saved") {
    return (
      view.entityUuid === extractEntityUuidFromEntityId(loadedView.entityId)
    );
  }
  return false;
};

const noNetSwitchingError = () => {
  // Net switching is handled entirely by URL navigation from the
  // `/processes` list page; the in-editor "New"/"Open" menu items are
  // hidden via `hideNetManagementControls="except-title"` so these
  // callbacks should never fire.
  throw new Error(
    "Net switching from inside Petrinaut is not supported in hash-frontend; " +
      "navigate to /processes instead.",
  );
};

export const ProcessEditor = ({ view }: { view: ProcessEditorView }) => {
  const router = useRouter();

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

  /**
   * Tracks which {@link ProcessEditorView} is currently materialised into
   * the editor state. Compared against the incoming `view` prop on every
   * render to decide whether to (re)apply it.
   */
  const [loadedView, setLoadedView] = useState<LoadedView | null>(null);

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
    persistedNetsLoading,
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

  /**
   * Apply a {@link ProcessEditorView} to the editor state, replacing the
   * current handle/title/selectedNetId. Used both for the initial load and
   * whenever the URL navigates to a different view.
   */
  const applyView = useCallback(
    (target: ProcessEditorView) => {
      if (target.kind === "draft") {
        const seedTitle = target.seed?.title ?? "Process";
        const seedDefinition = target.seed?.petriNetDefinition ?? emptySDCPN;
        setHandle(createJsonDocHandle({ initial: seedDefinition }));
        setTitle(seedTitle);
        setSelectedNetId(null);
        setUserEditable(true);
        setLoadedRevisionTime(null);
        setLoadedView({ kind: "draft", seedKey: target.seedKey });
        return;
      }

      const targetNet = persistedNets.find(
        (net) =>
          extractEntityUuidFromEntityId(net.entityId) === target.entityUuid,
      );
      if (!targetNet) {
        return;
      }
      loadPersistedNet(targetNet);
      setLoadedView({ kind: "saved", entityId: targetNet.entityId });
    },
    [
      loadPersistedNet,
      persistedNets,
      setSelectedNetId,
      setTitle,
      setUserEditable,
    ],
  );

  /**
   * Pending view-change waiting on user confirmation, set when the URL
   * changed away from a dirty editor state. Confirming applies it;
   * cancelling reverts the URL back to the loaded view.
   */
  const [pendingView, setPendingView] = useState<ProcessEditorView | null>(
    null,
  );

  /**
   * UUID of the entity we just saved a draft into and are now navigating to
   * via `router.replace`. While set, the reconciliation effect ignores the
   * stale draft `view` until Next.js's router catches up to the new URL.
   *
   * Without this guard, the brief window where `loadedView` is `"saved"` but
   * `view` is still `"draft"` would otherwise look like a "user discarded the
   * draft to navigate elsewhere" change and trigger the discard-changes modal.
   */
  const expectedSavedUuidRef = useRef<string | null>(null);

  /**
   * Reconciles the incoming `view` prop with the editor's `loadedView`.
   *
   * Three outcomes:
   *  - Already loaded: no-op.
   *  - Mismatch and not dirty: apply immediately.
   *  - Mismatch and dirty: stash as `pendingView` and surface the discard
   *    modal. If the user cancels, the URL is reverted to the loaded view.
   *
   * For "saved" targets that haven't appeared in `persistedNets` yet we wait
   * for the next render once the query resolves.
   */
  useEffect(() => {
    if (expectedSavedUuidRef.current !== null) {
      if (
        view.kind === "saved" &&
        view.entityUuid === expectedSavedUuidRef.current
      ) {
        // URL has caught up — proceed normally (and `viewMatchesLoaded`
        // below will short-circuit since `loadedView` was already set in
        // sync with the save).
        expectedSavedUuidRef.current = null;
      } else {
        // Still waiting for `router.replace` to settle; don't react to the
        // transient mismatch.
        return;
      }
    }
    if (loadedView && viewMatchesLoaded(view, loadedView)) {
      return;
    }
    if (view.kind === "saved" && persistedNetsLoading) {
      return;
    }
    if (
      view.kind === "saved" &&
      !persistedNets.some(
        (net) =>
          extractEntityUuidFromEntityId(net.entityId) === view.entityUuid,
      )
    ) {
      return;
    }
    if (loadedView !== null && isDirty) {
      setPendingView(view);
      return;
    }
    applyView(view);
  }, [
    view,
    loadedView,
    persistedNets,
    persistedNetsLoading,
    isDirty,
    applyView,
  ]);

  /**
   * Browser-level dirty guard: warns when the user tries to close the tab,
   * reload, or follow an external link with unsaved changes. SPA-internal
   * navigation is handled separately via the {@link AlertModal} above.
   */
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /**
       * Required by older browsers; modern ones ignore the string. This is
       * the documented way to opt into the native "leave site?" prompt.
       */
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

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

  /**
   * Latest `persistToGraph` callback. Stored in a ref so the Save button
   * closure stays stable while still seeing the freshest reference.
   */
  const persistToGraphRef = useRef(persistToGraph);
  persistToGraphRef.current = persistToGraph;

  const handleSaveClick = useCallback(async () => {
    const wasCreate = selectedNetId === null;
    const persistedEntityId = await persistToGraphRef.current();
    if (wasCreate && persistedEntityId) {
      // The `useProcessSaveAndLoad` hook has already set `selectedNetId`,
      // so we update `loadedView` synchronously here too — that way once the
      // URL catches up, `viewMatchesLoaded` short-circuits the reconciliation
      // effect.
      const entityUuid = extractEntityUuidFromEntityId(persistedEntityId);
      // Suppress reconciliation until the router catches up. Without this,
      // the brief window where `view` is still `"draft"` but `loadedView`
      // is `"saved"` would surface the discard-changes modal.
      expectedSavedUuidRef.current = entityUuid;
      setLoadedView({ kind: "saved", entityId: persistedEntityId });
      void router.replace(`/processes/${entityUuid}`);
    }
  }, [router, selectedNetId]);

  /**
   * Top-bar content injected into Petrinaut via the `slots` API:
   *  - `topBarStart`: a back-arrow button returning to `/processes`.
   *  - `topBarEnd`:
   *    - `VersionPicker` — shows the active server revision (vN), a `Draft`
   *      badge when local edits diverge from the latest revision, and a
   *      dropdown to browse history. Hidden entirely when there are no
   *      saved revisions yet (i.e. brand-new net).
   *    - The Save/Create button — disabled until there's something to save.
   *
   * Both end-slot controls are hidden when the active net is not
   * user-editable; we don't surface a "save as copy" affordance from here
   * today.
   */
  const slots = useMemo<PetrinautSlots>(() => {
    const backButton = (
      <Button
        size="sm"
        variant="ghost"
        iconName="arrowLeft"
        aria-label="Back to processes"
        tooltip="Back to processes"
        onClick={() => {
          void router.push("/processes");
        }}
      />
    );

    if (!userEditable) {
      return { topBarStart: backButton };
    }

    return {
      topBarStart: backButton,
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
            onClick={handleSaveClick}
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
    handleSaveClick,
    isDirty,
    loadRevision,
    loadedRevisionTime,
    persistPending,
    revisions,
    router,
    selectedNetId,
    userEditable,
  ]);

  return (
    <Stack sx={{ height: "100%" }}>
      {pendingView && loadedView && (
        <AlertModal
          callback={() => {
            const target = pendingView;
            setPendingView(null);
            applyView(target);
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch?"
          confirmButtonText="Discard"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Discard unsaved changes?"
          open
          close={() => {
            const revertPath = pathForLoadedView(loadedView);
            setPendingView(null);
            // Restore the URL to the editor's loaded view so URL and
            // editor stay in sync.
            void router.replace(revertPath);
          }}
          type="warning"
        />
      )}

      <Box sx={{ height: "100%" }}>
        <Petrinaut
          handle={handle}
          createNewNet={noNetSwitchingError}
          existingNets={[]}
          hideNetManagementControls="except-title"
          loadPetriNet={noNetSwitchingError}
          readonly={!userEditable}
          setTitle={setTitle}
          slots={slots}
          title={title}
        />
      </Box>
    </Stack>
  );
};
