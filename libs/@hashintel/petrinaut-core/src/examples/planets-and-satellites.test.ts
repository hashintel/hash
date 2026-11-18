import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { lowerScenarioToHir } from "../hir/scenario";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { buildSimulation } from "../simulation/engine/build-simulation";
import { computeNextFrame } from "../simulation/engine/compute-next-frame";
import { decodePlaceTokens } from "../simulation/engine/token-layout.test-helpers";
import { planetsAndSatellites } from "./planets-and-satellites";

import type { SimulationInstance } from "../simulation/engine/types";
import type { TokenRecord } from "../types/sdcpn";

const { petriNetDefinition } = planetsAndSatellites;
const space = petriNetDefinition.places.find(
  (place) => place.name === "Space",
)!;
const scenario = petriNetDefinition.scenarios![0]!;
const artifacts = compileHirArtifacts(petriNetDefinition).artifacts;

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
};

const bodiesOf = (simulation: SimulationInstance): Body[] =>
  decodePlaceTokens(
    simulation.frameLayout,
    simulation.frames[simulation.currentFrameNumber]!,
    space.id,
  ).map((token) => token as unknown as Body);

const distance = (a: Body, b: Body): number => Math.hypot(b.x - a.x, b.y - a.y);

const simulate = (
  initialMarking: Record<string, TokenRecord[]>,
  parameterValues: Record<string, string>,
  steps: number,
  dt: number,
  observe: (bodies: Body[], step: number) => void = () => {},
): Body[] => {
  let simulation = buildSimulation({
    sdcpn: petriNetDefinition,
    initialMarking,
    parameterValues,
    seed: 7,
    dt,
    maxTime: null,
    hirArtifacts: artifacts,
  });
  for (let step = 1; step <= steps; step++) {
    simulation = computeNextFrame(simulation).simulation;
    observe(bodiesOf(simulation), step);
  }
  return bodiesOf(simulation);
};

const scenarioState = () => {
  const outcome = compileScenario(
    scenario,
    lowerScenarioToHir(scenario, {
      adHocContext: {
        places: petriNetDefinition.places,
        types: petriNetDefinition.types,
        netParameters: petriNetDefinition.parameters,
      },
    }),
    petriNetDefinition.parameters,
    petriNetDefinition.places,
    petriNetDefinition.types,
  );
  if (!outcome.ok) {
    throw new Error(outcome.errors.map((error) => error.message).join("; "));
  }
  return {
    bodies: (outcome.result.initialState[space.id] as TokenRecord[]).map(
      (token) => token as unknown as Body,
    ),
    initialState: outcome.result.initialState as Record<string, TokenRecord[]>,
    parameterValues: outcome.result.parameterValues,
  };
};

describe("Planets and Satellites", () => {
  it("pulls two bodies at rest toward each other by G · m / d²", () => {
    // 1000 · 10 / 100² = 1 unit of acceleration each, for ten steps of 0.01.
    const bodies = simulate(
      {
        [space.id]: [
          { x: -50, y: 0, vx: 0, vy: 0, mass: 10, radius: 1 },
          { x: 50, y: 0, vx: 0, vy: 0, mass: 10, radius: 1 },
        ],
      },
      { launch_rate: "0", gravitational_constant: "1000", softening: "0" },
      10,
      0.01,
    );
    expect(bodies).toHaveLength(2);
    const [left, right] = bodies as [Body, Body];
    expect(left.vx).toBeCloseTo(0.1, 3);
    expect(right.vx).toBeCloseTo(-0.1, 3);
    expect(distance(left, right)).toBeLessThan(100);
  });

  it("merges two touching bodies, conserving mass, momentum and volume", () => {
    const bodies = simulate(
      {
        [space.id]: [
          { x: -5, y: 0, vx: 0, vy: 3, mass: 10, radius: 6 },
          { x: 5, y: 0, vx: 0, vy: -3, mass: 10, radius: 6 },
        ],
      },
      { launch_rate: "0" },
      1,
      0.01,
    );
    expect(bodies).toHaveLength(1);
    const [merged] = bodies as [Body];
    expect(merged.mass).toBe(20);
    expect(merged.vx).toBeCloseTo(0, 6);
    expect(merged.vy).toBeCloseTo(0, 6);
    expect(merged.x).toBeCloseTo(0, 6);
    expect(merged.radius).toBeCloseTo(Math.cbrt(2 * 6 ** 3), 6);
  });

  it("starts the scenario with zero total momentum", () => {
    const { bodies } = scenarioState();
    expect(bodies).toHaveLength(6);
    const momentumX = bodies.reduce(
      (sum, body) => sum + body.mass * body.vx,
      0,
    );
    const momentumY = bodies.reduce(
      (sum, body) => sum + body.mass * body.vy,
      0,
    );
    expect(momentumX).toBeCloseTo(0, 6);
    expect(momentumY).toBeCloseTo(0, 6);
  });

  it("keeps the scenario's bodies on their orbits", () => {
    const { bodies: initial, initialState, parameterValues } = scenarioState();
    const [sun0, planetA0, , moon0, satellite0] = initial as [
      Body,
      Body,
      Body,
      Body,
      Body,
    ];
    const planetOrbit = distance(sun0, planetA0);
    const moonOrbit = distance(planetA0, moon0);
    const satelliteOrbit = distance(sun0, satellite0);
    // Two orbits of the sun's satellite, at the circular speed √(G·M/r):
    // about half a planet year and four moon orbits.
    const satellitePeriod =
      (2 * Math.PI * satelliteOrbit) / Math.hypot(satellite0.vx, satellite0.vy);
    const dt = 0.01;
    const within = (value: number, orbit: number, low: number, high: number) =>
      value > orbit * low && value < orbit * high;

    simulate(
      initialState,
      { ...parameterValues, launch_rate: "0" },
      Math.ceil((2 * satellitePeriod) / dt),
      dt,
      (bodies, step) => {
        expect(bodies.length, `step ${step}`).toBe(6);
        const [sun, planetA, , moon, satellite] = bodies as [
          Body,
          Body,
          Body,
          Body,
          Body,
        ];
        // The fixed-step integrator lets an orbit spiral out slowly, the
        // faster the orbit the more: the planet stays within a tenth of its
        // orbit, the sun's satellite within a fifth and the moon within a
        // third.
        expect(
          within(distance(sun, planetA), planetOrbit, 0.9, 1.1),
          `planet at step ${step}`,
        ).toBe(true);
        expect(
          within(distance(sun, satellite), satelliteOrbit, 0.8, 1.2),
          `satellite at step ${step}`,
        ).toBe(true);
        expect(
          within(distance(planetA, moon), moonOrbit, 0.7, 1.35),
          `moon at step ${step}`,
        ).toBe(true);
      },
    );
  });

  it("launches a satellite into a circular orbit around a planet", () => {
    // One planet at rest, a launch rate so high the transition fires at once.
    const gravitationalConstant = 1000;
    const altitude = 12;
    const bodies = simulate(
      { [space.id]: [{ x: 0, y: 0, vx: 0, vy: 0, mass: 20, radius: 10 }] },
      {
        gravitational_constant: String(gravitationalConstant),
        launch_rate: "1e9",
        launch_altitude: String(altitude),
      },
      1,
      0.0001,
    );
    expect(bodies).toHaveLength(2);
    const [planet, satellite] = bodies as [Body, Body];
    const orbit = planet.radius + altitude;
    expect(distance(planet, satellite)).toBeCloseTo(orbit, 2);
    const relativeSpeed = Math.hypot(
      satellite.vx - planet.vx,
      satellite.vy - planet.vy,
    );
    expect(relativeSpeed).toBeCloseTo(
      Math.sqrt((gravitationalConstant * planet.mass) / orbit),
      2,
    );
    // The velocity is tangential: no component along the radius.
    const radial =
      ((satellite.x - planet.x) * (satellite.vx - planet.vx) +
        (satellite.y - planet.y) * (satellite.vy - planet.vy)) /
      orbit;
    expect(Math.abs(radial)).toBeLessThan(0.05);
  });

  it("launches from planets only, never from the sun, moon or satellites", () => {
    const { initialState, parameterValues } = scenarioState();
    const satelliteMass = Number(parameterValues.satellite_mass);
    let bodies: Body[] = [];
    simulate(
      initialState,
      { ...parameterValues, launch_rate: "5" },
      100,
      0.01,
      (current) => {
        bodies = current;
      },
    );
    const launched = bodies.slice(6);
    expect(launched.length).toBeGreaterThan(0);
    const [sun, planetA, planetB] = bodies as [Body, Body, Body];
    for (const satellite of launched) {
      // Satellites launched close together may have merged into one body of
      // an integer number of satellite masses.
      const count = satellite.mass / satelliteMass;
      expect(count).toBeCloseTo(Math.round(count), 6);
      expect(count).toBeGreaterThanOrEqual(1);
      // Every satellite is near one of the two planets, not near the sun.
      const nearestPlanet = Math.min(
        distance(planetA, satellite),
        distance(planetB, satellite),
      );
      expect(nearestPlanet).toBeLessThan(distance(sun, satellite));
    }
  });
});
