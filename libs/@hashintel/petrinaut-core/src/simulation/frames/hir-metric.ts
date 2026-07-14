import {
  instantiateHirMetric,
  type HirCompiledMetric,
  type HirMetricArtifact,
} from "../../hir/instantiate";

import type { Place } from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";

/**
 * Binds a compiled HIR metric-shaped artifact to frame readers.
 *
 * The returned evaluator resolves the artifact's referenced place names to
 * frame place indices once (on the first frame — the layout is stable per
 * simulation/experiment), instantiates the program once, and then runs it
 * against each frame's raw buffer view. Throws when a referenced place does
 * not exist or when the frame source exposes no raw buffer access.
 */
function createHirFrameEvaluator(args: {
  /** Display name used in error messages (metric label or name). */
  itemName: string;
  itemKind: "Metric" | "Predicate";
  artifact: HirMetricArtifact;
  /** Root-net places, used to resolve place display names to ids. */
  places: readonly Pick<Place, "id" | "name">[];
}): (frame: SimulationFrameReader) => number | boolean {
  const { itemName, itemKind, artifact, places } = args;
  // Last place wins for duplicate names, matching the HIR metric context.
  const placeIdByName = new Map(places.map((place) => [place.name, place.id]));

  let program: HirCompiledMetric | null = null;
  let currentPool: { get(id: number): string } | null = null;
  // The per-run string pool can differ between frames (Monte-Carlo runs own
  // one each), so the program binds this stable adapter instead.
  const poolAdapter = {
    get: (id: number): string => currentPool?.get(id) ?? "",
  };

  return (frame) => {
    const raw = frame.getRawView?.();
    if (!raw) {
      throw new Error(
        `${itemKind} "${itemName}" cannot run here — this frame source does not expose raw buffer access.`,
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
            `${itemKind} "${itemName}" reads place "${placeName}", which does not exist in this simulation.`,
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
    const result = program(
      raw.f64,
      raw.u64,
      raw.u8,
      raw.placeCounts,
      raw.placeOffsets,
    );
    currentPool = null;
    return result;
  };
}

/**
 * Binds a compiled HIR metric artifact to frame readers.
 *
 * The returned evaluator validates that the program returns a finite number,
 * mirroring the legacy sandboxed-metric error semantics.
 */
export function createHirMetricEvaluator(args: {
  /** Display name used in error messages (metric label or name). */
  metricName: string;
  artifact: HirMetricArtifact;
  /** Root-net places, used to resolve place display names to ids. */
  places: readonly Pick<Place, "id" | "name">[];
}): (frame: SimulationFrameReader) => number {
  const evaluate = createHirFrameEvaluator({
    itemName: args.metricName,
    itemKind: "Metric",
    artifact: args.artifact,
    places: args.places,
  });

  return (frame) => {
    const result = evaluate(frame);
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error(
        `Metric "${args.metricName}" returned ${String(result)}, expected a finite number.`,
      );
    }
    return result;
  };
}

/**
 * Binds a compiled HIR predicate artifact to frame readers.
 *
 * Predicates intentionally share the metric `state` surface and buffer ABI,
 * but the compiled program must return a boolean.
 */
export function createHirPredicateEvaluator(args: {
  /** Display name used in error messages (predicate label). */
  predicateName: string;
  artifact: HirMetricArtifact;
  /** Root-net places, used to resolve place display names to ids. */
  places: readonly Pick<Place, "id" | "name">[];
}): (frame: SimulationFrameReader) => boolean {
  const evaluate = createHirFrameEvaluator({
    itemName: args.predicateName,
    itemKind: "Predicate",
    artifact: args.artifact,
    places: args.places,
  });

  return (frame) => {
    const result = evaluate(frame);
    if (typeof result !== "boolean") {
      throw new Error(
        `Predicate "${args.predicateName}" returned ${String(result)}, expected a boolean.`,
      );
    }
    return result;
  };
}
