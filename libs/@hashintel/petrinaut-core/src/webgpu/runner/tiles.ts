/**
 * Scheduling an experiment as tiles of runs and chunks of frames.
 *
 * Pure arithmetic, separate from the dispatch loop, because it is the part
 * users actually hit and a real `GPUDevice` cannot be had in a unit test.
 */
import { GPU_WORKGROUP_SIZE } from "../compile-net-shader";

/**
 * Runs in a preview of the experiment: the window probe's prefix, and the
 * opening tile of a streamed run. Small enough to finish in milliseconds,
 * large enough that its distributions have a usable shape — the same trade
 * the CPU ladder's first rung makes.
 */
export const GPU_PREVIEW_RUNS = 128;

/**
 * How many runs one tile can hold on this device.
 *
 * Run state is one buffer of `bytesPerRun × runs`, so the buffer ceiling —
 * the smaller of `maxStorageBufferBindingSize` (per binding) and
 * `maxBufferSize` (per allocation; the defaults are 128 MiB and 256 MiB, so
 * checking only the first moves the wall instead of finding it) — bounds the
 * runs per tile. So does the dispatch width: one invocation per run,
 * `maxComputeWorkgroupsPerDimension × GPU_WORKGROUP_SIZE` invocations per
 * dispatch.
 */
export function runsPerTile({
  bytesPerRun,
  limits,
}: {
  bytesPerRun: number;
  limits: Pick<
    GPUSupportedLimits,
    | "maxStorageBufferBindingSize"
    | "maxBufferSize"
    | "maxComputeWorkgroupsPerDimension"
  >;
}): number {
  const ceiling = Math.min(
    limits.maxStorageBufferBindingSize,
    limits.maxBufferSize,
  );
  const byMemory =
    bytesPerRun > 0
      ? Math.floor(ceiling / bytesPerRun)
      : Number.MAX_SAFE_INTEGER;
  const byDispatch =
    limits.maxComputeWorkgroupsPerDimension * GPU_WORKGROUP_SIZE;
  return Math.min(byMemory, byDispatch);
}

export type RunTile = { firstRun: number; runCount: number };

/**
 * The run ranges of each tile: uniform tiles of `tileRunCapacity`, opened by
 * a tile of `previewRuns` when one is asked for. Every tile re-delivers the
 * whole time axis cumulatively, so a fast first tile puts a statistically
 * usable picture on screen while the bulk still computes. Seeds derive from
 * absolute run indices, so the split changes nothing about the results.
 *
 * No preview when `previewRuns` is null, or when the run count is small
 * enough that the preview would only add a tile boundary.
 */
export function planTiles(
  runCount: number,
  tileRunCapacity: number,
  previewRuns: number | null,
): RunTile[] {
  const tiles: RunTile[] = [];
  let firstRun = 0;
  if (
    previewRuns !== null &&
    previewRuns < tileRunCapacity &&
    runCount > previewRuns * 2
  ) {
    tiles.push({ firstRun: 0, runCount: previewRuns });
    firstRun = previewRuns;
  }
  while (firstRun < runCount) {
    const tileRuns = Math.min(tileRunCapacity, runCount - firstRun);
    tiles.push({ firstRun, runCount: tileRuns });
    firstRun += tileRuns;
  }
  return tiles;
}

/**
 * The frame counts of each dispatch chunk: a short ramp (32, 64, 128, ...)
 * up to `framesPerDispatch`, then steady.
 *
 * The first streamed frames should reach the charts in milliseconds even
 * when the whole run takes seconds; a fixed 300-frame chunk made the first
 * paint wait for half a typical run. The ramp costs at most three extra
 * dispatch round-trips per run.
 */
export function dispatchChunkFrames(
  frameLimit: number,
  framesPerDispatch: number,
): number[] {
  const chunks: number[] = [];
  let next = Math.min(32, framesPerDispatch);
  let done = 0;
  while (done < frameLimit) {
    const chunk = Math.min(next, framesPerDispatch, frameLimit - done);
    chunks.push(chunk);
    done += chunk;
    next *= 2;
  }
  return chunks;
}
