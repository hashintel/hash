import "@hashintel/petrinaut/dist/main.css";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import { Button } from "@hashintel/ds-components";
import {
  createJsonDocHandle,
  isSDCPNEqual,
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
 * Title shown for a brand-new draft before the user has typed anything. Used
 * as the baseline value the dirty check compares against when there's no
 * persisted entity yet (i.e. before/while a save).
 */
const DEFAULT_DRAFT_TITLE = "Process";

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

/**
 * Whether two URL-derived views refer to the same routing target. Used to
 * detect when the router has moved on from a snapshot we captured earlier
 * (e.g. the pre-save draft view).
 */
const viewsEqual = (
  first: ProcessEditorView,
  second: ProcessEditorView,
): boolean => {
  if (first.kind === "draft" && second.kind === "draft") {
    return first.seedKey === second.seedKey;
  }
  if (first.kind === "saved" && second.kind === "saved") {
    return first.entityUuid === second.entityUuid;
  }
  return false;
};

/**
 * A pending UI action that requires the user to first acknowledge that
 * their unsaved changes will be discarded. Both URL-driven reconciliation
 * and the in-editor back arrow funnel through the same confirmation modal.
 *
 * `navigateAway` carries `revertUrlOnCancel` because some callers (e.g. the
 * back arrow) haven't changed the URL yet so cancelling is a no-op, while
 * others (e.g. the not-found redirect) need the URL reverted to keep it in
 * sync with the still-loaded editor state.
 */
type PendingDiscardAction =
  | { kind: "applyView"; view: ProcessEditorView }
  | { kind: "navigateAway"; path: string; revertUrlOnCancel: boolean };

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
  const [title, setTitle] = useState<string>(DEFAULT_DRAFT_TITLE);

  /**
   * In draft mode (no `selectedNetId`) the hook's `isDirty` is always `true`
   * because there's no persisted entity to compare against — meaning an
   * untouched placeholder would otherwise look "dirty" and trigger discard
   * prompts / enable the Create button incorrectly.
   *
   * This baseline captures the title + SDCPN at the moment a draft view was
   * last applied (or the initial placeholder defaults on first mount). The
   * derived {@link hasUnsavedEdits} below uses it for the draft case so
   * "edited" means "differs from what `applyView` last installed".
   */
  const [draftBaseline, setDraftBaseline] = useState<{
    title: string;
    sdcpn: SDCPN;
  }>(() => ({ title: DEFAULT_DRAFT_TITLE, sdcpn: emptySDCPN }));

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
        const seedTitle = target.seed?.title ?? DEFAULT_DRAFT_TITLE;
        const seedDefinition = target.seed?.petriNetDefinition ?? emptySDCPN;
        setHandle(createJsonDocHandle({ initial: seedDefinition }));
        setTitle(seedTitle);
        setSelectedNetId(null);
        setUserEditable(true);
        setLoadedRevisionTime(null);
        setLoadedView({ kind: "draft", seedKey: target.seedKey });
        // Reset the draft baseline so `hasUnsavedEdits` only fires once the
        // user actually diverges from the seed (or empty placeholder).
        setDraftBaseline({ title: seedTitle, sdcpn: seedDefinition });
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
   * Pending action waiting on the user's "discard unsaved changes"
   * confirmation. Set both when the URL changed under a dirty editor and
   * when the user clicks the in-editor back arrow with unsaved changes.
   */
  const [pendingDiscardAction, setPendingDiscardAction] =
    useState<PendingDiscardAction | null>(null);

  /**
   * Snapshot of the `view` prop at the moment a draft was saved, captured
   * just before we kick off `router.replace`. While this ref is set, the
   * reconciliation effect treats any view that's still equal to the
   * snapshot as a stale pre-`router.replace` value and skips reconciling.
   *
   * Crucially, the ref is cleared as soon as `view` changes to *anything*
   * else — whether that's the expected `/processes/<newUuid>` or some
   * other route the user picked while the save was in flight. This avoids
   * the snapshot getting permanently stuck if the router resolves
   * somewhere unexpected.
   */
  const viewAtSaveTimeRef = useRef<ProcessEditorView | null>(null);

  /**
   * `true` exactly when the URL points at a saved entity that, after the
   * `usePersistedNets` query has resolved, doesn't appear in the user's
   * visible nets. Triggers the not-found UI further down.
   */
  const viewIsNotFound =
    view.kind === "saved" &&
    !persistedNetsLoading &&
    !persistedNets.some(
      (net) => extractEntityUuidFromEntityId(net.entityId) === view.entityUuid,
    );

  /**
   * Whether the editor currently mirrors what the URL is asking for. False
   * during the brief gap between URL change and the corresponding
   * `applyView`, while a saved net is still fetching, and while the URL
   * points at a not-found uuid. Save controls and the Save button are
   * gated on this so a Save can't fire against a stale or unresolved
   * editor state.
   */
  const editorMatchesUrl =
    loadedView !== null && viewMatchesLoaded(view, loadedView);

  /**
   * "Are there local edits that would be lost if we discard the current
   * editor state?"
   *
   * For saved nets this is the hook's `isDirty` (current state differs
   * from the loaded persisted entity). For drafts — where the hook
   * considers any state "dirty" because there's no persisted entity to
   * compare against — we instead compare to {@link draftBaseline}, so an
   * untouched placeholder is correctly `false`.
   */
  const hasUnsavedEdits = useMemo(() => {
    if (selectedNetId !== null) {
      return isDirty;
    }
    return (
      title !== draftBaseline.title ||
      !isSDCPNEqual(petriNetDefinition, draftBaseline.sdcpn)
    );
  }, [selectedNetId, isDirty, title, draftBaseline, petriNetDefinition]);

  /**
   * Reconciles the incoming `view` prop with the editor's `loadedView`.
   *
   * Outcomes:
   *  - Save just landed and URL hasn't caught up: skip.
   *  - URL re-aligned with `loadedView` (e.g. user clicked back while the
   *    discard modal was open): clear any stale `applyView` action and
   *    skip.
   *  - Saved target still loading: skip.
   *  - Saved target not in the user's nets: if there are unsaved edits,
   *    surface the discard modal pointing at `/processes`; otherwise
   *    fall through to the not-found render.
   *  - Mismatch and not dirty: apply immediately.
   *  - Mismatch and dirty: stash as a pending `applyView` action and
   *    surface the discard modal. If the user cancels, the URL is
   *    reverted to the loaded view.
   */
  useEffect(() => {
    if (viewAtSaveTimeRef.current !== null) {
      if (viewsEqual(view, viewAtSaveTimeRef.current)) {
        // `router.replace` hasn't taken effect yet — the prop still reflects
        // the pre-save URL. Wait for it to settle.
        return;
      }
      // Router moved on (whether to the expected new uuid or anywhere
      // else). Clear the guard and fall through to normal reconciliation.
      viewAtSaveTimeRef.current = null;
    }
    if (editorMatchesUrl) {
      // URL and editor agree. Clear any stale `applyView` action so the
      // modal doesn't sit open after e.g. the user hits browser-back to
      // return to the still-loaded view.
      setPendingDiscardAction((prev) =>
        prev?.kind === "applyView" ? null : prev,
      );
      return;
    }
    if (view.kind === "saved" && persistedNetsLoading) {
      return;
    }
    if (view.kind === "saved" && viewIsNotFound) {
      if (hasUnsavedEdits && loadedView !== null) {
        // Give the user a chance to abort the navigation and recover their
        // edits, instead of dropping them straight onto the not-found page.
        setPendingDiscardAction((prev) =>
          prev?.kind === "navigateAway" && prev.path === "/processes"
            ? prev
            : {
                kind: "navigateAway",
                path: "/processes",
                revertUrlOnCancel: true,
              },
        );
      }
      return;
    }
    if (hasUnsavedEdits) {
      setPendingDiscardAction((prev) =>
        prev?.kind === "applyView" && viewsEqual(prev.view, view)
          ? prev
          : { kind: "applyView", view },
      );
      return;
    }
    applyView(view);
  }, [
    view,
    loadedView,
    persistedNets,
    persistedNetsLoading,
    viewIsNotFound,
    editorMatchesUrl,
    hasUnsavedEdits,
    applyView,
  ]);

  /**
   * Browser-level dirty guard: warns when the user tries to close the tab,
   * reload, or follow an external link with unsaved changes. SPA-internal
   * navigation is handled separately via the {@link AlertModal} above.
   */
  useEffect(() => {
    if (!hasUnsavedEdits) {
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
  }, [hasUnsavedEdits]);

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
    const viewAtSaveTime = view;
    const persistedEntityId = await persistToGraphRef.current();
    if (wasCreate && persistedEntityId) {
      // The `useProcessSaveAndLoad` hook has already set `selectedNetId`,
      // so we update `loadedView` synchronously here too — that way once the
      // URL catches up, `viewMatchesLoaded` short-circuits the reconciliation
      // effect.
      const entityUuid = extractEntityUuidFromEntityId(persistedEntityId);
      // Suppress reconciliation while `view` is still the pre-save draft.
      // The guard auto-clears once the router moves on, even if it lands
      // somewhere other than the expected URL.
      viewAtSaveTimeRef.current = viewAtSaveTime;
      setLoadedView({ kind: "saved", entityId: persistedEntityId });
      void router.replace(`/processes/${entityUuid}`);
    }
  }, [router, selectedNetId, view]);

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
  /**
   * Navigate `path`, but if the editor is dirty first show the discard
   * confirmation. Used for the in-editor back arrow so it honours the
   * same guard as URL-driven view changes and `beforeunload`.
   */
  const navigateAwayWithDirtyGuard = useCallback(
    (path: string) => {
      if (hasUnsavedEdits) {
        setPendingDiscardAction({
          kind: "navigateAway",
          path,
          // The URL hasn't changed yet — the user is clicking an in-app
          // back arrow — so cancelling just dismisses the modal.
          revertUrlOnCancel: false,
        });
        return;
      }
      void router.push(path);
    },
    [hasUnsavedEdits, router],
  );

  const slots = useMemo<PetrinautSlots>(() => {
    const backButton = (
      <Button
        size="sm"
        variant="ghost"
        iconName="arrowLeft"
        aria-label="Back to processes"
        tooltip="Back to processes"
        onClick={() => {
          navigateAwayWithDirtyGuard("/processes");
        }}
      />
    );

    // Hide save-side controls when:
    //  - the active net isn't user-editable, OR
    //  - the URL points at a saved net that we haven't loaded yet (still
    //    fetching, or not-found). Otherwise the button would surface as an
    //    enabled "Create" against an empty handle and create a brand-new
    //    entity instead of the one the URL names.
    if (!userEditable || (view.kind === "saved" && !editorMatchesUrl)) {
      return { topBarStart: backButton };
    }

    return {
      topBarStart: backButton,
      topBarEnd: (
        <>
          <VersionPicker
            revisions={revisions}
            loadedRevisionTime={loadedRevisionTime}
            isDirty={hasUnsavedEdits && !persistPending}
            onLoadRevision={loadRevision}
          />
          <Button
            size="sm"
            onClick={handleSaveClick}
            disabled={!hasUnsavedEdits || persistPending}
            loading={persistPending}
            tooltip={
              !hasUnsavedEdits && !persistPending
                ? "No changes to save"
                : undefined
            }
          >
            {selectedNetId ? (hasUnsavedEdits ? "Save" : "Saved") : "Create"}
          </Button>
        </>
      ),
    };
  }, [
    editorMatchesUrl,
    handleSaveClick,
    hasUnsavedEdits,
    loadRevision,
    loadedRevisionTime,
    navigateAwayWithDirtyGuard,
    persistPending,
    revisions,
    selectedNetId,
    userEditable,
    view.kind,
  ]);

  // When the URL points at a missing entity AND there's nothing the user
  // could lose by leaving, show the not-found page. If they have unsaved
  // edits we instead let the discard modal (set in the reconciliation
  // effect above) render over the editor so they get a chance to revert.
  if (viewIsNotFound && !pendingDiscardAction) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          height: "100%",
          textAlign: "center",
          px: 4,
        }}
      >
        <Typography variant="h5">Process not found</Typography>
        <Typography color="text.secondary">
          We couldn't find a process matching this URL. It may have been deleted
          or you may not have access to it.
        </Typography>
        <Button
          size="sm"
          onClick={() => {
            navigateAwayWithDirtyGuard("/processes");
          }}
        >
          Back to processes
        </Button>
      </Stack>
    );
  }

  return (
    <Stack sx={{ height: "100%" }}>
      {pendingDiscardAction && (
        <AlertModal
          callback={() => {
            const action = pendingDiscardAction;
            setPendingDiscardAction(null);
            if (action.kind === "applyView") {
              applyView(action.view);
            } else {
              void router.push(action.path);
            }
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch?"
          confirmButtonText="Discard"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Discard unsaved changes?"
          open
          close={() => {
            const action = pendingDiscardAction;
            setPendingDiscardAction(null);
            // Revert the URL to the still-loaded view when the user
            // cancels a navigation that has already mutated the URL
            // (URL-driven view change, or transition into a not-found
            // route). Back-arrow cancellations don't need this — the URL
            // never moved.
            const shouldRevertUrl =
              action.kind === "applyView" || action.revertUrlOnCancel;
            if (shouldRevertUrl && loadedView) {
              void router.replace(pathForLoadedView(loadedView));
            }
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
