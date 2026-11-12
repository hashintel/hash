import { GRID_SIZE } from "../grid-size";

import type { Scenario, SDCPN } from "../types/sdcpn";

/** One scenario of the model: a batch of wheels, and how strict the check is. */
const batchScenario = ({
  id,
  name,
  description,
  wheels,
  initialRunout,
  tolerance,
  maxPasses,
}: {
  id: string;
  name: string;
  description: string;
  wheels: number;
  initialRunout: number;
  tolerance: number;
  maxPasses: number;
}): Scenario => ({
  id,
  name,
  description,
  scenarioParameters: [
    { type: "integer", identifier: "wheels", default: wheels },
    { type: "real", identifier: "initial_runout", default: initialRunout },
    { type: "real", identifier: "tolerance", default: tolerance },
    { type: "integer", identifier: "max_passes", default: maxPasses },
  ],
  parameterOverrides: {
    param__tolerance: "scenario.tolerance",
    param__max_passes: "scenario.max_passes",
  },
  initialState: {
    type: "adhoc",
    content: {
      variables: [
        {
          name: "wheels",
          type: "integer",
          expression: String(wheels),
          exposed: true,
          optimize: null,
        },
        {
          name: "initial_runout",
          type: "real",
          expression: String(initialRunout),
          exposed: true,
          optimize: null,
        },
        {
          name: "tolerance",
          type: "real",
          expression: String(tolerance),
          exposed: true,
          optimize: null,
        },
        {
          name: "max_passes",
          type: "integer",
          expression: String(maxPasses),
          exposed: true,
          optimize: null,
        },
      ],
      netParameters: [
        {
          parameterId: "param__tolerance",
          expression: "scenario.tolerance",
          optimize: null,
        },
        {
          parameterId: "param__max_passes",
          expression: "scenario.max_passes",
          optimize: null,
        },
      ],
      places: {
        place__laced: {
          kind: "coloured",
          variables: [],
          rows: [
            {
              kind: "template",
              count: { expression: "scenario.wheels", optimize: null },
              cells: [
                { expression: "scenario.initial_runout", optimize: null },
                { expression: "0", optimize: null },
              ],
            },
          ],
          sharedColumns: {},
        },
      },
    },
  },
});

/**
 * Wheel Truing: an untimed net of typed tokens whose runs differ by seed. A
 * batch of freshly laced wheels goes over one truing stand until each wheel
 * is within tolerance or has had its last pass.
 *
 * Every transition is a predicate and no place has dynamics, so nothing
 * takes time and a run is a sequence of steps. The chance is in a kernel:
 * TruingPass draws the runout a pass leaves from `Distribution.Gaussian`,
 * around a share of the runout the wheel came with. The three predicates
 * that follow read the measured wheel and send it one of three ways.
 *
 * - TruingPass takes the wheel at the head of Laced, draws its new runout
 *   and counts the pass.
 * - Accept fires for a wheel within `tolerance`.
 * - Retrue sends a wheel that is still out, with passes left, back to Laced.
 * - Reject takes a wheel that is still out after `max_passes`.
 *
 * A transition fires once per step, so the stand trues one wheel per step
 * and a wheel is measured the step after its pass. The run ends at the first
 * step that fires nothing: every wheel is then Accepted or Rejected.
 *
 * One run is one batch. A Stochastic simulation runs many batches and counts
 * them by step: the mean of Accepted climbs to the batch's expected yield.
 *
 * Every place has a capacity, so the net is ready for the GPU as shipped.
 */
export const wheelTruing: { title: string; petriNetDefinition: SDCPN } = {
  title: "Wheel Truing",
  petriNetDefinition: {
    description:
      "An untimed net of typed tokens: laced wheels go over a truing stand until each is within tolerance or out of passes. Every transition is a predicate, so the run is a sequence of steps, and the runout a pass leaves is drawn from a distribution in the transition's kernel, so a run depends on its seed.",
    places: [
      {
        id: "place__laced",
        name: "Laced",
        description:
          "Wheels waiting for a pass on the truing stand, each with its runout in millimetres and the passes it has had. Holds up to 16 wheels.",
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        showAsInitialState: true,
        x: -32 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__measured",
        name: "Measured",
        description:
          "Wheels just off the stand, carrying the runout the pass left. One of Accept, Retrue and Reject takes each. Holds up to 16 wheels.",
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 0 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__accepted",
        name: "Accepted",
        description: "Wheels within tolerance. Holds up to 16 wheels.",
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 32 * GRID_SIZE,
        y: -10 * GRID_SIZE,
      },
      {
        id: "place__rejected",
        name: "Rejected",
        description:
          "Wheels still out of tolerance after their last pass. Holds up to 16 wheels.",
        colorId: "type__wheel",
        dynamicsEnabled: false,
        capacity: 16,
        x: 32 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__truing_pass",
        name: "TruingPass",
        description:
          "One pass on the truing stand. It fires once per step while a wheel is waiting, and its kernel draws the runout the pass leaves.",
        inputArcs: [{ placeId: "place__laced", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__measured", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: the stand takes the next wheel as soon as one is waiting.

return true;`,
        transitionKernelCode: `// A pass leaves about (1 - correction) of the wobble, give or take: the new
// runout is drawn around that share of the old one, so a careless pass can
// leave a wheel worse than it found it. A wheel is never left perfect.

const wheel = input.Laced[0];
const runout = Distribution.Gaussian(
  wheel.runout * (1 - parameters.correction),
  wheel.runout * parameters.spread,
);

return {
  Measured: [
    {
      runout: runout.map((measured) => Math.max(0.05, measured)),
      passes: wheel.passes + 1,
    },
  ],
};`,
        x: -16 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "transition__accept",
        name: "Accept",
        description: "Takes a measured wheel whose runout is within tolerance.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__accepted", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel within tolerance.

return input.Measured[0].runout <= parameters.tolerance;`,
        transitionKernelCode: `// The wheel moves on as it is.

const wheel = input.Measured[0];

return {
  Accepted: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: 16 * GRID_SIZE,
        y: -10 * GRID_SIZE,
      },
      {
        id: "transition__retrue",
        name: "Retrue",
        description:
          "Sends a wheel that is still out of tolerance, with passes left, back to the stand's queue.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__laced", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel that is still out and has a pass left.

const wheel = input.Measured[0];

return wheel.runout > parameters.tolerance && wheel.passes < parameters.max_passes;`,
        transitionKernelCode: `// The wheel goes back to the queue with its runout and its count of passes.

const wheel = input.Measured[0];

return {
  Laced: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: -16 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "transition__reject",
        name: "Reject",
        description:
          "Takes a wheel that is still out of tolerance after its last pass.",
        inputArcs: [
          { placeId: "place__measured", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__rejected", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Holds for a wheel that is still out and has had its last pass.

const wheel = input.Measured[0];

return wheel.runout > parameters.tolerance && wheel.passes >= parameters.max_passes;`,
        transitionKernelCode: `// The wheel leaves the line as it is.

const wheel = input.Measured[0];

return {
  Rejected: [{ runout: wheel.runout, passes: wheel.passes }],
};`,
        x: 16 * GRID_SIZE,
        y: 10 * GRID_SIZE,
      },
    ],
    types: [
      {
        id: "type__wheel",
        name: "Wheel",
        description:
          "A bicycle wheel, tracked by its runout (the wobble of the rim, in millimetres) and the truing passes it has had.",
        iconSlug: "circle",
        displayColor: "#E67E22",
        elements: [
          {
            elementId: "element__runout",
            name: "runout",
            type: "real",
          },
          {
            elementId: "element__passes",
            name: "passes",
            type: "integer",
          },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "param__tolerance",
        name: "Tolerance",
        variableName: "tolerance",
        type: "real",
        defaultValue: "0.5",
      },
      {
        id: "param__max_passes",
        name: "Max Passes",
        variableName: "max_passes",
        type: "integer",
        defaultValue: "4",
      },
      {
        id: "param__correction",
        name: "Correction",
        variableName: "correction",
        type: "real",
        defaultValue: "0.45",
      },
      {
        id: "param__spread",
        name: "Spread",
        variableName: "spread",
        type: "real",
        defaultValue: "0.25",
      },
    ],
    scenarios: [
      batchScenario({
        id: "scenario__batch_of_six",
        name: "Batch of Six",
        description:
          "Six wheels laced 3 mm out, a tolerance of 0.5 mm and at most four passes each. Run it as a Stochastic simulation to read the expected yield by step.",
        wheels: 6,
        initialRunout: 3,
        tolerance: 0.5,
        maxPasses: 4,
      }),
      batchScenario({
        id: "scenario__tight_tolerance",
        name: "Tight Tolerance",
        description:
          "The same batch held to 0.25 mm: most wheels use every pass, and fewer make it.",
        wheels: 6,
        initialRunout: 3,
        tolerance: 0.25,
        maxPasses: 4,
      }),
    ],
    metrics: [
      {
        id: "metric__yield",
        name: "Yield",
        description: "Share of the wheels done so far that were accepted.",
        code: `const accepted = state.places.Accepted.count;
const done = accepted + state.places.Rejected.count;
return done === 0 ? 0 : accepted / done;`,
      },
      {
        id: "metric__passes_per_accepted_wheel",
        name: "Passes per accepted wheel",
        description: "Mean number of truing passes an accepted wheel took.",
        code: `const accepted = state.places.Accepted.count;
if (accepted === 0) return 0;
return state.places.Accepted.tokens.reduce((sum, wheel) => sum + wheel.passes, 0) / accepted;`,
      },
    ],
  },
};
