import { Box, Skeleton, Stack } from "@mui/material";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";

import { useProcessSaveAndLoad } from "./process-editor/use-process-save-and-load";
import { usePetriNetRevisions } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import { useStringEvaluationGate } from "./process-editor/use-string-evaluation-gate";

import type {
  NetMode,
  PetrinautEditorLoad,
  PetrinautEditorSave,
  RevisionSummary,
} from "./process-editor/petrinaut-editor";
import type { PetriNetRevision } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * Loading-state overlay rendered above the still-loading editor. Mirrors
 * Petrinaut's broad layout (top bar with menu buttons / breadcrumb / title /
 * version-picker / save, plus a left rail and the canvas) so the transition
 * into the real editor doesn't cause a visible reflow.
 */
const ProcessEditorLoadingSkeleton = () => (
  <Stack
    sx={({ palette }) => ({
      position: "absolute",
      inset: 0,
      backgroundColor: palette.common.white,
      padding: 1.5,
      gap: 1.5,
    })}
    aria-hidden
  >
    {/* Top bar: menu buttons + breadcrumb + title + version picker + save */}
    <Stack
      direction="row"
      sx={{ height: 36, gap: 1, flexShrink: 0 }}
      alignItems="center"
    >
      <Skeleton variant="rounded" width={32} height={32} animation="wave" />
      <Skeleton
        variant="rounded"
        width={180}
        height={24}
        animation="wave"
        sx={{ marginLeft: 1 }}
      />
      <Box sx={{ flex: 1 }} />
      <Skeleton variant="rounded" width={64} height={28} animation="wave" />
      <Skeleton variant="rounded" width={72} height={28} animation="wave" />
    </Stack>

    {/* Body: left rail + canvas */}
    <Stack direction="row" sx={{ flex: 1, gap: 1.5, minHeight: 0 }}>
      <Skeleton
        variant="rounded"
        animation="wave"
        sx={{ width: 240, height: "100%" }}
      />
      <Skeleton
        variant="rounded"
        animation="wave"
        sx={{ flex: 1, height: "100%" }}
      />
    </Stack>
  </Stack>
);

/**
 * The Petrinaut editor, mounted once for the page's lifetime: the net being
 * edited is driven by its `load` prop, so navigating to a different net
 * doesn't remount it (or recreate its workers). Client-only, because
 * Petrinaut needs browser APIs (workers, canvas, Monaco) at import.
 */
const PetrinautEditor = dynamic(
  () =>
    import("./process-editor/petrinaut-editor").then(
      (mod) => mod.PetrinautEditor,
    ),
  { ssr: false, loading: () => <ProcessEditorLoadingSkeleton /> },
);

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

/**
 * What the editor holds: the view it materialises, and the load that put
 * it there. The view can change without a new load, when Create turns the
 * draft into a saved net.
 */
type Loaded = {
  view: NetMode;
  load: PetrinautEditorLoad;
};

const draftPathForSeedKey = (seedKey: string | null): string =>
  seedKey === null ? "/processes/draft" : `/processes/draft?example=${seedKey}`;

const pathForLoadedView = (loadedView: NetMode): string => {
  if (loadedView.kind === "draft") {
    return draftPathForSeedKey(loadedView.seedKey);
  }
  return `/processes/${extractEntityUuidFromEntityId(loadedView.entityId)}`;
};

const viewMatchesLoaded = (
  view: ProcessEditorView,
  loadedView: NetMode,
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

const buildRevisionSummaries = (
  revisions: ReadonlyArray<PetriNetRevision>,
): RevisionSummary[] =>
  revisions.map(({ decisionTime, title }) => ({ decisionTime, title }));

/**
 * Process editor host. Renders the Petrinaut editor
 * (`./process-editor/petrinaut-editor`) in this page and drives it through
 * its props.
 *
 * The host owns:
 * - URL routing and the discard-changes modal
 * - `beforeunload` guard
 * - Reads/writes to the graph (persisted net list + create/update mutations,
 *   revision history)
 *
 * The editor owns:
 * - The doc handle, title, panels, simulation/Monte-Carlo workers, Monaco
 * - Dirty tracking (live SDCPN/title vs the saved snapshot of its load or
 *   last save)
 *
 * The host caches the editor's dirty state, reported through
 * `onDirtyChange`, for the modal and `beforeunload`.
 */
export const ProcessEditor = ({
  view,
}: {
  /**
   * Resolved URL view. `null` while we're still waiting on `router.isReady`
   * — in that state the editor still renders (so its bundle starts
   * downloading immediately) but nothing is loaded into it until a non-null
   * view arrives.
   */
  view: ProcessEditorView | null;
}) => {
  const router = useRouter();

  /**
   * Petrinaut needs this route's string-evaluation allowance, which a
   * document reached by client-side navigation lacks; the gate reloads such
   * a document before Petrinaut mounts. The skeleton shows meanwhile.
   */
  const canRenderPetrinaut = useStringEvaluationGate();

  const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);

  /**
   * Cached dirty flag reported by the editor. The host doesn't compute this
   * — only stores it for the discard modal + `beforeunload` guard.
   */
  const [isDirty, setIsDirty] = useState(false);

  /**
   * What the editor currently holds. Compared against the incoming `view`
   * prop on every render to decide whether to load it.
   */
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  /** The committed load, or null after leaving, for save completion. */
  const loadedRef = useRef(loaded);
  useLayoutEffect(() => {
    loadedRef.current = loaded;
    return () => {
      loadedRef.current = null;
    };
  }, [loaded]);

  /**
   * Pending view-change waiting on user confirmation, set when the URL
   * changed away from a dirty editor state. Confirming applies it;
   * cancelling reverts the URL back to the loaded view.
   */
  const [pendingView, setPendingView] = useState<ProcessEditorView | null>(
    null,
  );

  /**
   * UUID of the entity we just saved a draft into and are now navigating
   * to via `router.replace`. While set, the reconciliation effect ignores
   * the stale draft `view` until Next.js's router catches up to the new URL.
   */
  const expectedSavedUuidRef = useRef<string | null>(null);

  const { revisions, refetch: refetchRevisions } =
    usePetriNetRevisions(selectedNetId);

  const {
    loadPersistedNet,
    persistDefinition,
    persistedNets,
    persistedNetsLoading,
    setUserEditable,
    userEditable,
  } = useProcessSaveAndLoad({
    refetchRevisions,
    setSelectedNetId,
  });

  /**
   * Resolve the incoming `view` prop into what the editor holds for it.
   * Returns `null` while we're still waiting for `persistedNets` to load
   * (saved view) — which the reconciliation effect treats as a "not yet
   * ready" signal. Every result is a new load.
   */
  const resolveView = useCallback(
    (target: ProcessEditorView): Loaded | null => {
      if (target.kind === "draft") {
        return {
          view: { kind: "draft", seedKey: target.seedKey },
          load: {
            definition: target.seed?.petriNetDefinition ?? emptySDCPN,
            title: target.seed?.title ?? "Process",
            mode: { kind: "draft", seedKey: target.seedKey },
            savedSnapshot: null,
            reason: "open",
          },
        };
      }

      const targetNet = persistedNets.find(
        (net) =>
          extractEntityUuidFromEntityId(net.entityId) === target.entityUuid,
      );
      if (!targetNet) {
        return null;
      }
      return {
        view: { kind: "saved", entityId: targetNet.entityId },
        load: {
          definition: targetNet.definition,
          title: targetNet.title,
          mode: { kind: "saved", entityId: targetNet.entityId },
          savedSnapshot: {
            definition: targetNet.definition,
            title: targetNet.title,
            decisionTime: targetNet.lastUpdated,
          },
          reason: "open",
        },
      };
    },
    [persistedNets],
  );

  /**
   * Load a resolved view into the editor, and mirror the host state the save
   * flow and revision history use.
   */
  const adoptResolvedView = useCallback(
    (resolved: Loaded) => {
      if (resolved.view.kind === "saved") {
        const entityId = resolved.view.entityId;
        const targetNet = persistedNets.find(
          (net) => net.entityId === entityId,
        );
        if (targetNet) {
          loadPersistedNet(targetNet);
        }
      } else {
        setSelectedNetId(null);
        setUserEditable(true);
      }
      setLoaded(resolved);
    },
    [loadPersistedNet, persistedNets, setUserEditable],
  );

  /**
   * Reconciles the incoming `view` prop with what the editor holds.
   *
   * Outcomes:
   *  - Nothing loaded yet: load the view.
   *  - Already loaded: no-op.
   *  - Mismatch and not dirty: load the view immediately.
   *  - Mismatch and dirty: stash as `pendingView` and surface the discard
   *    modal. If the user cancels, the URL is reverted to the loaded view.
   *
   * For "saved" targets that haven't appeared in `persistedNets` yet we wait
   * for the next render once the query resolves.
   */
  useEffect(() => {
    if (view === null) {
      return;
    }

    if (loaded === null) {
      const resolved = resolveView(view);
      if (resolved) {
        adoptResolvedView(resolved);
      }
      return;
    }

    if (expectedSavedUuidRef.current !== null) {
      if (
        view.kind === "saved" &&
        view.entityUuid === expectedSavedUuidRef.current
      ) {
        // URL has caught up — proceed normally (and `viewMatchesLoaded`
        // below will short-circuit since the loaded view was already set in
        // sync with the save).
        expectedSavedUuidRef.current = null;
      } else {
        // Still waiting for `router.replace` to settle; don't react to the
        // transient mismatch.
        return;
      }
    }

    if (viewMatchesLoaded(view, loaded.view)) {
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

    if (isDirty) {
      setPendingView(view);
      return;
    }

    const resolved = resolveView(view);
    if (!resolved) {
      return;
    }
    adoptResolvedView(resolved);
  }, [
    adoptResolvedView,
    isDirty,
    loaded,
    persistedNets,
    persistedNetsLoading,
    resolveView,
    view,
  ]);

  /**
   * Browser-level dirty guard: warns when the user tries to close the tab,
   * reload, or follow an external link with unsaved changes. SPA-internal
   * navigation is handled separately via the {@link AlertModal} below.
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
   * Apply a stashed pending view (after the user confirmed discard).
   */
  const applyPendingView = useCallback(
    (target: ProcessEditorView) => {
      const resolved = resolveView(target);
      if (!resolved) {
        return;
      }
      adoptResolvedView(resolved);

      // Drop the dirty flag eagerly so the modal doesn't immediately retrigger
      // before the editor reports the new load's dirty state.
      setIsDirty(false);
    },
    [adoptResolvedView, resolveView],
  );

  const navigateBack = useCallback(() => {
    void router.push("/processes");
  }, [router]);

  /** Loads a saved revision of the open net, fetched with its history. */
  const selectRevision = useCallback(
    (decisionTime: string) => {
      const revision = revisions.find(
        (rev) => rev.decisionTime === decisionTime,
      );
      if (!revision || loaded?.view.kind !== "saved") {
        return;
      }
      setLoaded({
        view: loaded.view,
        load: {
          definition: revision.definition,
          title: revision.title,
          mode: { kind: "saved", entityId: loaded.view.entityId },
          savedSnapshot: {
            definition: revision.definition,
            title: revision.title,
            decisionTime: revision.decisionTime,
          },
          reason: "revision",
        },
      });
    },
    [loaded, revisions],
  );

  /**
   * Persists what the editor submitted to the net it names. Its result
   * applies to the host only while the load it was submitted from is still
   * open: a save finishing after another load changes neither the selection
   * nor the URL.
   */
  const save = useCallback(
    async ({ definition, title, entityId }: PetrinautEditorSave) => {
      const submittedFrom = loadedRef.current?.load;
      const result = await persistDefinition(definition, title, entityId);
      if (loadedRef.current?.load !== submittedFrom) {
        return result;
      }
      setSelectedNetId(result.entityId);
      setUserEditable(result.userEditable);
      if (entityId === null) {
        const savedUuid = extractEntityUuidFromEntityId(result.entityId);
        expectedSavedUuidRef.current = savedUuid;
        setLoaded((current) =>
          current
            ? { ...current, view: { kind: "saved", entityId: result.entityId } }
            : current,
        );
        void router.replace(`/processes/${savedUuid}`);
      }
      return result;
    },
    [persistDefinition, router, setUserEditable],
  );

  return (
    <Stack sx={{ height: "100%" }}>
      {pendingView && loaded && (
        <AlertModal
          callback={() => {
            const target = pendingView;
            setPendingView(null);
            applyPendingView(target);
          }}
          calloutMessage="You have unsaved changes which will be discarded. Are you sure you want to switch?"
          confirmButtonText="Discard"
          contentStyle={{
            maxWidth: 450,
          }}
          header="Discard unsaved changes?"
          open
          close={() => {
            const revertPath = pathForLoadedView(loaded.view);
            setPendingView(null);
            // Restore the URL to the editor's loaded view so URL and
            // editor stay in sync.
            void router.replace(revertPath);
          }}
          type="warning"
        />
      )}

      <Box sx={{ height: "100%", position: "relative" }}>
        {canRenderPetrinaut && (
          <PetrinautEditor
            load={loaded?.load ?? null}
            readonly={!userEditable}
            revisions={buildRevisionSummaries(revisions)}
            onDirtyChange={setIsDirty}
            onNavigateBack={navigateBack}
            onSelectRevision={selectRevision}
            onSave={save}
          />
        )}

        {(loaded === null || !canRenderPetrinaut) && (
          <ProcessEditorLoadingSkeleton />
        )}
      </Box>
    </Stack>
  );
};
