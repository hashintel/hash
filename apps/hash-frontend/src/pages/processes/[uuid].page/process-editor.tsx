import { Box, Skeleton, Stack } from "@mui/material";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import { type SDCPN } from "@hashintel/petrinaut";
import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import {
  type HostNetMode,
  type PetrinautAiMessage,
  type PetrinautHostCapabilities,
  type RevisionSummary,
  type SavedSnapshot,
} from "../shared/messages";
import { useHostBridge } from "../shared/use-host-bridge";
import {
  clearAiMessages,
  readAiMessages,
  writeAiMessages,
} from "./process-editor/ai-messages-storage";
import { getPetrinautHostCapabilities } from "./process-editor/get-petrinaut-host-capabilities";
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
 * Server route that proxies the Petrinaut AI assistant to the LLM provider.
 * Hardcoded here rather than taken from the iframe's request: the iframe runs
 * untrusted user code, so the host must never fetch an arbitrary URL on its
 * behalf — it only forwards the (still server-validated) request body.
 */
const PETRINAUT_AI_CHAT_API = "/api/petrinaut-ai-chat";

/** Authenticated NodeAPI endpoint that proxies the optimizer container. */
const PETRINAUT_OPTIMIZATION_API = `${apiOrigin}/api/petrinaut-optimizer/optimize`;

/** Authenticated NodeAPI endpoint reporting deployment configuration only. */
const PETRINAUT_CAPABILITIES_API = `${apiOrigin}/api/petrinaut-optimizer/capabilities`;

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

/**
 * Storage key under which a net's AI-assistant conversation is persisted.
 *
 * - Saved nets key by their entity UUID, so the conversation follows the net
 *   across reloads and navigations.
 * - Drafts key by their seed (or `"blank"`). These are written so a draft
 *   conversation can be migrated onto the saved net on first save, but they're
 *   intentionally never *restored* (a fresh draft starts with a blank
 *   conversation, mirroring that draft net contents aren't persisted either).
 */
const aiMessagesKeyForLoadedView = (loadedView: LoadedView): string =>
  loadedView.kind === "saved"
    ? extractEntityUuidFromEntityId(loadedView.entityId)
    : `draft:${loadedView.seedKey ?? "blank"}`;

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
  /**
   * Persisted AI conversation to seed the iframe's assistant with. Only
   * populated for saved nets — see {@link aiMessagesKeyForLoadedView}.
   */
  aiMessages: PetrinautAiMessage[];
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

  /**
   * In-flight AI chat proxy requests, keyed by the `requestId` the iframe
   * generated. Lets `aiChatAbort` cancel the matching fetch.
   */
  const aiChatAbortControllersRef = useRef(new Map<string, AbortController>());

  /** In-flight optimizer streams, keyed by the iframe request id. */
  const optimizationAbortControllersRef = useRef(
    new Map<string, AbortController>(),
  );

  const [petrinautHostCapabilities, setPetrinautHostCapabilities] =
    useState<PetrinautHostCapabilities | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getPetrinautHostCapabilities({
      endpoint: PETRINAUT_CAPABILITIES_API,
      signal: controller.signal,
    }).then((capabilities) => {
      if (!controller.signal.aborted) {
        setPetrinautHostCapabilities(capabilities);
      }
    });

    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      for (const controller of aiChatAbortControllersRef.current.values()) {
        controller.abort();
      }
      aiChatAbortControllersRef.current.clear();
      for (const controller of optimizationAbortControllersRef.current.values()) {
        controller.abort();
      }
      optimizationAbortControllersRef.current.clear();
    },
    [],
  );

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
          // Drafts always start with a blank conversation.
          aiMessages: [],
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
        aiMessages: readAiMessages(
          extractEntityUuidFromEntityId(targetNet.entityId),
        ),
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
          aiMessages: readAiMessages(
            extractEntityUuidFromEntityId(loadedView.entityId),
          ),
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
      onAiChatRequest: ({ requestId, body }) => {
        const controller = new AbortController();
        aiChatAbortControllersRef.current.set(requestId, controller);

        /**
         * Proxy the iframe's chat request through HASH's authenticated API
         * (the iframe's opaque origin can't send our session cookie) and
         * relay the streamed response back over the bridge byte-for-byte.
         */
        void (async () => {
          try {
            const response = await fetch(PETRINAUT_AI_CHAT_API, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body,
              signal: controller.signal,
            });

            bridge.send({
              kind: "aiChatResponseStart",
              requestId,
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
            });

            if (response.body) {
              const reader = response.body.getReader();
              let done = false;
              while (!done) {
                const result = await reader.read();
                done = result.done;
                if (result.value) {
                  bridge.send({
                    kind: "aiChatChunk",
                    requestId,
                    bytes: result.value,
                  });
                }
              }
            }

            bridge.send({ kind: "aiChatEnd", requestId });
          } catch (error) {
            // An abort is a normal control-flow signal, not a failure — the
            // iframe already tore down its stream when it asked us to abort.
            if (!controller.signal.aborted) {
              bridge.send({
                kind: "aiChatError",
                requestId,
                message: error instanceof Error ? error.message : String(error),
              });
            }
          } finally {
            aiChatAbortControllersRef.current.delete(requestId);
          }
        })();
      },
      onAiChatAbort: ({ requestId }) => {
        const controller = aiChatAbortControllersRef.current.get(requestId);
        controller?.abort();
        aiChatAbortControllersRef.current.delete(requestId);
      },
      onOptimizationRequest: ({ requestId, input }) => {
        const parsedInput = petrinautOptimizationInputSchema.safeParse(input);
        if (!parsedInput.success) {
          bridge.send({
            kind: "optimizationError",
            requestId,
            message: "The optimization request is invalid",
          });
          return;
        }
        if (optimizationAbortControllersRef.current.has(requestId)) {
          bridge.send({
            kind: "optimizationError",
            requestId,
            message: "An optimization with this request id is already running",
          });
          return;
        }

        const controller = new AbortController();
        optimizationAbortControllersRef.current.set(requestId, controller);

        /**
         * The sandboxed iframe has no credentials or network access. Validate
         * its structured-cloned request, call the one hard-coded NodeAPI route
         * with HASH's session, then relay the NDJSON response byte-for-byte.
         */
        void (async () => {
          try {
            const response = await fetch(PETRINAUT_OPTIMIZATION_API, {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(parsedInput.data),
              signal: controller.signal,
            });

            bridge.send({
              kind: "optimizationResponseStart",
              requestId,
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
            });

            if (response.body) {
              const reader = response.body.getReader();
              let result = await reader.read();
              while (!result.done) {
                bridge.send({
                  kind: "optimizationChunk",
                  requestId,
                  bytes: result.value,
                });
                result = await reader.read();
              }
            }

            bridge.send({ kind: "optimizationEnd", requestId });
          } catch (error) {
            // An iframe-initiated abort is expected control flow.
            if (!controller.signal.aborted) {
              bridge.send({
                kind: "optimizationError",
                requestId,
                message: error instanceof Error ? error.message : String(error),
              });
            }
          } finally {
            if (
              optimizationAbortControllersRef.current.get(requestId) ===
              controller
            ) {
              optimizationAbortControllersRef.current.delete(requestId);
            }
          }
        })();
      },
      onOptimizationAbort: ({ requestId }) => {
        const controller =
          optimizationAbortControllersRef.current.get(requestId);
        controller?.abort();
      },
      onAiMessagesChanged: ({ messages }) => {
        if (!loadedView) {
          return;
        }
        writeAiMessages(aiMessagesKeyForLoadedView(loadedView), messages);
      },
      onAiMessagesCleared: () => {
        if (!loadedView) {
          return;
        }
        clearAiMessages(aiMessagesKeyForLoadedView(loadedView));
      },
      onRequestSave: ({ requestId, definition, title }) => {
        const wasCreate = selectedNetId === null;
        void persistDefinition(definition, title)
          .then((result) => {
            if (wasCreate) {
              const savedUuid = extractEntityUuidFromEntityId(result.entityId);

              /**
               * Carry any conversation the user had while drafting onto the
               * newly-saved net's key, so saving doesn't appear to discard it.
               * (`loadedView` is still the draft here — the closure captures
               * the value at the time the save was requested.)
               */
              if (loadedView?.kind === "draft") {
                const draftKey = aiMessagesKeyForLoadedView(loadedView);
                const draftMessages = readAiMessages(draftKey);
                if (draftMessages.length > 0) {
                  writeAiMessages(savedUuid, draftMessages);
                }
                clearAiMessages(draftKey);
              }

              expectedSavedUuidRef.current = savedUuid;
              setLoadedView({ kind: "saved", entityId: result.entityId });
              void router.replace(`/processes/${savedUuid}`);
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

  useEffect(() => {
    if (!bridge.isReady || petrinautHostCapabilities === null) {
      return;
    }
    bridge.send({
      kind: "setCapabilities",
      capabilities: petrinautHostCapabilities,
    });
  }, [bridge, petrinautHostCapabilities]);

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
      aiMessages: resolved.aiMessages,
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
      aiMessages: resolved.aiMessages,
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
        aiMessages: resolved.aiMessages,
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
           *
           * `allow-forms` is required for the AI assistant's `<form>`: its
           * submit handler is JS-driven (`preventDefault` + `sendMessage`),
           * but the browser blocks the `submit` event entirely without this
           * flag. It doesn't widen exfiltration risk — the embed CSP's
           * `form-action 'none'` still prevents any actual form navigation.
           */
          sandbox="allow-scripts allow-forms"
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
