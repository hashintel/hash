/**
 * A deliberately large bottling-plant model for the search prototypes: the
 * point of fuzzy search only shows once the form is long enough that
 * scrolling for a name hurts. Twelve places across three colour types,
 * eighteen net parameters, a dozen top-level Variables, and per-place
 * Variables on the busier places — all generated from small tables, so the
 * fixture stays readable while the rendered form does not fit any screen.
 */

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
  AdHocColouredPlace,
} from "@hashintel/petrinaut-core";

const COLOUR_BOTTLE = {
  id: "colour-bottle",
  name: "Bottle",
  iconSlug: "circle",
  displayColor: "#2563eb",
  elements: [
    { elementId: "b1", name: "volume", type: "real" as const },
    { elementId: "b2", name: "filled", type: "boolean" as const },
    { elementId: "b3", name: "batch", type: "integer" as const },
  ],
};

const COLOUR_CRATE = {
  id: "colour-crate",
  name: "Crate",
  iconSlug: "circle",
  displayColor: "#9333ea",
  elements: [
    { elementId: "c1", name: "capacity", type: "integer" as const },
    { elementId: "c2", name: "weight", type: "real" as const },
  ],
};

const COLOUR_WORKER = {
  id: "colour-worker",
  name: "Worker",
  iconSlug: "circle",
  displayColor: "#0d9488",
  elements: [
    { elementId: "w1", name: "shift", type: "integer" as const },
    { elementId: "w2", name: "fatigue", type: "real" as const },
  ],
};

/** name → colour id (null = uncoloured). */
const PLACE_TABLE: [string, string | null][] = [
  ["EmptyBottles", "colour-bottle"],
  ["WashingStation", "colour-bottle"],
  ["FillingLine", "colour-bottle"],
  ["CappingLine", "colour-bottle"],
  ["LabelledBottles", "colour-bottle"],
  ["PackedCrates", "colour-crate"],
  ["CrateBuffer", "colour-crate"],
  ["ActiveWorkers", "colour-worker"],
  ["BreakRoom", "colour-worker"],
  ["RejectedBottles", null],
  ["SpilledVolume", null],
  ["MaintenanceTickets", null],
];

const PARAMETER_TABLE: [string, string, string][] = [
  ["Fill Rate", "fill_rate", "120"],
  ["Wash Rate", "wash_rate", "150"],
  ["Cap Rate", "cap_rate", "140"],
  ["Label Rate", "label_rate", "130"],
  ["Reject Ratio", "reject_ratio", "0.02"],
  ["Spill Ratio", "spill_ratio", "0.005"],
  ["Crate Capacity", "crate_capacity", "24"],
  ["Worker Count", "worker_count", "12"],
  ["Shift Length", "shift_length", "480"],
  ["Break Interval", "break_interval", "90"],
  ["Fatigue Per Hour", "fatigue_per_hour", "0.08"],
  ["Recovery Per Break", "recovery_per_break", "0.3"],
  ["Bottle Volume", "bottle_volume", "0.75"],
  ["Line Speed Factor", "line_speed_factor", "1"],
  ["Maintenance Threshold", "maintenance_threshold", "0.85"],
  ["Buffer Low Watermark", "buffer_low_watermark", "40"],
  ["Buffer High Watermark", "buffer_high_watermark", "220"],
  ["Startup Delay", "startup_delay", "15"],
];

const VARIABLE_TABLE: [string, "real" | "integer" | "boolean", string][] = [
  ["initial_bottles", "integer", "500"],
  ["initial_crates", "integer", "20"],
  ["warmup_minutes", "real", "30"],
  ["rush_order", "boolean", "false"],
  ["rush_multiplier", "real", "1.4"],
  ["base_fatigue", "real", "0.1"],
  ["night_shift", "boolean", "false"],
  ["seed_batch", "integer", "1"],
  ["target_output", "integer", "4000"],
  ["safety_stock", "integer", "150"],
  ["overflow_margin", "real", "0.15"],
  ["line_efficiency", "real", "0.92"],
];

function colouredPlace(
  colourId: string,
  variables: [string, string][],
  rowCount: number,
): AdHocColouredPlace {
  const columns =
    colourId === "colour-bottle" ? 3 : colourId === "colour-crate" ? 2 : 2;
  return {
    kind: "coloured",
    variables: variables.map(([name, expression]) => ({
      name,
      type: "real",
      expression,
      optimize: null,
    })),
    rows: Array.from({ length: rowCount }, (_ignoredRow, row) => ({
      kind: "fixed" as const,
      cells: Array.from({ length: columns }, (_ignoredCell, column) => ({
        expression: String((row + 1) * (column + 1)),
        optimize: null,
      })),
    })),
    sharedColumns: {},
  };
}

export const bottlingContext: AdHocSynthesisContext = {
  netParameters: PARAMETER_TABLE.map(([name, variableName, defaultValue]) => ({
    id: `param-${variableName}`,
    name,
    variableName,
    type: "real",
    defaultValue,
  })),
  places: PLACE_TABLE.map(([name, colorId], index) => ({
    id: `place-${name}`,
    name,
    colorId,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: index * 10,
    y: 0,
  })),
  types: [COLOUR_BOTTLE, COLOUR_CRATE, COLOUR_WORKER],
};

export const bottlingState: AdHocScenarioState = {
  variables: VARIABLE_TABLE.map(([name, type, expression]) => ({
    name,
    type,
    expression,
    optimize: null,
  })),
  netParameters: [
    { parameterId: "param-fill_rate", expression: "135", optimize: null },
    { parameterId: "param-worker_count", expression: "", optimize: null },
  ],
  places: {
    "place-EmptyBottles": colouredPlace(
      "colour-bottle",
      [
        ["wash_time", "2.5"],
        ["arrival_jitter", "0.2"],
      ],
      3,
    ),
    "place-WashingStation": colouredPlace("colour-bottle", [], 2),
    "place-FillingLine": colouredPlace(
      "colour-bottle",
      [
        ["fill_time", "60 / parameters.fill_rate"],
        ["overfill_risk", "scenario.overflow_margin / 2"],
      ],
      2,
    ),
    "place-CappingLine": colouredPlace("colour-bottle", [], 1),
    "place-LabelledBottles": colouredPlace("colour-bottle", [], 2),
    "place-PackedCrates": colouredPlace(
      "colour-crate",
      [["stack_height", "4"]],
      2,
    ),
    "place-CrateBuffer": colouredPlace("colour-crate", [], 1),
    "place-ActiveWorkers": colouredPlace(
      "colour-worker",
      [["rotation_offset", "scenario.warmup_minutes / 10"]],
      3,
    ),
    "place-BreakRoom": colouredPlace("colour-worker", [], 1),
    "place-RejectedBottles": {
      kind: "uncoloured",
      count: { expression: "0", optimize: null },
    },
    "place-SpilledVolume": {
      kind: "uncoloured",
      count: { expression: "0", optimize: null },
    },
    "place-MaintenanceTickets": {
      kind: "uncoloured",
      count: { expression: "2", optimize: null },
    },
  },
};
