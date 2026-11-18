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

/** A bare rim around the origin: the ring, its spokes and the hub. */
const rimPart = `
          <path
            d="M-13.5 0H13.5M0 -13.5V13.5M-9.5 -9.5L9.5 9.5M-9.5 9.5L9.5 -9.5"
            stroke="#cbd5e1"
            strokeWidth="0.8"
          />
          <circle r="13.5" fill="none" stroke="#94a3b8" strokeWidth="2.4" />
          <circle r="2.2" fill="#64748b" />`;

/** A tyre around the origin, wide enough to take a rim. */
const tyrePart = `
          <circle r="17" fill="none" stroke="#1f2937" strokeWidth="4.4" />
          <circle
            r="18.6"
            fill="none"
            stroke="#6b7280"
            strokeWidth="1.2"
            strokeDasharray="1.2 2.7"
          />`;

/** The outline of a saddle seen from the side, its nose to the right. */
const saddleShape =
  "M-17 -4C-17.6 -7.6 -14 -9 -10 -8.4L4 -6.6L15.6 -5.8C18.6 -5.6 18.6 -2.2 15.6 -2.2L5 -2C1 1.8 -15.4 3.4 -17 -4Z";

/** A saddle around the origin, on its rails and a stub of seat post. */
const saddlePart = `
          <path
            d="M-9 0L-3 7H7L11 -2M2 7V16"
            fill="none"
            stroke="#64748b"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="${saddleShape}" fill="#92400e" />`;

/** A workstand in a box of 100 by 66: the base, the post and the clamp. */
const standPart = `
          <path
            d="M50 60V16M38 61H62"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="44.5" y="8.5" width="11" height="8" rx="2.5" fill="#f59e0b" />`;

/** A frame in the same box: the two triangles, then the fork, the bar, the seat post and the chainring. */
const framePart = `
          <path
            d="M20 44H44L37 20ZM44 44L70 26L68 18L37 20"
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M70 26L80 44M68 18L66.5 11H73.5M37 20L35 13"
            fill="none"
            stroke="#475569"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="44" cy="44" r="3.2" fill="#475569" />`;

/** The two wheels of that frame, on its axles. */
const wheelsPart = `
          <path
            d="M7.6 44H32.4M20 31.6V56.4M11.2 35.2L28.8 52.8M11.2 52.8L28.8 35.2M67.6 44H92.4M80 31.6V56.4M71.2 35.2L88.8 52.8M71.2 52.8L88.8 35.2"
            stroke="#cbd5e1"
            strokeWidth="0.7"
          />
          <g fill="none" stroke="#94a3b8" strokeWidth="1.4">
            <circle cx="20" cy="44" r="12.4" />
            <circle cx="80" cy="44" r="12.4" />
          </g>
          <g fill="none" stroke="#1f2937" strokeWidth="3">
            <circle cx="20" cy="44" r="15" />
            <circle cx="80" cy="44" r="15" />
          </g>`;

/** The saddle on the seat post of that frame. */
const fittedSaddlePart = `
          <path
            d="${saddleShape}"
            fill="#92400e"
            transform="translate(35.5 12) scale(0.55)"
          />`;

/** Lifts what a workstand holds off the floor, up to its clamp. */
const onStand = (parts: string): string => `${standPart}
          <g transform="translate(0 -7)">${parts.replace(/\n/g, "\n  ")}
          </g>`;

/**
 * How a place lays its parts out: small parts drawn around the origin, or
 * parts as wide as a bicycle, drawn in a box of 100 by 66.
 */
const layouts: Record<
  "small" | "large",
  {
    /** The most parts a window draws. */
    most: number;
    /** The expression of the columns for the parts shown. */
    columns: string;
    /** The room one part takes, at a scale of 1. */
    width: number;
    height: number;
    largest: number;
    /** The middle of the box a part is drawn in, when not the origin. */
    middle: [number, number] | null;
  }
> = {
  small: {
    most: 32,
    columns:
      "shown <= 4 ? 4 : shown <= 6 ? 3 : shown <= 8 ? 4 : shown <= 15 ? 5 : shown <= 24 ? 6 : 8",
    width: 44,
    height: 44,
    largest: 2.2,
    middle: null,
  },
  large: {
    most: 20,
    columns: "shown <= 4 ? 2 : shown <= 9 ? 3 : shown <= 16 ? 4 : 5",
    width: 106,
    height: 70,
    largest: 1.55,
    middle: [50, 33],
  },
};

/**
 * The visualizer of a place of the workshop. A place holds a count and
 * nothing else, so each of the nine draws that many of the part it stands
 * for, side by side, and says so when it holds none.
 */
const partsVisualizer = ({
  comment,
  title,
  background = "#f8fafc",
  summary,
  empty,
  emptyInk = "#94a3b8",
  layout,
  part,
}: {
  /** The comment that opens the code. */
  comment: string;
  title: string;
  background?: string;
  /** The expression of the count shown under the title. */
  summary: string;
  /** What the place says with no token in it. */
  empty: string;
  emptyInk?: string;
  layout: "small" | "large";
  /** The part one token stands for. */
  part: string;
}): string => {
  const { most, columns, width, height, largest, middle } = layouts[layout];
  const [offsetX, offsetY] = middle
    ? middle.map((offset) => ` - ${offset} * scale`)
    : ["", ""];
  return `${comment}

// A place with no type holds tokens with no attribute: only their count.
const count = tokens.length;
const shown = Math.min(count, ${most});
const columns = ${columns};
const rows = Math.max(1, Math.ceil(shown / columns));
const cellWidth = 328 / columns;
const cellHeight = 176 / rows;
// A part is as large as its cell allows.
const scale = Math.min(cellWidth / ${width}, cellHeight / ${height}, ${largest});
// A single row that is not full sits in the middle of the window.
const left = 16 + (rows > 1 ? 0 : ((columns - shown) * cellWidth) / 2);

return (
  <Visualizer.Svg viewBox="0 0 360 240" backgroundColor="${background}">
    <text x="16" y="22" fontSize="13" fontWeight="600" fill="#0f172a">
      ${title}
    </text>
    <text x="16" y="36" fontSize="10.5" fill="#64748b">
      {${summary}}
      {count > shown && " · the first " + shown + " drawn"}
    </text>
    <line x1="16" x2="344" y1="44" y2="44" stroke="#e2e8f0" />
    {count === 0 && (
      <g>
        <rect
          x="64"
          y="104"
          width="232"
          height="72"
          rx="12"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="1.2"
          strokeDasharray="5 5"
        />
        <text
          x="180"
          y="144"
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill="${emptyInk}"
        >
          ${empty}
        </text>
      </g>
    )}
    {tokens.slice(0, ${most}).map((_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      // ${middle ? "The corner of the box the part is drawn in" : "The middle of the part"}.
      const x = left + (column + 0.5) * cellWidth${offsetX};
      const y = 52 + (row + 0.5) * cellHeight${offsetY};
      return (
        <g key={index} transform={\`translate(\${x} \${y}) scale(\${scale})\`}>${part}
        </g>
      );
    })}
  </Visualizer.Svg>
);`;
};

/** A stock place: parts a transition takes and nothing puts back. */
const stockVisualizer = ({
  title,
  takenBy,
  empty,
  layout = "small",
  part,
}: {
  title: string;
  /** What takes a part from the stock, to close the opening comment. */
  takenBy: string;
  empty: string;
  layout?: "small" | "large";
  part: string;
}): string =>
  partsVisualizer({
    comment: `// ${title} in stock. ${takenBy}`,
    title,
    summary: `count > 0 ? count + " in stock" : "none left"`,
    empty,
    emptyInk: "#b45309",
    layout,
    part,
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
 *
 * No place has a type, and every place has a visualizer: it draws as many
 * of the part the place stands for as the place holds tokens. A wheel is a
 * tyre on a rim and a bicycle is that frame, those wheels and that saddle,
 * so the nine pictures are drawn from the same few parts.
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
        visualizerCode: stockVisualizer({
          title: "Rims",
          takenBy: "FitTyre takes one per wheel.",
          empty: "Out of rims",
          part: rimPart,
        }),
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
        visualizerCode: stockVisualizer({
          title: "Tyres",
          takenBy: "FitTyre takes one per wheel.",
          empty: "Out of tyres",
          part: tyrePart,
        }),
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
        visualizerCode: partsVisualizer({
          comment:
            "// Wheels built and not yet fitted: a tyre on a rim. FitWheels takes two.",
          title: "Wheels",
          summary: `count > 1 ? count + " ready for a frame" : count > 0 ? "1 ready · a frame takes 2" : "none ready"`,
          empty: "No wheel is waiting",
          layout: "small",
          part: `${tyrePart}${rimPart}`,
        }),
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
        visualizerCode: stockVisualizer({
          title: "Frames",
          takenBy: "MountFrame puts one on a free workstand.",
          empty: "Out of frames",
          layout: "large",
          part: framePart,
        }),
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
        visualizerCode: partsVisualizer({
          comment:
            "// Workstands with nothing on them. MountFrame takes one, Finish hands it back.",
          title: "Free workstands",
          summary: `count > 0 ? count + " free" : "none free"`,
          empty: "Every stand is taken",
          emptyInk: "#b45309",
          layout: "large",
          part: standPart,
        }),
        x: -12 * GRID_SIZE,
        y: 28 * GRID_SIZE,
      },
      {
        id: "place__on_stand",
        name: "OnStand",
        description: "Frames mounted on a workstand, waiting for two wheels.",
        colorId: null,
        dynamicsEnabled: false,
        visualizerCode: partsVisualizer({
          comment:
            "// Frames on a workstand, lifted off the floor, waiting for two wheels.",
          title: "On a stand",
          summary: `count > 0 ? count + " waiting for two wheels" : "none waiting"`,
          empty: "No frame is waiting for wheels",
          layout: "large",
          part: onStand(framePart),
        }),
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
        visualizerCode: partsVisualizer({
          comment:
            "// Frames with both wheels fitted, still on their stand: the seat post is bare.",
          title: "Rolling",
          summary: `count > 0 ? count + " waiting for a saddle" : "none waiting"`,
          empty: "No frame is waiting for a saddle",
          layout: "large",
          part: onStand(`${wheelsPart}${framePart}`),
        }),
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
        visualizerCode: stockVisualizer({
          title: "Saddles",
          takenBy: "Finish takes one per bicycle.",
          empty: "Out of saddles",
          part: saddlePart,
        }),
        x: 20 * GRID_SIZE,
        y: 0 * GRID_SIZE,
      },
      {
        id: "place__bicycles",
        name: "Bicycles",
        description: "Finished bicycles: what the stock was turned into.",
        colorId: null,
        dynamicsEnabled: false,
        visualizerCode: partsVisualizer({
          comment:
            "// Finished bicycles, off their stand: frame, two wheels and a saddle.",
          title: "Bicycles",
          background: "#f0fdf4",
          summary: `count > 0 ? count + " built" : "none yet"`,
          empty: "No bicycle is built yet",
          layout: "large",
          part: `${wheelsPart}${framePart}${fittedSaddlePart}`,
        }),
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
