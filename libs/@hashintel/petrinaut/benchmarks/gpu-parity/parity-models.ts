import {
  getOwn,
  type InitialMarking,
  type MonteCarloMetricSpec,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  cafeQueue,
  dronePatrol,
  sirModel,
} from "@hashintel/petrinaut-core/examples";

import type { HirArtifacts } from "@hashintel/petrinaut-core/hir";

/** One metric both backends measure, with a label for the report. */
type ParityMeasure =
  /** A place's token count, the shader's `counts[]` sample. */
  | { kind: "placeCount"; placeId: string; label: string }
  /**
   * One of the model's expression metrics, compiled with its HIR so the shader
   * samples the same body the CPU evaluates.
   */
  | { kind: "expression"; metricId: string; label: string };

export type ParityModel = {
  title: string;
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  measures: ParityMeasure[];
};

/**
 * The nets the harness runs. The place-count measures sample active runs, the
 * chart default. The expression measure samples `all` runs, as the optimizer
 * objective and the experiment form do, so it also checks the shader's
 * run-status guard and the final frame, where every run is complete, against
 * the CPU.
 */
export const parityModels: ParityModel[] = [
  {
    title: "SIR",
    sdcpn: sirModel.petriNetDefinition,
    initialMarking: {
      place__susceptible: 190,
      place__infected: 10,
      place__recovered: 0,
    },
    measures: [
      { kind: "placeCount", placeId: "place__infected", label: "Infected" },
      {
        kind: "expression",
        metricId: "metric__infected_fraction",
        label: "Infected Fraction",
      },
    ],
  },
  {
    title: "Café Queue",
    sdcpn: cafeQueue.petriNetDefinition,
    initialMarking: {
      place__waiting: 12,
      place__free_staff: 3,
      place__serving: 0,
      place__served: 0,
    },
    measures: [
      { kind: "placeCount", placeId: "place__served", label: "Served" },
    ],
  },
  {
    title: "Drone Patrol",
    sdcpn: dronePatrol.petriNetDefinition,
    initialMarking: {
      place__hangar: Array.from({ length: 10 }, () => ({
        battery: 100,
        altitude: 0,
      })),
      place__airborne: [],
    },
    measures: [
      { kind: "placeCount", placeId: "place__airborne", label: "Airborne" },
    ],
  },
];

/**
 * The spec both backends run for a measure, as a distribution with exact
 * bins. An expression measure keeps the id of the model's metric.
 */
export const metricSpecOf = (
  model: ParityModel,
  measure: ParityMeasure,
  artifacts: HirArtifacts,
): MonteCarloMetricSpec => {
  if (measure.kind === "placeCount") {
    return {
      kind: "placeTokenCountMean",
      id: `parity-${measure.placeId}`,
      label: measure.label,
      placeId: measure.placeId,
      runOutput: { type: "distribution", binning: "exact" },
    };
  }
  const metric = model.sdcpn.metrics?.find(({ id }) => id === measure.metricId);
  const artifact = getOwn(artifacts.metrics, measure.metricId);
  if (metric === undefined || artifact === undefined) {
    throw new Error(
      `model metric ${measure.metricId} is missing from ${model.title} or did not compile`,
    );
  }
  return {
    kind: "expression",
    id: measure.metricId,
    label: measure.label,
    code: metric.code,
    artifact,
    sampleRuns: "all",
    runOutput: { type: "distribution", binning: "exact" },
  };
};
