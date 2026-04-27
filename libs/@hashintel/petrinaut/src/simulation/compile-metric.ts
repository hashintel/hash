import type { Metric } from "../core/types/sdcpn";
import { runSandboxed, SHADOWED_GLOBALS } from "./sandbox";

// -- Public types -------------------------------------------------------------

/**
 * State of a single place exposed to a compiled metric.
 *
 * - `count`: number of tokens currently in the place.
 * - `tokens`: for colored places, an array of token objects keyed by the
 *   color element names (see `Color.elements`). Empty for uncolored places.
 */
export interface MetricPlaceState {
  count: number;
  tokens: Record<string, number>[];
}

/**
 * Snapshot of the SDCPN state passed to a compiled metric on every frame.
 *
 * Keyed by place **name** (not ID) for ergonomic author-facing access:
 * `state.places.Infected.count`.
 */
export interface MetricState {
  places: Record<string, MetricPlaceState>;
}

export type CompiledMetric = (state: MetricState) => number;

export type CompileMetricOutcome =
  | { ok: true; fn: CompiledMetric }
  | { ok: false; error: string };

// -- Hardened evaluator -------------------------------------------------------

/**
 * Wrap a plain object in a prototype-less, frozen copy.
 * Severs the prototype chain so `obj.constructor.constructor("return globalThis")()`
 * cannot escape to globals on the user-facing arguments.
 */
function createSafeState(state: MetricState): MetricState {
  const places = Object.create(null) as Record<string, MetricPlaceState>;
  for (const [name, value] of Object.entries(state.places)) {
    places[name] = Object.freeze(
      Object.assign(Object.create(null), value),
    ) as MetricPlaceState;
  }
  return Object.freeze(
    Object.assign(Object.create(null), { places: Object.freeze(places) }),
  ) as MetricState;
}

// -- Compiler -----------------------------------------------------------------

/**
 * Compile a metric's user code into an executable `(state) => number` function.
 *
 * The supplied code is treated as a function body that must `return` a number.
 * It runs in strict mode with dangerous globals shadowed, the `state` argument
 * frozen with no prototype chain, and the `.constructor` chain blocked on
 * built-in prototypes for the duration of the call (see `runSandboxed`).
 *
 * On invalid output (non-number / NaN / non-finite), the returned function
 * throws — callers should catch and decide how to render the failed frame.
 */
export function compileMetric(metric: Metric): CompileMetricOutcome {
  const code = metric.code.trim();
  if (code === "") {
    return { ok: false, error: "Metric code is empty" };
  }

  let rawFn: (state: MetricState) => unknown;
  try {
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval -- intentional: user-authored metric code
    rawFn = new Function(
      "state",
      `"use strict"; var ${SHADOWED_GLOBALS}; ${code}`,
    ) as (state: MetricState) => unknown;
  } catch (err) {
    return {
      ok: false,
      error: `Failed to compile metric "${metric.name}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const fn: CompiledMetric = (state) => {
    const result = runSandboxed(() => rawFn(createSafeState(state)));
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error(
        `Metric "${metric.name}" returned ${String(result)}, expected a finite number.`,
      );
    }
    return result;
  };

  return { ok: true, fn };
}
