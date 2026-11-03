import { probabilisticSatellitesSDCPN } from "./satellites-launcher";

import type { SDCPN } from "../types/sdcpn";

const SATELLITE_COLOR_ID = "f8e9d7c6-b5a4-3210-fedc-ba9876543210";
const ORBIT_EQUATION_ID = "1a2b3c4d-5e6f-7890-abcd-1234567890ab";
const ATTRACTION_EQUATION_ID = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const ATTRACTION_CONSTANT_ID = "8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a";

/**
 * The orbit dynamics of the satellite launcher, written for one token: the
 * same gravitational pull, but the equation sees one satellite at a time
 * and returns its derivative record.
 */
const orbitDynamicsCode = `// Gravity pulls one satellite toward the planet at the origin.
const mu = parameters.gravitational_constant;
const [satellite] = tokens;
const { x, y, direction, velocity } = satellite;
const r = Math.hypot(x, y);

// Gravitational acceleration vector (points toward the origin)
const ax = (-mu * x) / (r * r * r);
const ay = (-mu * y) / (r * r * r);

return {
  x: velocity * Math.cos(direction),
  y: velocity * Math.sin(direction),
  direction: (-ax * Math.sin(direction) + ay * Math.cos(direction)) / velocity,
  velocity: ax * Math.cos(direction) + ay * Math.sin(direction),
};`;

/**
 * A pairwise attraction: every two satellites pull each other with a force
 * falling off with the square of their distance. The equation couples two
 * tokens, so the simulator applies it to every pair in the place and adds
 * both contributions, which keeps the interaction symmetric.
 */
const attractionDynamicsCode = `// Mutual attraction between every two satellites.
const k = parameters.attraction_constant;
const [a, b] = tokens;

// The vector from a to b, softened so two satellites at the same point do
// not divide by zero.
const dx = b.x - a.x;
const dy = b.y - a.y;
const d3 = Math.pow(dx * dx + dy * dy + 1, 1.5);

// Acceleration of a toward b; b feels the opposite.
const ax = (k * dx) / d3;
const ay = (k * dy) / d3;

return [
  {
    direction:
      (-ax * Math.sin(a.direction) + ay * Math.cos(a.direction)) / a.velocity,
    velocity: ax * Math.cos(a.direction) + ay * Math.sin(a.direction),
  },
  {
    direction:
      (ax * Math.sin(b.direction) - ay * Math.cos(b.direction)) / b.velocity,
    velocity: -ax * Math.cos(b.direction) - ay * Math.sin(b.direction),
  },
];`;

const base = probabilisticSatellitesSDCPN.petriNetDefinition;

/**
 * The satellite launcher with composed dynamics: the orbit equation becomes
 * a one-token equation, and a two-token attraction composed into the Space
 * place pulls every pair of satellites toward each other. Everything else,
 * the launches, collisions, crashes, visualizer, metrics and scenarios, is
 * the launcher's.
 *
 * See `docs/examples.md` (Satellites with Attraction).
 */
export const satellitesWithAttraction: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Satellites with Attraction",
  petriNetDefinition: {
    ...base,
    description:
      "The satellite launcher with composed dynamics: a one-token orbit equation and a two-token mutual attraction, summed for every satellite, so the constellation drifts as the satellites pull on each other.",
    differentialEquations: [
      ...base.differentialEquations.map((equation) =>
        equation.id === ORBIT_EQUATION_ID
          ? { ...equation, arity: 1, code: orbitDynamicsCode }
          : equation,
      ),
      {
        id: ATTRACTION_EQUATION_ID,
        colorId: SATELLITE_COLOR_ID,
        name: "Mutual Attraction",
        arity: 2,
        code: attractionDynamicsCode,
      },
    ],
    parameters: [
      ...base.parameters,
      {
        id: ATTRACTION_CONSTANT_ID,
        name: "Attraction Constant",
        variableName: "attraction_constant",
        type: "real",
        defaultValue: "20000.0",
      },
    ],
    places: base.places.map((place) =>
      place.differentialEquationId === ORBIT_EQUATION_ID
        ? {
            ...place,
            description:
              "Satellites in orbit. Gravity and the attraction between every pair of satellites both move them: the place composes the orbit equation with the mutual attraction.",
            dynamics: [{ differentialEquationId: ATTRACTION_EQUATION_ID }],
          }
        : place,
    ),
  },
};
