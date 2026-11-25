/* eslint-disable no-param-reassign -- a derivative callback writes into the vector the integrator hands it. */
import { describe, expect, it } from "vitest";

import { createRk45Integrator } from "./rk45";

const tolerance = { absolute: 1e-8, relative: 1e-8 };

describe("createRk45Integrator", () => {
  it("integrates exponential decay to within the tolerance", () => {
    const integrator = createRk45Integrator(1);
    const state = Float64Array.of(1);
    const outcome = integrator.integrate(
      (y, dydt) => {
        dydt[0] = -y[0]!;
      },
      state,
      5,
      tolerance,
    );
    expect(state[0]).toBeCloseTo(Math.exp(-5), 7);
    expect(outcome.acceptedSteps).toBeGreaterThan(1);
    expect(outcome.forcedSteps).toBe(0);
    expect(outcome.accumulatedError).toBeGreaterThan(0);
    expect(outcome.accumulatedError).toBeLessThan(1e-6);
  });

  it("keeps a harmonic oscillator on its circle", () => {
    const integrator = createRk45Integrator(2);
    const state = Float64Array.of(1, 0);
    integrator.integrate(
      (y, dydt) => {
        dydt[0] = y[1]!;
        dydt[1] = -y[0]!;
      },
      state,
      2 * Math.PI,
      tolerance,
    );
    expect(state[0]).toBeCloseTo(1, 6);
    expect(state[1]).toBeCloseTo(0, 6);
  });

  it("takes fewer steps under a looser tolerance", () => {
    const integrate = (relative: number) =>
      createRk45Integrator(1).integrate(
        (y, dydt) => {
          dydt[0] = Math.cos(y[0]!);
        },
        Float64Array.of(0),
        10,
        { absolute: relative, relative },
      );
    expect(integrate(1e-3).acceptedSteps).toBeLessThan(
      integrate(1e-9).acceptedSteps,
    );
  });

  it("returns at once for an empty span or dimension", () => {
    const integrator = createRk45Integrator(1);
    const state = Float64Array.of(3);
    const outcome = integrator.integrate(
      () => {
        throw new Error("not called");
      },
      state,
      0,
      tolerance,
    );
    expect(outcome.acceptedSteps).toBe(0);
    expect(state[0]).toBe(3);
    expect(
      createRk45Integrator(0).integrate(
        () => {},
        new Float64Array(0),
        1,
        tolerance,
      ).acceptedSteps,
    ).toBe(0);
  });

  it("lands exactly on the span's end", () => {
    const integrator = createRk45Integrator(1);
    const state = Float64Array.of(0);
    integrator.integrate(
      (_y, dydt) => {
        dydt[0] = 1;
      },
      state,
      0.3,
      tolerance,
      0.07,
    );
    expect(state[0]).toBeCloseTo(0.3, 14);
  });

  it("fails, without retrying at smaller steps, when a derivative is not a finite number", () => {
    let evaluations = 0;
    const integrate = () =>
      createRk45Integrator(1).integrate(
        (_y, dydt) => {
          evaluations += 1;
          dydt[0] = Number.NaN;
        },
        Float64Array.of(1),
        1,
        tolerance,
      );
    expect(integrate).toThrow("not a finite number");
    // One attempt: the seven stages of a single step, plus the first slope.
    expect(evaluations).toBeLessThan(20);
  });
});
