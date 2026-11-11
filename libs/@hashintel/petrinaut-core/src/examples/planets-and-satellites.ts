import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

const BODY_COLOR_ID = "type__body";
const SPACE_PLACE_ID = "place__space";
const MOTION_EQUATION_ID = "de__motion";
const GRAVITY_EQUATION_ID = "de__gravity";

/**
 * An n-body gravity simulation: a sun, planets of different masses and
 * sizes, a moon and satellites are all tokens of one colour in one place.
 *
 * Two differential equations compose on the Space place. `Motion` couples
 * one token and moves it by its velocity. `Gravity` couples two tokens and
 * is Newton's law for the pair: each body accelerates toward the other by
 * `G · m_other / d²`, softened so a near miss stays finite. The simulator
 * applies it to every pair and sums, so every body pulls on every other,
 * planets included. `Merge` (input arc weight 2) turns two bodies that
 * touch into one with their mass and momentum. `Launch` (a read arc on
 * Space) puts a satellite into a circular orbit around a body heavy enough
 * to count as a planet. A visualizer draws the bodies at their radii. The
 * scenario starts a sun, two planets, a moon and two satellites at the
 * speeds of circular orbits, computed from the gravitational constant. The
 * planets are light next to the sun and far from it, so the sun's tide on a
 * moon or a launched satellite stays a few percent of its planet's pull and
 * the planets barely perturb each other.
 *
 * Units are canvas units: distances in pixels of the visualizer, masses in
 * arbitrary units, so `gravitational_constant` is what scales the speeds.
 * It is small so that the fastest orbit (the moon's) takes about 30 time
 * units: the simulator integrates with a fixed step, and an orbit that
 * turns through much more than a fraction of a degree per step spirals
 * out. Play the scenario at 10x or faster.
 *
 * See `docs/examples.md` (Planets and Satellites).
 */
export const planetsAndSatellites: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Planets and Satellites",
  petriNetDefinition: {
    description:
      "An n-body gravity simulation: a sun, planets of different sizes, a moon and satellites pull on each other through one pairwise gravity equation composed with a motion equation; bodies that touch merge, and planets launch satellites into circular orbits.",
    places: [
      {
        id: SPACE_PLACE_ID,
        name: "Space",
        showAsInitialState: true,
        description:
          "Every body in the system. Motion moves each body by its velocity and Gravity pulls every pair together; the two equations are summed.",
        colorId: BODY_COLOR_ID,
        dynamicsEnabled: true,
        dynamics: [
          { differentialEquationId: MOTION_EQUATION_ID },
          { differentialEquationId: GRAVITY_EQUATION_ID },
        ],
        visualizerCode: `// The sun sits at the origin; a body is drawn at its radius, coloured as
// a star, a planet or a satellite by mass, with a heading tick on the small
// ones.
const { star_mass_threshold, planet_mass_threshold } = parameters;

return (
  <Visualizer.Svg
    viewBox="-800 -600 1600 1200"
    navigation="pan-zoom"
    backgroundColor="#000014"
  >
    {tokens.map(({ x, y, vx, vy, mass, radius }, index) => {
      const fill =
        mass >= star_mass_threshold
          ? "#ffb300"
          : mass >= planet_mass_threshold
            ? "#4fc3f7"
            : "#eceff1";
      const speed = Math.hypot(vx, vy);

      return (
        <g key={index}>
          <circle cx={x} cy={y} r={radius} fill={fill} />
          {speed > 0 && mass < star_mass_threshold && (
            <line
              x1={x}
              y1={y}
              x2={x + (vx / speed) * (radius + 6)}
              y2={y + (vy / speed) * (radius + 6)}
              stroke="#ffc107"
              strokeWidth="1"
            />
          )}
        </g>
      );
    })}
  </Visualizer.Svg>
);`,
        x: 10 * GRID_SIZE,
        y: 6 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__merge",
        name: "Merge",
        description:
          "Two bodies whose surfaces touch become one body with their combined mass, their volume-conserving radius, the mass-weighted position and the momentum-conserving velocity.",
        inputArcs: [
          {
            placeId: SPACE_PLACE_ID,
            weight: 2,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: SPACE_PLACE_ID,
            weight: 1,
          },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Two bodies touch when their centres are closer than their radii add up to.
const [a, b] = input.Space;
return Math.hypot(b.x - a.x, b.y - a.y) < a.radius + b.radius;`,
        transitionKernelCode: `// The merged body keeps the pair's mass, momentum and volume.
const [a, b] = input.Space;
const mass = a.mass + b.mass;
return {
  Space: [
    {
      x: (a.x * a.mass + b.x * b.mass) / mass,
      y: (a.y * a.mass + b.y * b.mass) / mass,
      vx: (a.vx * a.mass + b.vx * b.mass) / mass,
      vy: (a.vy * a.mass + b.vy * b.mass) / mass,
      mass,
      radius: Math.cbrt(a.radius ** 3 + b.radius ** 3),
    },
  ],
};`,
        x: 20 * GRID_SIZE,
        y: 2 * GRID_SIZE,
      },
      {
        id: "transition__launch",
        name: "Launch",
        description:
          "A body heavy enough to count as a planet, and too light to be a star, launches a satellite at the launch altitude, at the speed of a circular orbit around it, in a random direction. The read arc picks the planet without consuming it.",
        inputArcs: [
          {
            placeId: SPACE_PLACE_ID,
            weight: 1,
            type: "read",
          },
        ],
        outputArcs: [
          {
            placeId: SPACE_PLACE_ID,
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Only a planet launches: moons and satellites are too light, a star too
// heavy.
const body = input.Space[0];
return body.mass >= parameters.planet_mass_threshold &&
  body.mass < parameters.star_mass_threshold
  ? parameters.launch_rate
  : 0;`,
        transitionKernelCode: `// A satellite in a circular orbit around the planet that launched it: the
// orbit's speed is sqrt(G · M / r), tangential to the launch direction, on
// top of the planet's own velocity.
const planet = input.Space[0];
const distance = planet.radius + parameters.launch_altitude;
const speed = Math.sqrt(
  (parameters.gravitational_constant * planet.mass) / distance,
);
const angle = Distribution.Uniform(0, Math.PI * 2);

return {
  Space: [
    {
      x: angle.map((a) => planet.x + Math.cos(a) * distance),
      y: angle.map((a) => planet.y + Math.sin(a) * distance),
      vx: angle.map((a) => planet.vx - Math.sin(a) * speed),
      vy: angle.map((a) => planet.vy + Math.cos(a) * speed),
      mass: parameters.satellite_mass,
      radius: parameters.satellite_radius,
    },
  ],
};`,
        x: 20 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    types: [
      {
        id: BODY_COLOR_ID,
        name: "Body",
        description:
          "A body in space: its position and velocity relative to the system's centre, its mass and its radius. The sun, planets, moons and satellites are all bodies.",
        iconSlug: "circle",
        displayColor: "#4FC3F7",
        elements: [
          { elementId: "x", name: "x", type: "real" },
          { elementId: "y", name: "y", type: "real" },
          { elementId: "vx", name: "vx", type: "real" },
          { elementId: "vy", name: "vy", type: "real" },
          { elementId: "mass", name: "mass", type: "real" },
          { elementId: "radius", name: "radius", type: "real" },
        ],
      },
    ],
    differentialEquations: [
      {
        id: MOTION_EQUATION_ID,
        colorId: BODY_COLOR_ID,
        name: "Motion",
        arity: 1,
        code: `// A body moves by its velocity; mass and radius hold.
return { x: token.vx, y: token.vy };`,
      },
      {
        id: GRAVITY_EQUATION_ID,
        colorId: BODY_COLOR_ID,
        name: "Gravity",
        arity: 2,
        code: `// Newton's law of gravitation for one pair of bodies. The simulator applies
// it to every pair in the place and sums, so every body pulls on every
// other. Each body accelerates toward the other by G · m_other / d²; the
// softening keeps a near miss finite.
const G = parameters.gravitational_constant;
const softening = parameters.softening;
const [a, b] = tokens;

const dx = b.x - a.x;
const dy = b.y - a.y;
const d2 = dx * dx + dy * dy + softening * softening;
const inverseCube = 1 / (Math.sqrt(d2) * d2);

return [
  { vx: G * b.mass * dx * inverseCube, vy: G * b.mass * dy * inverseCube },
  { vx: -G * a.mass * dx * inverseCube, vy: -G * a.mass * dy * inverseCube },
];`,
      },
    ],
    parameters: [
      {
        id: "param__gravitational_constant",
        name: "Gravitational Constant",
        variableName: "gravitational_constant",
        type: "real",
        defaultValue: "35",
      },
      {
        id: "param__softening",
        name: "Softening Length",
        variableName: "softening",
        type: "real",
        defaultValue: "2",
      },
      {
        id: "param__planet_mass_threshold",
        name: "Planet Mass Threshold",
        variableName: "planet_mass_threshold",
        type: "real",
        defaultValue: "1",
      },
      {
        id: "param__star_mass_threshold",
        name: "Star Mass Threshold",
        variableName: "star_mass_threshold",
        type: "real",
        defaultValue: "100",
      },
      {
        id: "param__launch_rate",
        name: "Launch Rate",
        variableName: "launch_rate",
        type: "real",
        defaultValue: "0.01",
      },
      {
        id: "param__launch_altitude",
        name: "Launch Altitude",
        variableName: "launch_altitude",
        type: "real",
        defaultValue: "6",
      },
      {
        id: "param__satellite_mass",
        name: "Satellite Mass",
        variableName: "satellite_mass",
        type: "real",
        defaultValue: "0.001",
      },
      {
        id: "param__satellite_radius",
        name: "Satellite Radius",
        variableName: "satellite_radius",
        type: "real",
        defaultValue: "3",
      },
    ],
    metrics: [
      {
        id: "metric__bodies",
        name: "Bodies",
        description: "Number of bodies in space.",
        code: `return state.places.Space.count;`,
      },
      {
        id: "metric__total_mass",
        name: "Total mass",
        description:
          "Mass of every body added up; merges conserve it, launches add satellites.",
        code: `return state.places.Space.tokens.reduce((sum, body) => sum + body.mass, 0);`,
      },
      {
        id: "metric__heaviest_body",
        name: "Heaviest body",
        description: "Mass of the heaviest body; it grows when bodies merge.",
        code: `return state.places.Space.tokens.reduce(
  (heaviest, body) => Math.max(heaviest, body.mass),
  0,
);`,
      },
    ],
    scenarios: [
      {
        id: "scenario__sun_planets_moon",
        name: "Sun, Two Planets and a Moon",
        description:
          "A sun of mass 400, a planet of mass 6 with a moon, a lighter planet of mass 1.5 further out, and two satellites of the sun, every one at the speed of a circular orbit around what it circles. The sun carries the recoil that keeps the system's momentum at zero. Play at 10x or faster.",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: {
          type: "adhoc",
          content: {
            variables: [],
            netParameters: [],
            places: {
              [SPACE_PLACE_ID]: {
                kind: "coloured",
                variables: [
                  {
                    name: "G",
                    type: "real",
                    expression: "parameters.gravitational_constant",
                    optimize: null,
                  },
                  {
                    name: "sunMass",
                    type: "real",
                    expression: "400",
                    optimize: null,
                  },
                  {
                    name: "planetAMass",
                    type: "real",
                    expression: "6",
                    optimize: null,
                  },
                  {
                    name: "planetBMass",
                    type: "real",
                    expression: "1.5",
                    optimize: null,
                  },
                  {
                    name: "moonMass",
                    type: "real",
                    expression: "0.05",
                    optimize: null,
                  },
                  {
                    name: "planetAOrbit",
                    type: "real",
                    expression: "260",
                    optimize: null,
                  },
                  {
                    name: "planetBOrbit",
                    type: "real",
                    expression: "580",
                    optimize: null,
                  },
                  {
                    name: "moonOrbit",
                    type: "real",
                    expression: "16",
                    optimize: null,
                  },
                  {
                    name: "satelliteOrbit",
                    type: "real",
                    expression: "100",
                    optimize: null,
                  },
                  {
                    name: "planetASpeed",
                    type: "real",
                    expression: "Math.sqrt((G * sunMass) / planetAOrbit)",
                    optimize: null,
                  },
                  {
                    name: "planetBSpeed",
                    type: "real",
                    expression: "Math.sqrt((G * sunMass) / planetBOrbit)",
                    optimize: null,
                  },
                  {
                    name: "moonSpeed",
                    type: "real",
                    expression: "Math.sqrt((G * planetAMass) / moonOrbit)",
                    optimize: null,
                  },
                  {
                    name: "satelliteSpeed",
                    type: "real",
                    expression: "Math.sqrt((G * sunMass) / satelliteOrbit)",
                    optimize: null,
                  },
                  {
                    name: "sunRecoil",
                    type: "real",
                    expression:
                      "-(planetAMass * planetASpeed + moonMass * (planetASpeed + moonSpeed) - planetBMass * planetBSpeed) / sunMass",
                    optimize: null,
                  },
                ],
                rows: [
                  // The sun, at the centre, with the recoil of everything else.
                  {
                    kind: "fixed",
                    cells: [
                      { expression: "0", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "sunRecoil", optimize: null },
                      { expression: "sunMass", optimize: null },
                      { expression: "50", optimize: null },
                    ],
                  },
                  // Planet A, counter-clockwise around the sun.
                  {
                    kind: "fixed",
                    cells: [
                      { expression: "planetAOrbit", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "planetASpeed", optimize: null },
                      { expression: "planetAMass", optimize: null },
                      { expression: "12", optimize: null },
                    ],
                  },
                  // Planet B, smaller and further out, on the far side.
                  {
                    kind: "fixed",
                    cells: [
                      { expression: "-planetBOrbit", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "0", optimize: null },
                      { expression: "-planetBSpeed", optimize: null },
                      { expression: "planetBMass", optimize: null },
                      { expression: "8", optimize: null },
                    ],
                  },
                  // Planet A's moon, orbiting the planet on top of its motion.
                  {
                    kind: "fixed",
                    cells: [
                      {
                        expression: "planetAOrbit + moonOrbit",
                        optimize: null,
                      },
                      { expression: "0", optimize: null },
                      { expression: "0", optimize: null },
                      {
                        expression: "planetASpeed + moonSpeed",
                        optimize: null,
                      },
                      { expression: "moonMass", optimize: null },
                      { expression: "3", optimize: null },
                    ],
                  },
                  // Two satellites of the sun, opposite each other.
                  {
                    kind: "fixed",
                    cells: [
                      { expression: "0", optimize: null },
                      { expression: "satelliteOrbit", optimize: null },
                      { expression: "-satelliteSpeed", optimize: null },
                      { expression: "0", optimize: null },
                      {
                        expression: "parameters.satellite_mass",
                        optimize: null,
                      },
                      {
                        expression: "parameters.satellite_radius",
                        optimize: null,
                      },
                    ],
                  },
                  {
                    kind: "fixed",
                    cells: [
                      { expression: "0", optimize: null },
                      { expression: "-satelliteOrbit", optimize: null },
                      { expression: "satelliteSpeed", optimize: null },
                      { expression: "0", optimize: null },
                      {
                        expression: "parameters.satellite_mass",
                        optimize: null,
                      },
                      {
                        expression: "parameters.satellite_radius",
                        optimize: null,
                      },
                    ],
                  },
                ],
                sharedColumns: {},
              },
            },
          },
        },
      },
    ],
  },
};
