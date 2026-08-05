import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { buildSimulation } from "../simulation/engine/build-simulation";
import { computeNextFrame } from "../simulation/engine/compute-next-frame";
import { decodePlaceTokens } from "../simulation/engine/token-layout.test-helpers";
import { probabilisticSatellitesSDCPN } from "./satellites-launcher";

import type { CompiledScenarioResult } from "../simulation/authoring/scenario/compile-scenario";

const { petriNetDefinition } = probabilisticSatellitesSDCPN;

const constellationScenario = petriNetDefinition.scenarios?.find(
  (scenario) => scenario.id === "scenario__pre_deployed_constellation",
);

const spacePlace = petriNetDefinition.places.find(
  (place) => place.name === "Space",
);

/** Net-level parameter defaults the scenario builds on. */
const PLANET_RADIUS = 50;
const GRAVITATIONAL_CONSTANT = 400_000;

/** Speed of a circular orbit at `radius`, matching the scenario code. */
const circularSpeed = (radius: number): number =>
  Math.sqrt(GRAVITATIONAL_CONSTANT / radius);

function compile(
  scenarioParameterValues?: Record<string, number>,
): CompiledScenarioResult {
  const outcome = compileScenario(
    constellationScenario!,
    petriNetDefinition.parameters,
    petriNetDefinition.places,
    petriNetDefinition.types,
    scenarioParameterValues ? { scenarioParameterValues } : undefined,
  );

  if (!outcome.ok) {
    throw new Error(
      `scenario failed to compile: ${outcome.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  return outcome.result;
}

function spaceTokens(result: CompiledScenarioResult): Record<string, number>[] {
  const tokens = result.initialState[spacePlace!.id];
  if (!Array.isArray(tokens)) {
    throw new Error("expected Space to hold token records");
  }
  return tokens as Record<string, number>[];
}

describe("Pre-deployed Constellation scenario", () => {
  it("compiles a ring of satellites from the scenario defaults", () => {
    const tokens = spaceTokens(compile());

    // Defaults: 8 satellites at planet_radius (50) + initial_altitude (40).
    const radius = PLANET_RADIUS + 40;
    expect(tokens).toHaveLength(8);
    expect(tokens[0]).toEqual({
      x: 90,
      y: 0,
      direction: Math.PI / 2,
      velocity: circularSpeed(radius),
    });

    for (const [index, token] of tokens.entries()) {
      const angle = Math.PI * 2 * (index / 8);
      expect(token.x).toBeCloseTo(Math.cos(angle) * radius);
      expect(token.y).toBeCloseTo(Math.sin(angle) * radius);
      // Tangential heading — a quarter turn ahead of the outward radius.
      expect(token.direction).toBeCloseTo(angle + Math.PI / 2);
      expect(token.velocity).toBeCloseTo(circularSpeed(radius));
    }
  });

  it("scales with user-supplied scenario parameter values", () => {
    const tokens = spaceTokens(
      compile({ number_of_satellites: 3, initial_altitude: 10 }),
    );

    // planet_radius (50) + initial_altitude (10)
    const radius = PLANET_RADIUS + 10;
    expect(tokens).toHaveLength(3);
    expect(tokens[0]).toEqual({
      x: 60,
      y: 0,
      direction: Math.PI / 2,
      velocity: circularSpeed(radius),
    });
  });

  it("actually orbits — tokens stay finite and hold their radius when simulated", () => {
    // Regression: seeding the ring with `velocity: 0` and a radially outward
    // heading made the orbit dynamics evaluate `0 / 0` for the direction
    // derivative, so every satellite went NaN on the very first frame.
    const result = compile();
    const radius = PLANET_RADIUS + 40;

    let simulation = buildSimulation({
      sdcpn: petriNetDefinition,
      initialMarking: result.initialState,
      parameterValues: result.parameterValues,
      seed: 42,
      dt: 0.001,
      maxTime: null,
      hirArtifacts: compileHirArtifacts(petriNetDefinition, undefined)
        .artifacts,
    });

    for (let frame = 0; frame < 50; frame++) {
      simulation = computeNextFrame(simulation).simulation;

      const tokens = decodePlaceTokens(
        simulation.frameLayout,
        simulation.frames[simulation.currentFrameNumber]!,
        spacePlace!.id,
      ) as Record<string, number>[];

      for (const token of tokens) {
        for (const [element, value] of Object.entries(token)) {
          expect(
            Number.isFinite(value),
            `frame ${frame + 1}: ${element} = ${value}`,
          ).toBe(true);
        }
      }

      // While no satellite has been launched or destroyed, the original ring
      // must still be a ring — a circular orbit conserves its radius.
      if (tokens.length === 8) {
        for (const token of tokens) {
          expect(Math.hypot(token.x!, token.y!)).toBeCloseTo(radius, 1);
        }
      }
    }
  });
});
