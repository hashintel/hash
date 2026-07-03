/**
 * Decides when a visualizer instance's simulation should be frozen because
 * the user cannot see it, and keeps the worker in sync with that decision.
 *
 * Three independent "not visible" signals are OR-ed together:
 *
 * 1. `occluded`: the caller's knowledge of UI stacked over the visualizer
 *    (a slide covering the page, a slide covered by a later slide). Only the
 *    caller can know this; z-order occlusion is invisible to the browser
 *    APIs below.
 * 2. Document visibility: the tab is hidden. Crucial because the worker's
 *    MessageChannel tick loop is not throttled in background tabs the way
 *    rAF is, so an unsettled layout would otherwise burn CPU indefinitely.
 * 3. Viewport intersection: the container is scrolled out of view or
 *    `display: none` (an IntersectionObserver reports both as
 *    non-intersecting).
 *
 * The worker keeps ingesting and committing while paused; only the tick
 * scheduler idles, and layouts resume from the same positions (the
 * `SET_SIMULATION_PAUSED` contract in `worker/protocol.ts`).
 */
import { useCallback, useEffect, useState } from "react";

import type { WorkerHandle } from "../render/worker-connection";

interface UseSimulationPauseOptions {
  readonly handle: WorkerHandle | undefined;
  /** Only send once the worker exists (INIT processed); earlier posts would be dropped. */
  readonly ready: boolean;
  /** Caller-known occlusion: UI layered over an otherwise-visible visualizer. */
  readonly occluded: boolean;
}

/**
 * Returns the ref to attach to the visualizer's root element. It is a
 * callback ref because the element mounts conditionally after the worker
 * exists; a static ref filled in later would never re-trigger observation.
 */
export function useSimulationPause({
  handle,
  ready,
  occluded,
}: UseSimulationPauseOptions): (element: HTMLElement | null) => void {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const update = () => {
      setDocumentHidden(document.visibilityState === "hidden");
    };

    update();
    document.addEventListener("visibilitychange", update);

    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!container) {
      // No container mounted (loading/error branches): the viewport signal
      // simply reports visible; the other signals still apply.
      setOffscreen(false);
      return;
    }

    const observer = new IntersectionObserver(
      (observations) => {
        const latest = observations.at(-1);
        if (latest) {
          setOffscreen(!latest.isIntersecting);
        }
      },
      // Any visible sliver counts as on-screen: pausing is for instances the
      // user has scrolled away from entirely, not partially.
      { threshold: 0 },
    );

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [container]);

  const paused = occluded || documentHidden || offscreen;

  useEffect(() => {
    if (handle && ready) {
      handle.setSimulationPaused(paused);
    }
  }, [handle, ready, paused]);

  return useCallback((element: HTMLElement | null) => {
    setContainer(element);
  }, []);
}
