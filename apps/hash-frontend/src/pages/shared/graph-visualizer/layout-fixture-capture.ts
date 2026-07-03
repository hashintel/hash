/**
 * Debug affordance: dump the live flat-tier layout as a replayable JSON
 * fixture (positions, radii, deduped edges, Louvain labels) from ANY surface
 * that renders the visualizer -- including production pages -- without UI.
 *
 * In DevTools, run:
 *
 *     __hashGraphCaptureLayoutFixture()
 *
 * to download `graph-fixture-<n>n-<e>e.json`, the exact shape
 * `forceGraphFromCapturedFixture` (bench-fixtures.ts) replays in benches and
 * tests. With several visualizers mounted (a slide stacked over the entities
 * page), the most recently mounted one is captured; unmounting restores the
 * one below. The dev harness's Capture button shares
 * {@link downloadLayoutFixture}.
 */
import { useEffect } from "react";

import type { WorkerHandle } from "./render/worker-connection";
import type { CapturedLayoutFixture } from "./worker/protocol";

/** Trigger a browser download of the fixture; returns the filename. */
export function downloadLayoutFixture(fixture: CapturedLayoutFixture): string {
  const json = JSON.stringify(fixture);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `graph-fixture-${fixture.nodes.length}n-${fixture.edges.length}e.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return anchor.download;
}

type CaptureFn = () => Promise<CapturedLayoutFixture | null>;

interface CaptureHookWindow {
  __hashGraphCaptureLayoutFixture?: CaptureFn;
}

/**
 * Mounted visualizers' capture functions, oldest first. The window hook
 * always points at the newest live one, so stacked surfaces (entity slide
 * over the entities page) capture the topmost graph and fall back to the
 * one below when it closes.
 */
const liveCaptures: CaptureFn[] = [];

function syncWindowHook(): void {
  const hookWindow = window as unknown as CaptureHookWindow;
  const newest = liveCaptures.at(-1);
  if (newest) {
    hookWindow.__hashGraphCaptureLayoutFixture = newest;
  } else {
    delete hookWindow.__hashGraphCaptureLayoutFixture;
  }
}

/**
 * Registers the `__hashGraphCaptureLayoutFixture()` console hook for the
 * lifetime of `handle`. Calling it captures the live flat-tier layout from
 * the worker and downloads it as JSON (null + a console warning when no
 * flat layout is live, e.g. hierarchical mode).
 */
export function useLayoutFixtureCaptureHook(
  handle: WorkerHandle | undefined,
): void {
  useEffect(() => {
    if (!handle) {
      return undefined;
    }
    const capture: CaptureFn = async () => {
      const fixture = await handle.captureLayoutFixture();
      if (!fixture) {
        // eslint-disable-next-line no-console -- debug console hook
        console.warn(
          "__hashGraphCaptureLayoutFixture: no flat-tier layout live (hierarchical mode or empty graph)",
        );
        return null;
      }
      const filename = downloadLayoutFixture(fixture);
      // eslint-disable-next-line no-console -- debug console hook
      console.info(`__hashGraphCaptureLayoutFixture: downloaded ${filename}`);
      return fixture;
    };
    liveCaptures.push(capture);
    syncWindowHook();
    return () => {
      const index = liveCaptures.indexOf(capture);
      if (index >= 0) {
        liveCaptures.splice(index, 1);
      }
      syncWindowHook();
    };
  }, [handle]);
}
