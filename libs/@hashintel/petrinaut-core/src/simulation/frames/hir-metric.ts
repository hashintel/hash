import {
  instantiateHirMetric,
  type HirCompiledMetric,
  type HirMetricArtifact,
} from "../../hir/instantiate";

import type { Place } from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";

/**
 * Binds a compiled HIR metric artifact to frame readers.
 *
 * The returned evaluator resolves the artifact's referenced place names to
 * frame place indices once (on the first frame — the layout is stable per
 * simulation/experiment), instantiates the program once, and then runs it
 * against each frame's raw buffer view. Throws (with the metric label) when
 * a referenced place does not exist, when the frame source exposes no raw
 * buffer access, or when the program returns a non-finite value — mirroring
 * the legacy sandboxed-metric error semantics.
 */
export function createHirMetricEvaluator(args: {
  /** Display name used in error messages (metric label or name). */
  metricName: string;
  artifact: HirMetricArtifact;
  /** Root-net places, used to resolve place display names to ids. */
  places: readonly Pick<Place, "id" | "name">[];
}): (frame: SimulationFrameReader) => number {
  const { metricName, artifact, places } = args;
  // Last place wins for duplicate names, matching the HIR metric context.
  const placeIdByName = new Map(places.map((place) => [place.name, place.id]));

  let program: HirCompiledMetric | null = null;
  let currentPool: { get(id: number): string } | null = null;
  // The per-run string pool can differ between frames (Monte-Carlo runs own
  // one each), so the program binds this stable adapter instead.
  const poolAdapter = {
    get: (id: number): string => {
      if (!currentPool) {
        throw new Error(
          `Metric "${metricName}" cannot decode string token attributes because this frame has no string pool.`,
        );
      }
      return currentPool.get(id);
    },
  };

  return (frame) => {
    const raw = frame.getRawView?.();
    if (!raw) {
      throw new Error(
        `Metric "${metricName}" cannot run here — this frame source does not expose raw buffer access.`,
      );
    }

    if (!program) {
      const placeIndices = new Int32Array(artifact.placeNames.length);
      for (const [ordinal, placeName] of artifact.placeNames.entries()) {
        const placeId = placeIdByName.get(placeName);
        const placeIndex =
          placeId === undefined ? undefined : raw.placeIndexById.get(placeId);
        if (placeIndex === undefined) {
          throw new Error(
            `Metric "${metricName}" reads place "${placeName}", which does not exist in this simulation.`,
          );
        }
        placeIndices[ordinal] = placeIndex;
      }
      program = instantiateHirMetric(
        artifact.source,
        placeIndices,
        poolAdapter,
      );
    }

    currentPool = raw.stringPool ?? null;
    let result: number;
    try {
      result = program(
        raw.f64,
        raw.u64,
        raw.u8,
        raw.placeCounts,
        raw.placeOffsets,
      );
    } finally {
      currentPool = null;
    }
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error(
        `Metric "${metricName}" returned ${String(result)}, expected a finite number.`,
      );
    }
    return result;
  };
}
