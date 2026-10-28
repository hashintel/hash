/**
 * @layerRoot core.wasm
 * @role Rust simulation and runtime Wasm compilation of scalar HIR programs
 */
import {
  simulation_abi_version,
  simulation_buffer,
  simulation_create,
  simulation_free,
} from "../../rust/pkg/petrinaut_core.js";
import { resolveNetParameterValues } from "../parameter-values";
import { initializeRust } from "../rust/initialize";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../simulation/monte-carlo/metrics";
import { deriveRunSeed } from "../simulation/monte-carlo/run-state";
import { getMaxFrameNumber } from "../simulation/monte-carlo/time";
import { getWasmHost } from "./host";
import { prepareWasmModel } from "./prepare-model";

import type { PetrinautWasmInput } from "../rust/initialize";
import type { SimulationFrameReader } from "../simulation/api";
import type {
  MonteCarloAdvanceResult,
  MonteCarloRunSummary,
  MonteCarloSimulator,
} from "../simulation/monte-carlo/types";
import type { MonteCarloInitMessage } from "../simulation/monte-carlo/worker/messages";
import type { WasmMemory } from "./host";

const modules = new Map<string, Promise<object>>();

const compileModule = (bytes: Uint8Array<ArrayBuffer>): Promise<object> => {
  const host = getWasmHost();
  if (!host) {
    throw new Error("WebAssembly is unavailable in this host.");
  }
  const key = bytes.join(",");
  const existing = modules.get(key);
  if (existing) {
    return existing;
  }
  if (modules.size >= 8) {
    modules.delete(modules.keys().next().value!);
  }
  const pending = host.compile(bytes).catch((error: unknown) => {
    modules.delete(key);
    throw error;
  });
  modules.set(key, pending);
  return pending;
};

export const createWasmSimulation = async (
  message: MonteCarloInitMessage,
  wasm?: PetrinautWasmInput,
) => {
  const model = prepareWasmModel(message);
  const { sdcpn } = model;
  const maxFrames = getMaxFrameNumber(message.maxTime, message.dt);
  if (
    !Number.isFinite(message.dt) ||
    message.dt <= 0 ||
    !Number.isInteger(maxFrames) ||
    maxFrames < 0 ||
    maxFrames > 0xffffffff ||
    !Number.isInteger(message.runCount) ||
    message.runCount < 1
  ) {
    throw new Error(
      "Wasm experiments require positive dt and run count, and a finite duration of at most 4294967295 frames.",
    );
  }
  if (message.runs && message.runs.length !== message.runCount) {
    throw new Error("Per-run overrides must match the run count.");
  }
  const runtime = await initializeRust(wasm);
  if (simulation_abi_version() !== 1) {
    throw new Error("Wasm simulation ABI version must be 1.");
  }
  const module = await compileModule(model.bytes);
  const instance = await getWasmHost()!.instantiate(module, { runtime });
  const memory = runtime.memory as WasmMemory;
  const advance = instance.exports.advance as (
    id: number,
    pointer: number,
  ) => number;
  const countsOffset = sdcpn.parameters.length;
  const flagsOffset = countsOffset + sdcpn.places.length;
  const totalsOffset = flagsOffset + sdcpn.transitions.length;
  const elapsedOffset = totalsOffset + sdcpn.transitions.length;
  const metadataOffset = elapsedOffset + sdcpn.transitions.length;
  const placeIndices = new Map(
    sdcpn.places.map((place, index) => [place.id, index]),
  );
  const transitionIndices = new Map(
    sdcpn.transitions.map((transition, index) => [transition.id, index]),
  );
  const runs: {
    id: number;
    pointer: number;
    seed: number;
    parameters: Record<string, number | boolean>;
  }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const run of runs) {
      simulation_free(run.id);
    }
  };
  try {
    for (let index = 0; index < message.runCount; index++) {
      const overrides = message.runs?.[index];
      const parameters = resolveNetParameterValues(
        sdcpn.parameters,
        { ...message.parameterValues, ...overrides?.parameterValues },
        model.extensions.parameters,
      );
      const marking = overrides?.initialMarking ?? message.initialMarking;
      const counts = sdcpn.places.map((place) => {
        const count = marking[place.id] ?? 0;
        if (
          typeof count !== "number" ||
          !Number.isInteger(count) ||
          count < 0 ||
          count > 0xffffffff
        ) {
          throw new Error(
            `Place ${place.name} requires an initial count between 0 and 4294967295.`,
          );
        }
        return count;
      });
      const seed =
        overrides?.seed ??
        deriveRunSeed(message.seed, (message.runIndexOffset ?? 0) + index);
      if (!Number.isInteger(seed) || seed < 0 || seed > 0x7fffffff) {
        throw new Error(
          "Wasm simulation seeds must be integers between 0 and 2147483647.",
        );
      }
      const id = simulation_create(
        JSON.stringify({
          parameters: sdcpn.parameters.map((parameter) =>
            Number(parameters[parameter.variableName]),
          ),
          counts,
          capacities: sdcpn.places.map((place) => place.capacity ?? null),
          transitions: model.transitions,
          dt: message.dt,
          maxFrames,
          seed,
        }),
      );
      runs.push({ id, pointer: simulation_buffer(id), seed, parameters });
    }
    const values = (index: number) => {
      if (disposed) {
        throw new Error("Wasm simulation has been disposed.");
      }
      const run = runs[index];
      if (!run) {
        throw new Error(`Monte Carlo run ${index} does not exist.`);
      }
      // Another run can grow memory; views must use its latest backing buffer.
      return new Float64Array(memory.buffer, run.pointer, metadataOffset + 3);
    };
    const getRunSummary = (index: number): MonteCarloRunSummary => {
      const data = values(index);
      const frameNumber = data[metadataOffset]!;
      const status = data[metadataOffset + 1]!;
      return {
        index,
        status:
          status === 0
            ? "ready"
            : status === 1
              ? "running"
              : status === 4
                ? "error"
                : "complete",
        seed: runs[index]!.seed,
        frameNumber,
        currentTime: frameNumber * message.dt,
        rngState: data[metadataOffset + 2]!,
        parameterValues: { ...runs[index]!.parameters },
        completionReason:
          status === 2 ? "maxTime" : status === 3 ? "deadlock" : null,
        error:
          status === 4 ? "Wasm place count exceeds 4294967295 tokens." : null,
        tokenByteCount: 0,
        tokenByteCapacity: 0,
        reallocations: 0,
      };
    };
    const frameReader = (index: number): SimulationFrameReader => {
      const data = values(index);
      const number = data[metadataOffset]!;
      const getPlaceTokenCount = (id: string) => {
        const place = placeIndices.get(id);
        return place === undefined ? 0 : data[countsOffset + place]!;
      };
      return {
        number,
        time: number * message.dt,
        getPlaceTokenCount,
        getPlaceTokens: () => [],
        getTransitionState: (id) => {
          const transition = transitionIndices.get(id);
          return transition === undefined
            ? null
            : {
                firedInThisFrame: data[flagsOffset + transition] === 1,
                firingCount: data[totalsOffset + transition]!,
                timeSinceLastFiringMs:
                  data[elapsedOffset + transition]! * message.dt * 1000,
              };
        },
        toFrameState: () => ({
          number,
          places: Object.fromEntries(
            sdcpn.places.map((place) => [
              place.id,
              { tokenCount: getPlaceTokenCount(place.id) },
            ]),
          ),
        }),
      };
    };
    let expressionIndex = 0;
    const userMetrics = (message.metricSpecs ?? []).map((spec) => {
      if (spec.kind !== "expression") {
        return createMonteCarloUserDefinedMetric(
          createMonteCarloUserDefinedMetricConfigsFromSpecs([spec], sdcpn)[0]!,
        );
      }
      const evaluate = instance.exports[`metric${expressionIndex++}`] as (
        pointer: number,
      ) => number;
      return createMonteCarloUserDefinedMetric({
        ...spec,
        measure: ({ runIndex }) => evaluate(runs[runIndex]!.pointer),
      });
    });
    let frameNumber = 0;
    const summarize = (advancedRuns: number): MonteCarloAdvanceResult => {
      let completedRuns = 0;
      let erroredRuns = 0;
      for (let index = 0; index < runs.length; index++) {
        const status = values(index)[metadataOffset + 1]!;
        if (status === 2 || status === 3) {
          completedRuns++;
        }
        if (status === 4) {
          erroredRuns++;
        }
      }
      const activeRuns = runs.length - completedRuns - erroredRuns;
      return {
        advancedRuns,
        completedRuns,
        erroredRuns,
        activeRuns,
        allFinished: activeRuns === 0,
      };
    };
    const observe = () => {
      const summary = summarize(0);
      for (const metric of userMetrics) {
        metric.observeFrame({
          frameNumber,
          time: frameNumber * message.dt,
          runCount: runs.length,
          activeRunCount: summary.activeRuns,
          completedRunCount: summary.completedRuns,
          erroredRunCount: summary.erroredRuns,
          placeIds: sdcpn.places.map((place) => place.id),
          placeNames: sdcpn.places.map((place) => place.name),
          forEachActiveRunPlaceCounts: (visitor) => {
            for (let index = 0; index < runs.length; index++) {
              const data = values(index);
              if (data[metadataOffset + 1]! < 2) {
                visitor(
                  index,
                  Uint32Array.from(data.subarray(countsOffset, flagsOffset)),
                );
              }
            }
          },
          forEachRunFrame: (visitor) => {
            for (let index = 0; index < runs.length; index++) {
              visitor({
                runIndex: index,
                status: getRunSummary(index).status,
                frame: frameReader(index),
              });
            }
          },
        });
      }
    };
    const advanceAll = () => {
      if (disposed) {
        throw new Error("Wasm simulation has been disposed.");
      }
      let advancedRuns = 0;
      for (const run of runs) {
        advancedRuns += advance(run.id, run.pointer);
      }
      if (advancedRuns > 0) {
        frameNumber++;
        observe();
      }
      return summarize(advancedRuns);
    };
    const simulator: MonteCarloSimulator = {
      runCount: runs.length,
      advanceAll,
      dispose,
      getRunSummary,
      getSummaries: () => runs.map((_, index) => getRunSummary(index)),
      getRunSnapshot: (index) => ({
        ...getRunSummary(index),
        placeTokenCounts: Object.fromEntries(
          sdcpn.places.map((place) => [
            place.id,
            frameReader(index).getPlaceTokenCount(place.id),
          ]),
        ),
      }),
      runUntilComplete: (options = {}) => {
        let result = summarize(0);
        for (
          let step = 0;
          step < (options.maxBatches ?? maxFrames + 1) && !result.allFinished;
          step++
        ) {
          result = advanceAll();
        }
        return result;
      },
    };
    observe();
    return { simulator, userMetrics };
  } catch (error) {
    dispose();
    throw error;
  }
};
