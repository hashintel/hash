/**
 * The toy system every constraint prototype runs against: a cooling-tank
 * process with four searched parameters and three observable metrics
 * (`temperature`, `pressure`, `throughput`) over a simulated run. Small
 * enough to re-simulate on every slider move, rich enough that state
 * constraints have real excursions to catch: pushing `flow_rate` up raises
 * throughput but heats the tank; `cooling_power` fights the heating with a
 * lag; a mid-run demand spike stresses whatever margin is left.
 *
 * Deterministic under a seed — stories re-simulate during render.
 */

import { createRng } from "./sampling";

import type { Trace } from "./robustness";
import type { ParameterSpec, SamplePoint } from "./sampling";

export const TOY_PARAMETERS: readonly ParameterSpec[] = [
  { name: "flow_rate", min: 0, max: 10 },
  { name: "cooling_power", min: 0, max: 8 },
  { name: "batch_size", min: 1, max: 50 },
  { name: "reserve_ratio", min: 0, max: 1 },
];

export const TOY_DEFAULTS: SamplePoint = {
  flow_rate: 6,
  cooling_power: 3,
  batch_size: 20,
  reserve_ratio: 0.3,
};

export const TOY_METRICS = ["temperature", "pressure", "throughput"] as const;

export type ToyMetric = (typeof TOY_METRICS)[number];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const STEPS = 120;
const DT = 0.5;

/**
 * Simulates one run: forward-Euler thermal dynamics plus a demand spike in
 * the middle third and small seeded process noise. Each step's environment
 * carries the three metrics, the elapsed `time`, and every parameter (so a
 * constraint can mix state and parameters, e.g.
 * `temperature < 40 + 5 * cooling_power`).
 */
export function simulateToyRun(parameters: SamplePoint, seed = 7): Trace {
  const rng = createRng(seed);
  const flowRate = parameters.flow_rate ?? 0;
  const coolingPower = parameters.cooling_power ?? 0;
  const batchSize = parameters.batch_size ?? 1;
  const reserveRatio = parameters.reserve_ratio ?? 0;

  const times: number[] = [];
  const steps: Map<string, number>[] = [];

  let temperature = 25;
  let pressure = 1;

  for (let index = 0; index < STEPS; index += 1) {
    const time = index * DT;
    const spike = time >= 20 && time <= 40 ? 1.6 : 1;
    const demand = flowRate * spike;
    const noise = (rng() - 0.5) * 0.6;

    const heating = 1.1 * demand + 0.05 * batchSize;
    const cooling = 1.35 * coolingPower + 0.08 * (temperature - 25);
    temperature += DT * (heating - cooling) + noise;

    const pressureTarget =
      0.8 + 0.05 * batchSize * (1 - reserveRatio) + 0.06 * demand;
    pressure += DT * 0.8 * (pressureTarget - pressure) + noise * 0.05;

    const throughput = Math.max(
      0,
      demand *
        (1 - Math.max(0, temperature - 70) * 0.02) *
        (1 - reserveRatio * 0.4),
    );

    const step = new Map<string, number>();
    step.set("temperature", round2(temperature));
    step.set("pressure", round2(pressure));
    step.set("throughput", round2(throughput));
    step.set("time", time);
    for (const [name, value] of Object.entries(parameters)) {
      step.set(name, value);
    }
    times.push(time);
    steps.push(step);
  }

  return { times, steps };
}

/**
 * The run's objective (mean throughput) — what the penalty multiplier gets
 * applied to in the prototypes.
 */
export function toyObjective(trace: Trace): number {
  let sum = 0;
  for (const step of trace.steps) {
    const value = step.get("throughput");
    sum += typeof value === "number" ? value : 0;
  }
  return round2(sum / trace.steps.length);
}
