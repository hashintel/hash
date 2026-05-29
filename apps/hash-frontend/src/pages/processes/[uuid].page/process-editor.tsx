import { Box, Skeleton, Stack } from "@mui/material";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import { type SDCPN } from "@hashintel/petrinaut";

import {
  type HostNetMode,
  type RevisionSummary,
  type SavedSnapshot,
} from "../shared/messages";
import { useHostBridge } from "../shared/use-host-bridge";
import { useProcessSaveAndLoad } from "./process-editor/use-process-save-and-load";
import { usePetriNetRevisions } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";

import type { EntityId } from "@blockprotocol/type-system";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * URL the iframe is mounted at. Stable across the editor's lifetime — the
 * actual net being edited is driven entirely by `init`/`load` messages over
 * the postMessage bridge, so we don't need to remount the iframe (or recreate
 * its workers) just because the user navigated to a different net.
 *
 * `/processes/draft/embed` matches the `[uuid]/embed.page.tsx` route with
 * `uuid` set to the literal string "draft"; the embed page doesn't read the
 * URL parameter so any value would work, but a constant keeps the network
 * tab tidy.
 */
const PETRINAUT_EMBED_SRC = "/processes/draft/embed";

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
 * Resolved content for the active view: the SDCPN + title to load into the
 * iframe, the `HostNetMode` describing it, and the `SavedSnapshot` the
 * iframe should compare against for dirty-tracking.
 */
type ResolvedView = {
  loadedView: LoadedView;
  definition: SDCPN;
  title: string;
  mode: HostNetMode;
  savedSnapshot: SavedSnapshot;
};

const buildRevisionSummaries = (
  revisions: ReadonlyArray<{ decisionTime: string; title: string }>,
): RevisionSummary[] =>
  revisions.map(({ decisionTime, title }) => ({ decisionTime, title }));

/**
 * Loading-state overlay rendered above the still-warming iframe. Mirrors
 * Petrinaut's broad layout (top bar with back / title / version-picker /
 * save, plus a left rail and the canvas) so the transition into the real
 * editor doesn't cause a visible reflow.
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
    {/* Top bar: back button + title + version picker + save button */}
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
 * Process editor host. Mounts a sandboxed null-origin iframe at
 * {@link PETRINAUT_EMBED_SRC} so user-provided code (visualizers,
 * metrics, scenarios) runs with `'unsafe-eval'` allowed but contained
 * away from the parent HASH origin's cookies, storage, and APIs.
 *
 * The host owns:
 * - URL routing and the discard-changes modal
 * - `beforeunload` guard
 * - Reads/writes to the graph (persisted net list + create/update mutations,
 *   revision history)
 *
 * The iframe owns:
 * - The doc handle, title, panels, simulation/Monte-Carlo workers, Monaco
 * - Dirty tracking (live SDCPN/title vs the `savedSnapshot` we last sent)
 *
 * Dirty status flows host -> iframe via `savedSnapshot`, iframe -> host via
 * `dirtyChanged` (cached here for the modal + `beforeunload`).
 */
export const ProcessEditor = ({
  view,
}: {
  /**
   * Resolved URL view. `null` while we're still waiting on `router.isReady`
   * — in that state the editor still renders its iframe element (so the
   * iframe bundle starts downloading immediately) but the bridge effects
   * stay dormant until a non-null view arrives.
   */
  view: ProcessEditorView | null;
}) => {
  const router = useRouter();

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);

  /**
   * Cached dirty flag mirrored from the iframe's `dirtyChanged` events. The
   * host doesn't compute this — only stores it for the discard modal +
   * `beforeunload` guard.
   */
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Tracks which {@link ProcessEditorView} is currently materialised inside
   * the iframe. Compared against the incoming `view` prop on every render
   * to decide whether to (re)apply it.
   */
  const [loadedView, setLoadedView] = useState<LoadedView | null>(null);

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
    selectedNetId,
    setSelectedNetId,
  });

  /**
   * Resolve the incoming `view` prop into the data the iframe needs (SDCPN,
   * title, mode, savedSnapshot). Returns `null` while we're still waiting
   * for `persistedNets` to load (saved view) — which the reconciliation
   * effect treats as a "not yet ready" signal.
   */
  const resolveView = useCallback(
    (target: ProcessEditorView): ResolvedView | null => {
      if (target.kind === "draft") {
        const seedTitle = target.seed?.title ?? "Process";
        const seedDefinition = target.seed?.petriNetDefinition ?? emptySDCPN;
        return {
          loadedView: { kind: "draft", seedKey: target.seedKey },
          definition: seedDefinition,
          title: seedTitle,
          mode: { kind: "draft", seedKey: target.seedKey },
          savedSnapshot: null,
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
        loadedView: { kind: "saved", entityId: targetNet.entityId },
        definition: targetNet.definition,
        title: targetNet.title,
        mode: {
          kind: "saved",
          entityId: targetNet.entityId,
          userEditable: targetNet.userEditable,
        },
        savedSnapshot: {
          definition: targetNet.definition,
          title: targetNet.title,
          decisionTime: targetNet.lastUpdated,
        },
      };
    },
    [persistedNets],
  );

  const bridge = useHostBridge({
    iframeRef,
    handlers: {
      onDirtyChanged: setIsDirty,
      onRequestNavigateBack: () => {
        void router.push("/processes");
      },
      onRequestRevision: (decisionTime) => {
        const revision = revisions.find(
          (rev) => rev.decisionTime === decisionTime,
        );
        if (!revision || !loadedView || loadedView.kind !== "saved") {
          return;
        }
        bridge.send({
          kind: "load",
          definition: revision.definition,
          title: revision.title,
          mode: {
            kind: "saved",
            entityId: loadedView.entityId,
            userEditable,
          },
          savedSnapshot: {
            definition: revision.definition,
            title: revision.title,
            decisionTime: revision.decisionTime,
          },
          revisions: buildRevisionSummaries(revisions),
        });
      },
      onReportError: ({ source, name, message, stack, mode }) => {
        /**
         * Reconstruct an Error from the iframe's serialised payload so
         * Sentry's stack-trace processing has something to chew on. The
         * synthetic Error's stack is replaced with the iframe's own,
         * which Sentry will resolve against the same source maps as the
         * embed-page bundle (uploaded as part of the host's release).
         */
        const reconstructed = Object.assign(new Error(message), {
          name,
          stack,
        });
        Sentry.captureException(reconstructed, {
          tags: {
            "petrinaut.source": source,
            "petrinaut.mode": mode?.kind ?? "unknown",
          },
          contexts: {
            petrinaut: { mode },
          },
        });
      },
      onRequestSave: ({ requestId, definition, title }) => {
        const wasCreate = selectedNetId === null;
        void persistDefinition(definition, title)
          .then((result) => {
            if (wasCreate) {
              expectedSavedUuidRef.current = extractEntityUuidFromEntityId(
                result.entityId,
              );
              setLoadedView({ kind: "saved", entityId: result.entityId });
              void router.replace(
                `/processes/${extractEntityUuidFromEntityId(result.entityId)}`,
              );
            }
            bridge.send({
              kind: "saveResult",
              requestId,
              result: {
                ok: true,
                mode: {
                  kind: "saved",
                  entityId: result.entityId,
                  userEditable: result.userEditable,
                },
                savedSnapshot: {
                  definition,
                  title,
                  decisionTime: result.decisionTime,
                },
                revisions: buildRevisionSummaries(revisions),
              },
            });
          })
          .catch((error: unknown) => {
            bridge.send({
              kind: "saveResult",
              requestId,
              result: {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          });
      },
    },
  });

  /**
   * Apply a resolved view: mirror local host state used by the save flow,
   * record the new `loadedView`. Returns the resolved view so the caller
   * can issue the matching `init` / `load` message.
   */
  const adoptResolvedView = useCallback(
    (resolved: ResolvedView) => {
      if (resolved.loadedView.kind === "saved") {
        const entityId = resolved.loadedView.entityId;
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
      setLoadedView(resolved.loadedView);
    },
    [loadPersistedNet, persistedNets, setUserEditable],
  );

  /**
   * Bootstrap: on the first render where the iframe is ready, the view has
   * resolved from the URL, and we have all the data we need to materialise
   * it, push `init`. Subsequent view changes (including URL navigation)
   * flow through the reconciliation effect below as `load`.
   */
  useEffect(() => {
    if (!bridge.isReady || loadedView !== null || view === null) {
      return;
    }
    const resolved = resolveView(view);
    if (!resolved) {
      return;
    }
    adoptResolvedView(resolved);

    bridge.send({
      kind: "init",
      initialDefinition: resolved.definition,
      initialTitle: resolved.title,
      readonly:
        resolved.mode.kind === "saved" ? !resolved.mode.userEditable : false,
      mode: resolved.mode,
      savedSnapshot: resolved.savedSnapshot,
      revisions: buildRevisionSummaries(revisions),
    });
  }, [adoptResolvedView, bridge, loadedView, resolveView, revisions, view]);

  /**
   * Reconciles the incoming `view` prop with the editor's `loadedView` for
   * subsequent navigations.
   *
   * Three outcomes:
   *  - Already loaded: no-op.
   *  - Mismatch and not dirty: send `load` immediately.
   *  - Mismatch and dirty: stash as `pendingView` and surface the discard
   *    modal. If the user cancels, the URL is reverted to the loaded view.
   *
   * For "saved" targets that haven't appeared in `persistedNets` yet we wait
   * for the next render once the query resolves.
   */
  useEffect(() => {
    if (!bridge.isReady || loadedView === null || view === null) {
      return;
    }

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

    if (viewMatchesLoaded(view, loadedView)) {
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

    bridge.send({
      kind: "load",
      definition: resolved.definition,
      title: resolved.title,
      mode: resolved.mode,
      savedSnapshot: resolved.savedSnapshot,
      revisions: buildRevisionSummaries(revisions),
    });
  }, [
    adoptResolvedView,
    bridge,
    isDirty,
    loadedView,
    persistedNets,
    persistedNetsLoading,
    resolveView,
    revisions,
    view,
  ]);

  /**
   * Whenever the host's revision list refreshes (via Apollo's cache) push
   * it down to the iframe so the version picker stays current.
   */
  useEffect(() => {
    if (!bridge.isReady || loadedView === null) {
      return;
    }
    bridge.send({
      kind: "revisionsList",
      revisions: buildRevisionSummaries(revisions),
    });
  }, [bridge, loadedView, revisions]);

  /**
   * Mirror updated `userEditable` permission to the iframe (e.g. the
   * persisted-net record was refreshed and permissions changed).
   */
  useEffect(() => {
    if (!bridge.isReady || loadedView === null) {
      return;
    }
    bridge.send({ kind: "setReadonly", readonly: !userEditable });
  }, [bridge, loadedView, userEditable]);

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
      // before the iframe's `dirtyChanged` flushes after the new load.
      setIsDirty(false);

      bridge.send({
        kind: "load",
        definition: resolved.definition,
        title: resolved.title,
        mode: resolved.mode,
        savedSnapshot: resolved.savedSnapshot,
        revisions: buildRevisionSummaries(revisions),
      });
    },
    [adoptResolvedView, bridge, resolveView, revisions],
  );

  /**
   * Show the skeleton until the iframe has signalled `ready` AND we've
   * pushed the bootstrap `init` message (i.e. the iframe is rendering
   * Petrinaut against the right SDCPN). There's a small visual gap
   * between sending `init` and Petrinaut actually painting its panels;
   * we accept that flash rather than introducing an extra
   * "editor-painted" handshake message.
   */
  const isLoading = !bridge.isReady || loadedView === null;

  return (
    <Stack sx={{ height: "100%" }}>
      {pendingView && loadedView && (
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
            const revertPath = pathForLoadedView(loadedView);
            setPendingView(null);
            // Restore the URL to the editor's loaded view so URL and
            // editor stay in sync.
            void router.replace(revertPath);
          }}
          type="warning"
        />
      )}

      <Box sx={{ height: "100%", position: "relative" }}>
        <Box
          component="iframe"
          ref={iframeRef}
          src={PETRINAUT_EMBED_SRC}
          /**
           * `allow-scripts` (without `allow-same-origin`) gives the iframe a
           * unique opaque origin: it can't read HASH cookies / localStorage /
           * IndexedDB, can't reach HASH's API as the user (CORS + no
           * cookies), and can't touch the parent DOM. The route's CSP
           * additionally restricts what the iframe can do with the
           * `'unsafe-eval'` we grant it (no `connect-src` to anywhere
           * outside `'self'`, which is itself unreachable cross-origin).
           */
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title="Petrinaut editor"
          sx={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
          }}
        />

        {isLoading && <ProcessEditorLoadingSkeleton />}
      </Box>
    </Stack>
  );
};
