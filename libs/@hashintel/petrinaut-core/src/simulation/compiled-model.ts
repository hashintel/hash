import { v4 as generateUuid } from "uuid";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  sanitizeSDCPNForExtensions,
} from "../extensions";
import { compileHirArtifacts } from "../hir";
import { resolveNetParameterValues } from "../parameter-values";
import { buildSimulation } from "./engine/build-simulation";
import { computeNextFrame } from "./engine/compute-next-frame";
import { readTokenRecord } from "./engine/token-layout";
import { createHirMetricEvaluator } from "./frames/hir-metric";
import { readEngineFrame } from "./frames/internal-frame";

import type { PetrinautExtensionSettings } from "../extensions";
import type { HirArtifacts } from "../hir-runtime";
import type { DefaultParameterValues } from "../parameter-values";
import type { Color, Metric, Place, SDCPN, TokenRecord } from "../types/sdcpn";
import type {
  InitialMarking,
  SimulationFrameReader,
  SimulationFrameState,
} from "./api";
import type { SimulationCompletionReason } from "./engine/compute-next-frame";
import type { EngineFrame, EngineFrameLayout } from "./frames/internal-frame";

export type PetrinautRunCompletionReason =
  | SimulationCompletionReason
  | "maxSteps";

export type PetrinautCompiledModelParameterMetadata = {
  id: string;
  name: string;
  variableName: string;
  type: "real" | "integer" | "boolean";
  defaultValue: string;
  valueRange: null;
};

export type PetrinautCompiledModelPlaceMetadata = {
  id: string;
  name: string;
  index: number;
  color: {
    id: string;
    name: string;
    elements: {
      elementId: string;
      name: string;
      type: Color["elements"][number]["type"];
      valueRange: null;
    }[];
  } | null;
};

export type PetrinautCompiledModelMetricMetadata = {
  id: string;
  name: string;
  description?: string;
  optimizationObjective: null;
};

export type PetrinautCompiledModelMetadata = {
  parameters: PetrinautCompiledModelParameterMetadata[];
  places: PetrinautCompiledModelPlaceMetadata[];
  metrics: PetrinautCompiledModelMetricMetadata[];
};

type PetrinautRunOptions = {
  initialMarking?: InitialMarking;
  parameterValues?: Record<string, string>;
  seed?: number;
  dt?: number;
  /** Metric ids or names to evaluate on the final frame. */
  metrics?: readonly string[];
};

export type PetrinautRunConfig = PetrinautRunOptions &
  (
    | {
        /** Number of simulation steps to execute. Stops before `maxTime` if lower. */
        maxSteps: number;
        maxTime?: number | null;
      }
    | {
        maxTime: number;
        /** Number of simulation steps to execute. Stops before `maxTime` if lower. */
        maxSteps?: number;
      }
  );

export type PetrinautRunResult = {
  seed: number;
  status: "complete";
  completionReason: PetrinautRunCompletionReason;
  frameCount: number;
  finalTime: number;
  finalPlaceTokenCounts: Record<string, number>;
  metrics: Record<string, number>;
};

export type PetrinautCompiledModel = {
  readonly metadata: PetrinautCompiledModelMetadata;
  run(this: void, config: PetrinautRunConfig): PetrinautRunResult;
};

export type CompilePetrinautModelConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  hirArtifacts?: HirArtifacts;
};

const MAX_SEED = 2_147_483_647;

function generateSeed(): number {
  const randomWord = Number.parseInt(generateUuid().slice(0, 8), 16);
  return (randomWord % MAX_SEED) + 1;
}

function validateMetricIdentities(sdcpn: SDCPN): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const metric of sdcpn.metrics ?? []) {
    if (ids.has(metric.id)) {
      throw new Error(`Model metric ids must be unique: "${metric.id}"`);
    }
    if (names.has(metric.name)) {
      throw new Error(
        `Model metric names must be unique because run results are keyed by name: "${metric.name}"`,
      );
    }
    ids.add(metric.id);
    names.add(metric.name);
  }
}

function validateCompiledMetrics(sdcpn: SDCPN, artifacts: HirArtifacts): void {
  for (const metric of sdcpn.metrics ?? []) {
    if (!artifacts.metrics[metric.id]) {
      throw new Error(
        `Metric "${metric.name}" has not been compiled. Check the model's metric diagnostics.`,
      );
    }
  }
}

function createMetadata(sdcpn: SDCPN): PetrinautCompiledModelMetadata {
  const colorsById = new Map(sdcpn.types.map((color) => [color.id, color]));

  return {
    parameters: sdcpn.parameters.map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      variableName: parameter.variableName,
      type: parameter.type,
      defaultValue: parameter.defaultValue,
      valueRange: null,
    })),
    places: sdcpn.places.map((place, index) => {
      const color = place.colorId ? colorsById.get(place.colorId) : undefined;

      return {
        id: place.id,
        name: place.name,
        index,
        color: color
          ? {
              id: color.id,
              name: color.name,
              elements: color.elements.map((element) => ({
                elementId: element.elementId,
                name: element.name,
                type: element.type,
                valueRange: null,
              })),
            }
          : null,
      };
    }),
    metrics: (sdcpn.metrics ?? []).map((metric) => ({
      id: metric.id,
      name: metric.name,
      ...(metric.description !== undefined
        ? { description: metric.description }
        : {}),
      optimizationObjective: null,
    })),
  };
}

function findMetric(sdcpn: SDCPN, metricNameOrId: string): Metric {
  const metric = (sdcpn.metrics ?? []).find(
    (candidate) =>
      candidate.id === metricNameOrId || candidate.name === metricNameOrId,
  );
  if (!metric) {
    throw new Error(`Metric "${metricNameOrId}" does not exist in the model`);
  }

  return metric;
}

function createFrameReader(args: {
  layout: EngineFrameLayout;
  frame: EngineFrame;
  number: number;
  time: number;
  places: ReadonlyMap<string, Place>;
  stringPool: { get(id: number): string };
}): SimulationFrameReader {
  const { layout, frame, number, time, places, stringPool } = args;
  const frameView = readEngineFrame(layout, frame);

  return {
    number,
    time,
    getPlaceTokenCount(placeId) {
      return frameView.getPlaceState(placeId)?.count ?? 0;
    },
    getRawView() {
      return {
        ...frameView.tokenViews,
        placeCounts: frameView.placeCounts,
        placeOffsets: frameView.placeByteOffsets,
        placeIndexById: layout.placeIndexById,
        stringPool,
      };
    },
    getPlaceTokens(place) {
      const placeState = frameView.getPlaceState(place.id);
      const placeIndex = layout.placeIndexById.get(place.id);
      const tokenLayout =
        placeIndex === undefined ? null : layout.placeTokenLayouts[placeIndex];
      if (!placeState || !tokenLayout || placeState.count === 0) {
        return [];
      }

      const tokens: TokenRecord[] = [];
      for (let tokenIndex = 0; tokenIndex < placeState.count; tokenIndex++) {
        tokens.push(
          readTokenRecord(
            tokenLayout,
            frameView.tokenViews,
            placeState.byteOffset + tokenIndex * placeState.strideBytes,
            stringPool,
          ),
        );
      }

      return tokens;
    },
    getTransitionState(transitionId) {
      return frameView.getTransitionState(transitionId);
    },
    toFrameState() {
      const framePlaces: SimulationFrameState["places"] = {};
      for (const [placeId, placeData] of frameView.getPlaceEntries()) {
        if (!places.has(placeId)) {
          continue;
        }
        framePlaces[placeId] = { tokenCount: placeData.count };
      }

      return {
        number,
        places: framePlaces,
      };
    },
  };
}

type ResolvedMetric = {
  metric: Metric;
  evaluate: ReturnType<typeof createHirMetricEvaluator>;
};

function resolveMetrics(args: {
  sdcpn: SDCPN;
  artifacts: HirArtifacts;
  metricNamesOrIds: readonly string[];
  parameterValues: DefaultParameterValues;
}): ResolvedMetric[] {
  const { sdcpn, artifacts, metricNamesOrIds, parameterValues } = args;

  return metricNamesOrIds.map((metricNameOrId) => {
    const metric = findMetric(sdcpn, metricNameOrId);
    const artifact = artifacts.metrics[metric.id];
    if (!artifact) {
      throw new Error(
        `Metric "${metric.name}" has not been compiled. Check the model's metric diagnostics.`,
      );
    }

    return {
      metric,
      evaluate: createHirMetricEvaluator({
        metricName: metric.name,
        artifact,
        places: sdcpn.places,
        parameterValues,
      }),
    };
  });
}

function evaluateMetrics(
  metrics: readonly ResolvedMetric[],
  frame: SimulationFrameReader,
): Record<string, number> {
  return Object.fromEntries(
    metrics.map(({ metric, evaluate }) => [metric.name, evaluate(frame)]),
  );
}

function timesAreEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}

/**
 * Compiles a Petrinaut model once and returns a reusable runner.
 *
 * The first implementation caches the SDCPN snapshot and HIR artifacts. Each
 * run still creates fresh per-run engine state, which keeps parameter values,
 * initial marking, string pool and seeded RNG isolated.
 */
export function compilePetrinautModel(
  config: CompilePetrinautModelConfig,
): PetrinautCompiledModel {
  const extensions = config.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const sdcpn = sanitizeSDCPNForExtensions(config.sdcpn, extensions);
  validateMetricIdentities(sdcpn);
  const compiled = config.hirArtifacts
    ? { artifacts: config.hirArtifacts, failures: [] }
    : compileHirArtifacts(sdcpn, extensions);
  const { artifacts, failures } = compiled;

  if (failures.length > 0) {
    const details = failures
      .map((failure) => {
        const messages = failure.diagnostics
          .map((diagnostic) => diagnostic.message)
          .join("; ");
        return `${failure.itemType} ${failure.itemId}: ${messages}`;
      })
      .join("\n");
    throw new Error(`Model HIR compilation failed:\n${details}`);
  }

  validateCompiledMetrics(sdcpn, artifacts);

  // Instantiate the engine once before advertising readiness. This catches
  // invalid model references and stale supplied HIR artifacts at startup.
  buildSimulation({
    sdcpn,
    extensions,
    initialMarking: {},
    parameterValues: {},
    seed: 1,
    dt: 1,
    maxTime: 0,
    hirArtifacts: artifacts,
  });

  const metadata = createMetadata(sdcpn);

  return {
    metadata,
    run(runConfig) {
      const runtimeConfig: Partial<PetrinautRunOptions> & {
        maxTime?: number | null;
        maxSteps?: number;
      } = (runConfig as PetrinautRunConfig | undefined) ?? {};
      const seed = runtimeConfig.seed ?? generateSeed();
      const dt = runtimeConfig.dt ?? 1;
      const maxTime = runtimeConfig.maxTime ?? null;
      const maxSteps = runtimeConfig.maxSteps;
      if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
        throw new Error(
          `Run config seed must be an integer between 0 and ${MAX_SEED}`,
        );
      }
      if (maxTime === null && maxSteps === undefined) {
        throw new Error("Run config requires either maxTime or maxSteps");
      }
      if (maxTime !== null && (!Number.isFinite(maxTime) || maxTime < 0)) {
        throw new Error(
          "Run config maxTime must be a finite non-negative number or null",
        );
      }
      if (!Number.isFinite(dt) || dt <= 0) {
        throw new Error("Run config dt must be a finite positive number");
      }
      if (
        maxSteps !== undefined &&
        (!Number.isInteger(maxSteps) || maxSteps < 0)
      ) {
        throw new Error("Run config maxSteps must be a non-negative integer");
      }

      const metrics = resolveMetrics({
        sdcpn,
        artifacts,
        metricNamesOrIds: runtimeConfig.metrics ?? [],
        parameterValues: resolveNetParameterValues(
          sdcpn.parameters,
          runtimeConfig.parameterValues ?? {},
          extensions.parameters,
        ),
      });

      let simulation = buildSimulation({
        sdcpn,
        extensions,
        initialMarking: runtimeConfig.initialMarking ?? {},
        parameterValues: runtimeConfig.parameterValues ?? {},
        seed,
        dt,
        maxTime,
        hirArtifacts: artifacts,
      });

      let completionReason: PetrinautRunCompletionReason | null =
        maxTime !== null && maxTime <= simulation.currentTime
          ? "maxTime"
          : null;
      let steps = 0;
      while (completionReason === null) {
        if (maxSteps !== undefined && steps >= maxSteps) {
          completionReason = "maxSteps";
          break;
        }

        if (maxTime !== null) {
          const remainingTime = maxTime - simulation.currentTime;
          if (
            remainingTime < 0 ||
            timesAreEqual(simulation.currentTime, maxTime)
          ) {
            simulation = { ...simulation, currentTime: maxTime };
            completionReason = "maxTime";
            break;
          }
          simulation = {
            ...simulation,
            dt: Math.min(dt, remainingTime),
          };
        }

        const result = computeNextFrame(simulation);
        const currentFrame =
          result.simulation.frames[result.simulation.currentFrameNumber];
        if (!currentFrame) {
          throw new Error("Simulation produced no current frame");
        }
        simulation = {
          ...result.simulation,
          dt,
          frames: [currentFrame],
          currentFrameNumber: 0,
        };
        completionReason = result.completionReason;
        if (
          maxTime !== null &&
          timesAreEqual(simulation.currentTime, maxTime)
        ) {
          simulation = { ...simulation, currentTime: maxTime };
          completionReason = "maxTime";
        }
        steps++;
      }

      const finalFrame = simulation.frames[0];
      if (!finalFrame) {
        throw new Error("Simulation produced no final frame");
      }

      const places = new Map(simulation.places);
      const finalFrameReader = createFrameReader({
        layout: simulation.frameLayout,
        frame: finalFrame,
        number: steps,
        time: simulation.currentTime,
        places,
        stringPool: simulation.stringPool,
      });

      const finalPlaceTokenCounts = Object.fromEntries(
        metadata.places.map((place) => [
          place.id,
          finalFrameReader.getPlaceTokenCount(place.id),
        ]),
      );

      return {
        seed,
        status: "complete",
        completionReason,
        frameCount: steps + 1,
        finalTime: simulation.currentTime,
        finalPlaceTokenCounts,
        metrics: evaluateMetrics(metrics, finalFrameReader),
      };
    },
  };
}
