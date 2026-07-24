import { describe, expect, it } from "vitest";

import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { probabilisticSatellitesSDCPN } from "./satellites-launcher";

const { petriNetDefinition } = probabilisticSatellitesSDCPN;

const constellationScenario = petriNetDefinition.scenarios?.find(
  (scenario) => scenario.id === "scenario__pre_deployed_constellation",
);

const spacePlace = petriNetDefinition.places.find(
  (place) => place.name === "Space",
);

describe("Pre-deployed Constellation scenario", () => {
  it("compiles a ring of satellites from the scenario defaults", () => {
    const outcome = compileScenario(
      constellationScenario!,
      petriNetDefinition.parameters,
      petriNetDefinition.places,
      petriNetDefinition.types,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }

    const tokens = outcome.result.initialState[spacePlace!.id];
    expect(Array.isArray(tokens)).toBe(true);
    if (!Array.isArray(tokens)) {
      return;
    }

    // Defaults: 8 satellites at planet_radius (50) + initial_altitude (40).
    expect(tokens).toHaveLength(8);
    expect(tokens[0]).toEqual({ x: 90, y: 0, direction: 0, velocity: 0 });
    for (const [index, token] of tokens.entries()) {
      const angle = Math.PI * 2 * (index / 8);
      expect(token.x).toBeCloseTo(Math.cos(angle) * 90);
      expect(token.y).toBeCloseTo(Math.sin(angle) * 90);
      expect(token.direction).toBeCloseTo(angle);
      expect(token.velocity).toBe(0);
    }
  });

  it("scales with user-supplied scenario parameter values", () => {
    const outcome = compileScenario(
      constellationScenario!,
      petriNetDefinition.parameters,
      petriNetDefinition.places,
      petriNetDefinition.types,
      {
        scenarioParameterValues: {
          number_of_satellites: 3,
          initial_altitude: 10,
        },
      },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }

    const tokens = outcome.result.initialState[spacePlace!.id];
    expect(Array.isArray(tokens)).toBe(true);
    if (!Array.isArray(tokens)) {
      return;
    }

    expect(tokens).toHaveLength(3);
    // planet_radius (50) + initial_altitude (10)
    expect(tokens[0]).toEqual({ x: 60, y: 0, direction: 0, velocity: 0 });
  });
});
