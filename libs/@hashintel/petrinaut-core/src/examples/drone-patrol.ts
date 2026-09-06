import { GRID_SIZE } from "../grid-size";

import type { SDCPN } from "../types/sdcpn";

/**
 * A small typed fleet cycling between hangar and air, with a tempo that is
 * sweepable through the scenario's `launch_rate` and `drain_rate` parameters.
 *
 * Each drone is a typed token carrying `battery` and `altitude`. "Launch"
 * reads the candidate token's battery to scale its stochastic rate — a full
 * battery launches at `launch_rate`, a drained one not at all — and its kernel
 * samples a cruise altitude with `Distribution.Gaussian`, clamped to a 50-unit
 * floor. While airborne, an ODE drains the battery at `drain_rate`, so
 * "ReturnToBase" fires ever faster as charge falls; landing recharges the
 * drone and puts it back on the hangar floor. The Standard Patrol scenario
 * starts ten fully-charged drones in the hangar.
 *
 * Every place carries a token capacity, so the net is GPU-ready as shipped:
 * the kernels, the dynamics, and the token-reading lambdas all compile to the
 * WebGPU backend.
 */
export const dronePatrol: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Drone Patrol",
  petriNetDefinition: {
    description:
      "A small drone fleet cycling between hangar and air. Drones launch at a rate scaled by their battery, drain charge while airborne so the pull back to base grows, and recharge on landing. Sweep launch_rate against drain_rate to trade patrol coverage against battery wear.",
    places: [
      {
        id: "place__hangar",
        name: "Hangar",
        description:
          "Drones on the ground ready to launch, each carrying its battery level; landing resets it to a full charge. Holds up to 16 drones.",
        colorId: "type__drone",
        dynamicsEnabled: false,
        differentialEquationId: null,
        capacity: 16,
        x: 1 * GRID_SIZE,
        y: 6 * GRID_SIZE,
      },
      {
        id: "place__airborne",
        name: "Airborne",
        description:
          "Drones on patrol. The Flight Battery Drain dynamics lower each drone's battery at drain_rate while its cruise altitude holds. Holds up to 16 drones.",
        colorId: "type__drone",
        dynamicsEnabled: true,
        differentialEquationId: "de__flight_battery_drain",
        capacity: 16,
        x: 21 * GRID_SIZE,
        y: 6 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__launch",
        name: "Launch",
        description:
          "A hangar drone lifts off at launch_rate scaled by its battery fraction, so a full battery launches at the full rate and a drained one not at all. The kernel keeps the battery and draws a cruise altitude around 100 units with a floor of 50.",
        inputArcs: [
          {
            placeId: "place__hangar",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__airborne",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// A drone lifts off at a rate proportional to its charge: a full battery
// launches at \`launch_rate\`, a drained one not at all.
export default Lambda((tokens, parameters) => {
  return parameters.launch_rate * (tokens.Hangar[0].battery / 100);
});`,
        transitionKernelCode: `// The battery carries over; the cruise altitude is drawn around 100 units
// with a hard floor of 50.
export default TransitionKernel((tokens) => {
  return {
    Airborne: [
      {
        battery: tokens.Hangar[0].battery,
        altitude: Distribution.Gaussian(100, 20).map((cruise) =>
          Math.max(50, cruise),
        ),
      },
    ],
  };
});`,
        x: 11 * GRID_SIZE,
        y: 1 * GRID_SIZE,
      },
      {
        id: "transition__return_to_base",
        name: "ReturnToBase",
        description:
          "An airborne drone heads home at return_rate, rising as its battery drains: a full drone returns at the base rate, a fully drained one at five times that. Landing recharges it to 100 and sets its altitude to zero.",
        inputArcs: [
          {
            placeId: "place__airborne",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place__hangar",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// The pull back to base rises as the battery drains: a full drone returns
// at \`return_rate\`, a fully drained one at five times that.
export default Lambda((tokens, parameters) => {
  return parameters.return_rate * (1 + (100 - tokens.Airborne[0].battery) / 25);
});`,
        transitionKernelCode: `// Landing recharges the drone and puts it on the hangar floor.
export default TransitionKernel(() => {
  return {
    Hangar: [{ battery: 100, altitude: 0 }],
  };
});`,
        x: 11 * GRID_SIZE,
        y: 11 * GRID_SIZE,
      },
    ],
    types: [
      {
        id: "type__drone",
        name: "Drone",
        description:
          "A patrol drone, tracked by its battery charge (100 when full) and its current altitude (0 on the ground).",
        iconSlug: "circle",
        displayColor: "#1E90FF",
        elements: [
          {
            elementId: "element__battery",
            name: "battery",
            type: "real",
          },
          {
            elementId: "element__altitude",
            name: "altitude",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "de__flight_battery_drain",
        colorId: "type__drone",
        name: "Flight Battery Drain",
        code: `// Airborne drones drain charge at a constant rate; cruise altitude holds.
export default Dynamics((tokens, parameters) => {
  return tokens.map((drone) => ({
    battery: -parameters.drain_rate,
    altitude: 0,
  }));
});`,
      },
    ],
    parameters: [
      {
        id: "param__launch_rate",
        name: "Launch Rate",
        variableName: "launch_rate",
        type: "real",
        defaultValue: "0.6",
      },
      {
        id: "param__return_rate",
        name: "Return Rate",
        variableName: "return_rate",
        type: "real",
        defaultValue: "0.3",
      },
      {
        id: "param__drain_rate",
        name: "Drain Rate",
        variableName: "drain_rate",
        type: "real",
        defaultValue: "2.5",
      },
    ],
    scenarios: [
      {
        id: "scenario__standard_patrol",
        name: "Standard Patrol",
        description:
          "Ten fully-charged drones start in the hangar. Sweep launch_rate and drain_rate to trade patrol coverage against battery wear.",
        scenarioParameters: [
          { type: "real", identifier: "launch_rate", default: 0.6 },
          { type: "real", identifier: "drain_rate", default: 2.5 },
        ],
        parameterOverrides: {
          param__launch_rate: "scenario.launch_rate",
          param__drain_rate: "scenario.drain_rate",
        },
        initialState: {
          type: "per_place",
          content: {
            // battery, altitude — one row per drone.
            place__hangar: [
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
              [100, 0],
            ],
            place__airborne: [],
          },
        },
      },
    ],
  },
};
