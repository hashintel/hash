import { GRID_SIZE } from "../grid-size";

import type { Scenario, SDCPN } from "../types/sdcpn";

/** The stock a scenario starts the workshop with, by scenario parameter. */
type Stock = {
  rims: number;
  tyres: number;
  frames: number;
  saddles: number;
  stands: number;
};

const stockPlaces: Record<keyof Stock, string> = {
  rims: "place__rims",
  tyres: "place__tyres",
  frames: "place__frames",
  saddles: "place__saddles",
  stands: "place__free_stands",
};

const stockNames = Object.keys(stockPlaces) as (keyof Stock)[];

/** One scenario of the model: the parts and workstands the day starts with. */
const stockScenario = ({
  id,
  name,
  description,
  stock,
}: {
  id: string;
  name: string;
  description: string;
  stock: Stock;
}): Scenario => ({
  id,
  name,
  description,
  scenarioParameters: stockNames.map((identifier) => ({
    type: "integer",
    identifier,
    default: stock[identifier],
  })),
  parameterOverrides: {},
  initialState: {
    type: "adhoc",
    content: {
      variables: stockNames.map((identifier) => ({
        name: identifier,
        type: "integer",
        expression: String(stock[identifier]),
        exposed: true,
        optimize: null,
      })),
      netParameters: [],
      places: Object.fromEntries(
        stockNames.map((identifier) => [
          stockPlaces[identifier],
          {
            kind: "uncoloured",
            count: { expression: `scenario.${identifier}`, optimize: null },
          },
        ]),
      ),
    },
  },
});

/**
 * Bicycle Assembly: an untimed net. A workshop turns a stock of parts into
 * bicycles, and nothing in it takes time, so a run is a sequence of steps.
 *
 * Every transition is a predicate that always holds: the arcs alone decide
 * when it can fire. In one step each transition takes one turn, in the order
 * FitTyre, MountFrame, FitWheels, Finish, and fires once if its input places
 * hold the tokens its arcs ask for. What a step produces arrives at the end
 * of the step, so a part moves one stage per step.
 *
 * - FitTyre joins one rim and one tyre into a wheel.
 * - MountFrame puts a frame on a free workstand.
 * - FitWheels takes two wheels for the frame on a stand.
 * - Finish adds a saddle, and hands the stand back.
 *
 * The run ends at the first step that fires nothing. From the Morning Stock
 * of 10 rims, 9 tyres, 5 frames, 4 saddles and 2 stands that is after step
 * 10, with 4 bicycles built. What is left says where the line stopped: one
 * rim with no tyre, and a fifth frame holding a stand with one wheel and no
 * saddle to come.
 *
 * The net draws nothing at random, so every run of a scenario is the same
 * run.
 */
export const bicycleAssembly: { title: string; petriNetDefinition: SDCPN } = {
  title: "Bicycle Assembly",
  petriNetDefinition: {
    description:
      "An untimed net: a workshop builds bicycles from a stock of rims, tyres, frames and saddles on a few workstands. Nothing takes time, so the run is a sequence of steps that ends when no transition can fire, and what is left over shows which part ran out.",
    places: [
      {
        id: "place__rims",
        name: "Rims",
        description: "Bare rims in stock. FitTyre takes one per wheel.",
        colorId: null,
        dynamicsEnabled: false,
        showAsInitialState: true,
        x: -44 * GRID_SIZE,
        y: -12 * GRID_SIZE,
      },
      {
        id: "place__tyres",
        name: "Tyres",
        description: "Tyres in stock. FitTyre takes one per wheel.",
        colorId: null,
        dynamicsEnabled: false,
        showAsInitialState: true,
        x: -44 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__wheels",
        name: "Wheels",
        description:
          "Finished wheels waiting for a frame. FitWheels takes two at a time, so it fires every other step at best.",
        colorId: null,
        dynamicsEnabled: false,
        x: -12 * GRID_SIZE,
        y: -6 * GRID_SIZE,
      },
      {
        id: "place__frames",
        name: "Frames",
        description: "Frames in stock, waiting for a free workstand.",
        colorId: null,
        dynamicsEnabled: false,
        showAsInitialState: true,
        x: -60 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "place__free_stands",
        name: "FreeStands",
        description:
          "Workstands with nothing on them. A stand is taken when a frame is mounted and handed back when the bicycle is finished, so the stands bound the work in progress.",
        colorId: null,
        dynamicsEnabled: false,
        showAsInitialState: true,
        x: -12 * GRID_SIZE,
        y: 28 * GRID_SIZE,
      },
      {
        id: "place__on_stand",
        name: "OnStand",
        description: "Frames mounted on a workstand, waiting for two wheels.",
        colorId: null,
        dynamicsEnabled: false,
        x: -28 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "place__rolling",
        name: "Rolling",
        description:
          "Frames with both wheels fitted, still on their stand, waiting for a saddle.",
        colorId: null,
        dynamicsEnabled: false,
        x: 4 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "place__saddles",
        name: "Saddles",
        description: "Saddles in stock. Finish takes one per bicycle.",
        colorId: null,
        dynamicsEnabled: false,
        showAsInitialState: true,
        x: 20 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__bicycles",
        name: "Bicycles",
        description: "Finished bicycles: what the stock was turned into.",
        colorId: null,
        dynamicsEnabled: false,
        x: 36 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__fit_tyre",
        name: "FitTyre",
        description:
          "Joins one rim and one tyre into a wheel. It fires once per step while both are in stock, so the wheels arrive one per step.",
        inputArcs: [
          { placeId: "place__rims", weight: 1, type: "standard" },
          { placeId: "place__tyres", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__wheels", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: the two input arcs decide when a wheel can be built.

return true;`,
        transitionKernelCode: "",
        x: -28 * GRID_SIZE,
        y: -6 * GRID_SIZE,
      },
      {
        id: "transition__mount_frame",
        name: "MountFrame",
        description:
          "Puts one frame on a free workstand. With no stand free it waits, whatever the stock of frames.",
        inputArcs: [
          { placeId: "place__frames", weight: 1, type: "standard" },
          { placeId: "place__free_stands", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__on_stand", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: a frame is mounted as soon as a stand is free.

return true;`,
        transitionKernelCode: "",
        x: -44 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "transition__fit_wheels",
        name: "FitWheels",
        description:
          "Fits two wheels to a mounted frame. The arc from Wheels has weight 2, so one wheel is never enough.",
        inputArcs: [
          { placeId: "place__on_stand", weight: 1, type: "standard" },
          { placeId: "place__wheels", weight: 2, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__rolling", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: the arc of weight 2 from Wheels asks for the pair.

return true;`,
        transitionKernelCode: "",
        x: -12 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
      {
        id: "transition__finish",
        name: "Finish",
        description:
          "Adds a saddle to a rolling frame: the bicycle leaves the line and its workstand is free again.",
        inputArcs: [
          { placeId: "place__rolling", weight: 1, type: "standard" },
          { placeId: "place__saddles", weight: 1, type: "standard" },
        ],
        outputArcs: [
          { placeId: "place__bicycles", weight: 1 },
          { placeId: "place__free_stands", weight: 1 },
        ],
        lambdaType: "predicate",
        lambdaCode: `// Always holds: a rolling frame is finished as soon as a saddle is in stock.

return true;`,
        transitionKernelCode: "",
        x: 20 * GRID_SIZE,
        y: 14 * GRID_SIZE,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [],
    scenarios: [
      stockScenario({
        id: "scenario__morning_stock",
        name: "Morning Stock",
        description:
          "10 rims, 9 tyres, 5 frames, 4 saddles and 2 workstands. The run ends after step 10 with 4 bicycles: the saddles run out, and a fifth frame is left on a stand.",
        stock: { rims: 10, tyres: 9, frames: 5, saddles: 4, stands: 2 },
      }),
      stockScenario({
        id: "scenario__one_stand",
        name: "One Workstand",
        description:
          "The same parts with a single workstand: the fifth frame takes the stand and never leaves it, as before, but every bicycle now waits for the one ahead of it.",
        stock: { rims: 10, tyres: 9, frames: 5, saddles: 4, stands: 1 },
      }),
    ],
    metrics: [
      {
        id: "metric__bicycles",
        name: "Bicycles",
        description: "Bicycles finished so far.",
        code: `return state.places.Bicycles.count;`,
      },
      {
        id: "metric__work_in_progress",
        name: "Work in progress",
        description: "Frames on a workstand, with or without their wheels.",
        code: `return state.places.OnStand.count + state.places.Rolling.count;`,
      },
    ],
  },
};
