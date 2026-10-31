import { v4 as generateUuid } from "uuid";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  sanitizeSDCPNForExtensions,
} from "../extensions";
import { compileHirArtifacts } from "../hir";
import { resolveNetParameterValues } from "../parameter-values";
import { getOwn } from "../validation/record-keys";
import { buildSimulation } from "./engine/build-simulation";
import { applyDynamics, computeNextFrame } from "./engine/compute-next-frame";
import { computePossibleTransition } from "./engine/compute-possible-transition";
import { readTokenRecord } from "./engine/token-layout";
import { createHirMetricEvaluator } from "./frames/hir-metric";
import {
  materializeEngineFrame,
  readEngineFrame,
} from "./frames/internal-frame";

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
import type { TransitionOutcome } from "./engine/execute-transitions";
import type { SimulationInstance } from "./engine/types";
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

/**
 * Transitions a controller decides between. They never fire by their own
 * lambda. A controlled run asks for a choice whenever one of them could fire.
 */
export type PetrinautChoiceLever = {
  id: string;
  transitionIds: readonly string[];
  /** Whether the controller may fire none of them when some could fire. */
  allowWait?: boolean;
};

export type PetrinautControlledRunConfig = PetrinautRunConfig & {
  levers: readonly PetrinautChoiceLever[];
  /** Metric ids or names to integrate over simulation time. */
  integrate?: readonly string[];
};

/**
 * Where a controlled run stopped: a lever waiting for a decision, or the end.
 *
 * `fireable` lists the lever's transitions that would fire if chosen: their
 * arcs, capacities and lambdas all allow it on the frame they would fire on.
 */
export type PetrinautControlPoint =
  | {
      kind: "decision";
      lever: PetrinautChoiceLever;
      fireable: readonly string[];
      time: number;
      step: number;
    }
  | {
      kind: "end";
      reason: PetrinautRunCompletionReason;
      time: number;
      step: number;
    };

/**
 * A controller's answer to a decision.
 *
 * - `fire`: fire this transition, which must be fireable. It consumes the
 *   first combination of input tokens, in token order, whose lambda allows
 *   firing. `outcome` sets
 *   fields of the tokens it adds, keyed by output place id, then field name,
 *   overwriting what its kernel wrote; only number and boolean fields can be
 *   set.
 * - `wait`: fire none of the lever's transitions now (only for levers that
 *   allow waiting). `true` asks again at the next frame where one can fire;
 *   `{ for: duration }` asks again once that much simulation time has passed.
 */
export type PetrinautDecision =
  | {
      fire: string;
      outcome?: Readonly<
        Record<string, Readonly<Record<string, number | boolean>>>
      >;
    }
  | { wait: true | { for: number } };

/**
 * A run that pauses whenever a lever has a transition that could fire, and
 * resumes when the caller decides.
 *
 * Before each frame, every lever with a fireable transition asks for a
 * decision, one lever at a time. The chosen transitions then fire first in
 * the frame, in definition order; a choice that an earlier choice in the same
 * frame has made unfireable does not fire. A run is reproducible from its seed
 * and the sequence of decisions.
 *
 * A controller decides when a controlled transition fires, in place of the
 * timing its rate gives, but not whether it can: a transition is fireable
 * when it is enabled and its predicate is true or its rate positive. This is
 * judged after the frame's continuous dynamics, where chosen transitions
 * fire, so it can depend on token values the controller has not yet seen.
 */
export type PetrinautControlledRun = {
  readonly point: PetrinautControlPoint;
  /** Answers the current decision, and runs to the next decision or the end. */
  decide(this: void, decision: PetrinautDecision): PetrinautControlPoint;
  /** The current frame. */
  frame(this: void): SimulationFrameReader;
  /** The run's `metrics`, evaluated on the current frame and keyed by name. */
  metrics(this: void): Record<string, number>;
  /**
   * Metric values integrated over simulation time so far, keyed by metric
   * name: the sum over completed frames of the metric at the frame's start
   * times the frame's duration.
   */
  integrals(this: void): Record<string, number>;
  /**
   * An independent copy of the run at this point. It keeps the run's random
   * state, so answering both the same way plays both out the same way, unless
   * `seed` gives it a random state of its own.
   */
  fork(this: void, seed?: number): PetrinautControlledRun;
};

export type PetrinautCompiledModel = {
  readonly metadata: PetrinautCompiledModelMetadata;
  /**
   * The sanitized SDCPN and its compiled HIR artifacts, as `run` uses them.
   *
   * Exposed so a caller can hand the same pair to `createMonteCarloExperiment`
   * (optimization replicates run as one experiment) without recompiling or
   * re-deriving the sanitization.
   */
  readonly sdcpn: SDCPN;
  readonly hirArtifacts: HirArtifacts;
  run(this: void, config: PetrinautRunConfig): PetrinautRunResult;
  /** Starts a run that pauses for decisions; see `PetrinautControlledRun`. */
  startControlledRun(
    this: void,
    config: PetrinautControlledRunConfig,
  ): PetrinautControlledRun;
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
    if (!getOwn(artifacts.metrics, metric.id)) {
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
    const artifact = getOwn(artifacts.metrics, metric.id);
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

function resolveRunLimits(config: {
  seed?: number;
  dt?: number;
  maxTime?: number | null;
  maxSteps?: number;
}) {
  const seed = config.seed ?? generateSeed();
  const dt = config.dt ?? 1;
  const maxTime = config.maxTime ?? null;
  const maxSteps = config.maxSteps;
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
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 0)) {
    throw new Error("Run config maxSteps must be a non-negative integer");
  }
  return { seed, dt, maxTime, maxSteps };
}

function timesAreEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}

type PendingLever = { lever: PetrinautChoiceLever; fireable: string[] };

/** What a controlled run holds between decisions; `fork` copies it. */
type ControlledRunState = {
  simulation: SimulationInstance;
  steps: number;
  completionReason: PetrinautRunCompletionReason | null;
  chosen: ReadonlySet<string>;
  outcomes: ReadonlyMap<string, TransitionOutcome>;
  pending: readonly PendingLever[] | null;
  resumeAt: ReadonlyMap<string, number>;
  integrals: Readonly<Record<string, number>>;
};

function createControlledRun(args: {
  simulation: SimulationInstance;
  levers: readonly PetrinautChoiceLever[];
  maxTime: number | null;
  maxSteps: number | undefined;
  evaluateMetrics: (frame: SimulationFrameReader) => Record<string, number>;
  evaluateIntegrands: (frame: SimulationFrameReader) => Record<string, number>;
  /** The state of the run being forked, for `fork`. */
  forkOf?: ControlledRunState;
}): PetrinautControlledRun {
  const { levers, maxTime, maxSteps, forkOf } = args;
  let simulation = forkOf?.simulation ?? args.simulation;
  const dt = simulation.dt;

  const controlled = new Set<string>();
  for (const lever of levers) {
    for (const transitionId of lever.transitionIds) {
      if (!simulation.transitions.has(transitionId)) {
        throw new Error(
          `Lever "${lever.id}" names transition "${transitionId}", which is not in the model`,
        );
      }
      if (controlled.has(transitionId)) {
        throw new Error(
          `Transition "${transitionId}" belongs to more than one lever`,
        );
      }
      controlled.add(transitionId);
    }
  }

  let steps = forkOf?.steps ?? 0;
  let completionReason: PetrinautRunCompletionReason | null = forkOf
    ? forkOf.completionReason
    : maxTime !== null && maxTime <= simulation.currentTime
      ? "maxTime"
      : null;
  let chosen = new Set(forkOf?.chosen);
  let outcomes = new Map(forkOf?.outcomes);
  let pending: PendingLever[] | null = forkOf?.pending
    ? [...forkOf.pending]
    : null;
  /** Simulation times before which waiting levers are not asked again. */
  const resumeAt = new Map(forkOf?.resumeAt);
  const integrals: Record<string, number> = { ...forkOf?.integrals };

  const currentFrame = (): SimulationFrameReader =>
    createFrameReader({
      layout: simulation.frameLayout,
      frame: simulation.frames[0]!,
      number: steps,
      time: simulation.currentTime,
      places: simulation.places,
      stringPool: simulation.stringPool,
    });

  /** The duration of the next frame: `dt`, or less to end at `maxTime`. */
  const frameDt = () =>
    maxTime === null ? dt : Math.min(dt, maxTime - simulation.currentTime);

  // Evaluating a transition as chosen on the frame after the next frame's
  // dynamics, where chosen transitions fire, and discarding the result and RNG
  // state, says whether it would fire if chosen.
  const liveLevers = () => {
    const stepping = { ...simulation, dt: frameDt() };
    const frameAfterDynamics = applyDynamics(stepping, simulation.frames[0]!);
    const snapshot = materializeEngineFrame(
      stepping.frameLayout,
      frameAfterDynamics,
    );
    return levers.flatMap((lever) => {
      const until = resumeAt.get(lever.id);
      if (
        until !== undefined &&
        simulation.currentTime < until &&
        !timesAreEqual(simulation.currentTime, until)
      ) {
        return [];
      }
      resumeAt.delete(lever.id);
      const fireable = lever.transitionIds.filter(
        (transitionId) =>
          computePossibleTransition(
            frameAfterDynamics,
            stepping,
            transitionId,
            simulation.rngState,
            true,
            null,
            snapshot,
          ).firing !== null,
      );
      return fireable.length > 0 ? [{ lever, fireable }] : [];
    });
  };

  /** The decision's outcome as field values the engine writes. */
  const resolveOutcome = (
    transitionId: string,
    outcome: NonNullable<
      Extract<PetrinautDecision, { fire: string }>["outcome"]
    >,
  ): TransitionOutcome => {
    const transition = simulation.compiledTransitions.get(transitionId)!;
    return Object.fromEntries(
      Object.entries(outcome).map(([placeId, values]) => {
        const fields = transition.outputPlaces.find(
          (place) => place.placeId === placeId,
        )?.tokenLayout?.fields;
        if (!fields) {
          throw new Error(
            `Transition "${transitionId}" adds no coloured tokens to place "${placeId}"`,
          );
        }
        return [
          placeId,
          Object.fromEntries(
            Object.entries(values).map(([name, value]) => {
              const field = fields.find(
                (candidate) => candidate.element.name === name,
              );
              if (!field || (field.kind !== "f64" && field.kind !== "u8")) {
                throw new Error(
                  `Place "${placeId}" has no number or boolean field "${name}"`,
                );
              }
              const encoded = Number(value);
              if (!Number.isFinite(encoded)) {
                throw new Error(`Field "${name}" must be finite, not ${value}`);
              }
              return [name, encoded];
            }),
          ),
        ];
      }),
    );
  };

  const step = () => {
    const duration = frameDt();
    for (const [name, value] of Object.entries(
      args.evaluateIntegrands(currentFrame()),
    )) {
      integrals[name] = (integrals[name] ?? 0) + value * duration;
    }

    const result = computeNextFrame(
      { ...simulation, dt: duration },
      { controlled, chosen, outcomes },
    );
    simulation = {
      ...result.simulation,
      dt,
      frames: [result.simulation.frames[result.simulation.currentFrameNumber]!],
      currentFrameNumber: 0,
    };
    completionReason = result.completionReason;
    if (maxTime !== null && timesAreEqual(simulation.currentTime, maxTime)) {
      simulation = { ...simulation, currentTime: maxTime };
      completionReason = "maxTime";
    }
    steps++;
    chosen = new Set();
    outcomes = new Map();
    pending = null;
  };

  const advance = (): PetrinautControlPoint => {
    for (;;) {
      if (
        completionReason === null &&
        maxSteps !== undefined &&
        steps >= maxSteps
      ) {
        completionReason = "maxSteps";
      }
      if (completionReason !== null) {
        return {
          kind: "end",
          reason: completionReason,
          time: simulation.currentTime,
          step: steps,
        };
      }
      pending ??= liveLevers();
      const next = pending[0];
      if (next) {
        return {
          kind: "decision",
          lever: next.lever,
          fireable: next.fireable,
          time: simulation.currentTime,
          step: steps,
        };
      }
      step();
    }
  };

  let point = advance();

  return {
    get point() {
      return point;
    },
    decide(decision) {
      const next = pending?.[0];
      if (point.kind !== "decision" || !next) {
        throw new Error("The run is not waiting for a decision");
      }
      const { lever, fireable } = next;
      if ("wait" in decision) {
        if (!lever.allowWait) {
          throw new Error(`Lever "${lever.id}" does not allow waiting`);
        }
        if (decision.wait !== true) {
          const duration = decision.wait.for;
          if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error("A wait must be for a finite positive duration");
          }
          resumeAt.set(lever.id, simulation.currentTime + duration);
        }
      } else {
        if (!fireable.includes(decision.fire)) {
          throw new Error(
            `Transition "${decision.fire}" of lever "${lever.id}" cannot fire now`,
          );
        }
        if (decision.outcome) {
          outcomes.set(
            decision.fire,
            resolveOutcome(decision.fire, decision.outcome),
          );
        }
        chosen.add(decision.fire);
      }
      pending!.shift();
      point = advance();
      return point;
    },
    frame: currentFrame,
    metrics: () => args.evaluateMetrics(currentFrame()),
    integrals: () => ({ ...integrals }),
    fork: (seed) =>
      createControlledRun({
        ...args,
        forkOf: {
          simulation: {
            ...simulation,
            ...(seed === undefined ? {} : { rngState: seed }),
          },
          steps,
          completionReason,
          chosen,
          outcomes,
          pending,
          resumeAt,
          integrals,
        },
      }),
  };
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
    sdcpn,
    hirArtifacts: artifacts,
    run(runConfig) {
      const runtimeConfig: Partial<PetrinautRunOptions> & {
        maxTime?: number | null;
        maxSteps?: number;
      } = (runConfig as PetrinautRunConfig | undefined) ?? {};
      const { seed, dt, maxTime, maxSteps } = resolveRunLimits(runtimeConfig);

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
    startControlledRun(controlledRunConfig) {
      const { seed, dt, maxTime, maxSteps } =
        resolveRunLimits(controlledRunConfig);
      const parameterValues = resolveNetParameterValues(
        sdcpn.parameters,
        controlledRunConfig.parameterValues ?? {},
        extensions.parameters,
      );
      const metrics = resolveMetrics({
        sdcpn,
        artifacts,
        metricNamesOrIds: controlledRunConfig.metrics ?? [],
        parameterValues,
      });
      const integrands = resolveMetrics({
        sdcpn,
        artifacts,
        metricNamesOrIds: controlledRunConfig.integrate ?? [],
        parameterValues,
      });

      return createControlledRun({
        simulation: buildSimulation({
          sdcpn,
          extensions,
          initialMarking: controlledRunConfig.initialMarking ?? {},
          parameterValues: controlledRunConfig.parameterValues ?? {},
          seed,
          dt,
          maxTime,
          hirArtifacts: artifacts,
        }),
        levers: controlledRunConfig.levers,
        maxTime,
        maxSteps,
        evaluateMetrics: (frame) => evaluateMetrics(metrics, frame),
        evaluateIntegrands: (frame) => evaluateMetrics(integrands, frame),
      });
    },
  };
}
