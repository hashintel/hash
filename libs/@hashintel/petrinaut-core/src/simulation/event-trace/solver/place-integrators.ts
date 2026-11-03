/**
 * @layerRoot core.simulation.event-trace.solver
 * @role Advances a place's continuous state between events by an error-controlled integrator, exactly when its dynamics are affine, and classifies the dynamics from their HIR
 */

/* eslint-disable no-param-reassign -- the place's token bytes are advanced in place by design. */
import { affinePropagator, applyAffinePropagator } from "./linear";
import { createRk45Integrator } from "./rk45";

import type { TokenSlotLayout } from "../../engine/token-layout";
import type { DifferentialEquationFn } from "../../engine/types";
import type {
  AffineForm,
  DynamicsClass,
  ParameterReader,
} from "./classify-dynamics";
import type { AffineSystem } from "./linear";
import type { Rk45Integrator, Rk45Tolerance } from "./rk45";

export type PlaceIntegrator = {
  /** How the place's tokens advance, for diagnostics. */
  readonly kind: DynamicsClass["kind"];
  /**
   * Advances the `count` tokens packed in `bytes` by `span` in place and
   * returns the local error incurred: the sum over the solver's steps of the
   * largest error any token's attribute took in the step, in attribute units.
   * `bytes` starts at a token boundary of an 8-aligned buffer, as a sliced
   * place region does.
   */
  integrate(bytes: Uint8Array, count: number, span: number): number;
};

export type PlaceIntegratorConfig = {
  equation: DifferentialEquationFn;
  layout: TokenSlotLayout;
  dynamics: DynamicsClass;
  /** The run's parameter values, which fix an affine system's coefficients. */
  parameters: ParameterReader;
  /** The local error allowed per step, relative and absolute. */
  tolerance: number;
};

const f64View = (bytes: Uint8Array): Float64Array =>
  new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8);

/** The real attribute names in the order the equation returns their derivatives. */
export const realFieldNames = (layout: TokenSlotLayout): string[] =>
  layout.fields
    .filter((field) => field.element.type === "real")
    .map((field) => field.element.name);

const gather = (
  view: Float64Array,
  strideF64: number,
  offsets: readonly number[],
  count: number,
  into: Float64Array,
): void => {
  for (let token = 0; token < count; token++) {
    for (const [field, offset] of offsets.entries()) {
      into[token * offsets.length + field] = view[token * strideF64 + offset]!;
    }
  }
};

const scatter = (
  from: Float64Array,
  view: Float64Array,
  strideF64: number,
  offsets: readonly number[],
  count: number,
): void => {
  for (let token = 0; token < count; token++) {
    for (const [field, offset] of offsets.entries()) {
      view[token * strideF64 + offset] = from[token * offsets.length + field]!;
    }
  }
};

/**
 * Integrates all of a place's real attributes as one system: the equation
 * is evaluated on the whole place at every stage, so tokens may couple.
 */
const createCoupledIntegrator = (
  config: PlaceIntegratorConfig,
  tolerance: Rk45Tolerance,
): PlaceIntegrator => {
  const { equation, layout } = config;
  const offsets = layout.realFieldF64Offsets;
  const strideF64 = layout.strideBytes / 8;
  let integrator: Rk45Integrator | null = null;
  let state = new Float64Array(0);
  let scratch = new Uint8Array(0);
  let nextStep: number | undefined;

  return {
    kind: "coupled",
    integrate(bytes, count, span) {
      const dimension = count * offsets.length;
      if (dimension === 0 || span <= 0) {
        return 0;
      }
      if (!integrator || integrator.dimension !== dimension) {
        integrator = createRk45Integrator(dimension);
        state = new Float64Array(dimension);
        nextStep = undefined;
      }
      if (scratch.byteLength !== bytes.byteLength) {
        scratch = new Uint8Array(bytes.byteLength);
      }
      scratch.set(bytes);
      const scratchView = f64View(scratch);
      gather(f64View(bytes), strideF64, offsets, count, state);

      const outcome = integrator.integrate(
        (current, derivative) => {
          scatter(current, scratchView, strideF64, offsets, count);
          derivative.set(equation(scratch, count).subarray(0, dimension));
        },
        state,
        span,
        tolerance,
        nextStep,
      );
      nextStep = outcome.nextStep;
      scatter(state, f64View(bytes), strideF64, offsets, count);
      return outcome.accumulatedError;
    },
  };
};

/**
 * Integrates every token on its own: the equation is evaluated on a
 * one-token region, so each token takes the steps its own dynamics need.
 */
const createIndependentIntegrator = (
  config: PlaceIntegratorConfig,
  tolerance: Rk45Tolerance,
): PlaceIntegrator => {
  const { equation, layout } = config;
  const offsets = layout.realFieldF64Offsets;
  const strideF64 = layout.strideBytes / 8;
  const dimension = offsets.length;
  const integrator = createRk45Integrator(dimension);
  const state = new Float64Array(dimension);
  const single = new Uint8Array(layout.strideBytes);
  const singleView = f64View(single);
  let nextStep: number | undefined;

  return {
    kind: "independent",
    integrate(bytes, count, span) {
      if (dimension === 0 || count === 0 || span <= 0) {
        return 0;
      }
      const view = f64View(bytes);
      let largestError = 0;
      for (let token = 0; token < count; token++) {
        const start = token * layout.strideBytes;
        single.set(bytes.subarray(start, start + layout.strideBytes));
        gather(singleView, strideF64, offsets, 1, state);
        const outcome = integrator.integrate(
          (current, derivative) => {
            scatter(current, singleView, strideF64, offsets, 1);
            derivative.set(equation(single, 1).subarray(0, dimension));
          },
          state,
          span,
          tolerance,
          nextStep,
        );
        nextStep = outcome.nextStep;
        largestError = Math.max(largestError, outcome.accumulatedError);
        for (const [field, offset] of offsets.entries()) {
          view[token * strideF64 + offset] = state[field]!;
        }
      }
      return largestError;
    },
  };
};

/**
 * Advances every token exactly through the affine system's propagator,
 * computed once per span for the whole place.
 */
const createAffineIntegrator = (
  config: PlaceIntegratorConfig,
  rows: ReadonlyMap<string, AffineForm>,
): PlaceIntegrator => {
  const { layout, parameters } = config;
  const offsets = layout.realFieldF64Offsets;
  const strideF64 = layout.strideBytes / 8;
  const names = realFieldNames(layout);
  const dimension = names.length;
  const system: AffineSystem = {
    dimension,
    matrix: new Float64Array(dimension * dimension),
    offset: new Float64Array(dimension),
  };
  for (const [row, name] of names.entries()) {
    const form = rows.get(name);
    if (!form) {
      throw new Error(`Affine dynamics have no row for attribute ${name}`);
    }
    system.offset[row] = form.constant(parameters);
    for (const [column, input] of names.entries()) {
      system.matrix[row * dimension + column] =
        form.coefficients.get(input)?.(parameters) ?? 0;
    }
  }
  const state = new Float64Array(dimension);
  let cachedSpan = Number.NaN;
  let propagator: Float64Array = new Float64Array(0);

  return {
    kind: "affine",
    integrate(bytes, count, span) {
      if (dimension === 0 || count === 0 || span <= 0) {
        return 0;
      }
      if (span !== cachedSpan) {
        propagator = affinePropagator(system, span);
        cachedSpan = span;
      }
      const view = f64View(bytes);
      for (let token = 0; token < count; token++) {
        for (const [field, offset] of offsets.entries()) {
          state[field] = view[token * strideF64 + offset]!;
        }
        applyAffinePropagator(propagator, dimension, state);
        for (const [field, offset] of offsets.entries()) {
          view[token * strideF64 + offset] = state[field]!;
        }
      }
      return 0;
    },
  };
};

/**
 * The integrator a place's dynamics class calls for: exact propagation for
 * affine dynamics, a per-token error-controlled solver for independent ones,
 * and a whole-place error-controlled solver otherwise.
 */
export function createPlaceIntegrator(
  config: PlaceIntegratorConfig,
): PlaceIntegrator {
  const tolerance: Rk45Tolerance = {
    absolute: config.tolerance,
    relative: config.tolerance,
  };
  switch (config.dynamics.kind) {
    case "affine":
      return createAffineIntegrator(config, config.dynamics.rows);
    case "independent":
      return createIndependentIntegrator(config, tolerance);
    case "coupled":
      return createCoupledIntegrator(config, tolerance);
  }
}
