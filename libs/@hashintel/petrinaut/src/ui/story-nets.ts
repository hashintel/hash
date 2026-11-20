import {
  type Component,
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  type SDCPN,
} from "@hashintel/petrinaut-core";

/** Three places in a line, with nothing an extension adds. */
export const barePetriNet: SDCPN = {
  places: [
    {
      id: "p_waiting",
      name: "Waiting",
      colorId: null,
      dynamicsEnabled: false,
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_processing",
      name: "Processing",
      colorId: null,
      dynamicsEnabled: false,
      x: 430,
      y: 180,
    },
    {
      id: "p_done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      x: 740,
      y: 180,
    },
  ],
  transitions: [
    {
      id: "t_start",
      name: "Start",
      inputArcs: [{ placeId: "p_waiting", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p_processing", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "",
      x: 290,
      y: 205,
    },
    {
      id: "t_finish",
      name: "Finish",
      inputArcs: [{ placeId: "p_processing", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p_done", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "",
      x: 600,
      y: 205,
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const place = (
  id: string,
  name: string,
  x: number,
  y: number,
  extra: Partial<SDCPN["places"][number]> = {},
): SDCPN["places"][number] => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x,
  y,
  ...extra,
});

/** A stage with one input port and one output port, processing one token at a time. */
const stageComponent: Component = {
  id: "stage",
  name: "Stage",
  places: [
    place("stage_in", "In", 80, 160, { isPort: true, portDirection: "in" }),
    place("stage_out", "Out", 440, 160, { isPort: true, portDirection: "out" }),
  ],
  transitions: [
    {
      id: "stage_process",
      name: "Process",
      inputArcs: [{ placeId: "stage_in", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "stage_out", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: generateDefaultLambdaCode("stochastic"),
      transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
      x: 260,
      y: 160,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const port = (componentInstanceId: string, portPlaceId: string) => ({
  kind: "componentPort" as const,
  componentInstanceId,
  portPlaceId,
});

/**
 * Two stages of one component fused through the root's places: Parts feeds
 * the cutter, the capacity-bounded Buffer sits between the stages, Finished
 * collects the drill's output.
 */
export const fusedLineNet: SDCPN = {
  places: [
    place("parts", "Parts", 100, 220, { showAsInitialState: true }),
    place("buffer", "Buffer", 520, 220, { capacity: 5 }),
    place("finished", "Finished", 940, 220),
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  components: [stageComponent],
  componentInstances: [
    {
      id: "cutter",
      name: "Cutter",
      component: { id: "stage" },
      parameterValues: {},
      x: 310,
      y: 220,
    },
    {
      id: "drill",
      name: "Drill",
      component: { id: "stage" },
      parameterValues: {},
      x: 730,
      y: 220,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      name: "Parts",
      members: [
        { kind: "place", placeId: "parts" },
        port("cutter", "stage_in"),
      ],
    },
    {
      id: "fuse_buffer",
      name: "Buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("cutter", "stage_out"),
        port("drill", "stage_in"),
      ],
    },
    {
      id: "fuse_finished",
      name: "Finished",
      members: [
        { kind: "place", placeId: "finished" },
        port("drill", "stage_out"),
      ],
    },
  ],
};

/** The stage as a signature alone: two ports, no transition. */
const stageInterface: Component = {
  id: "stage_interface",
  name: "Stage",
  interface: true,
  places: [
    place("iface_in", "In", 80, 160, { isPort: true, portDirection: "in" }),
    place("iface_out", "Out", 440, 160, { isPort: true, portDirection: "out" }),
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * An implementation of the stage: one Process transition between its ports,
 * or two with a half-done place between them for the slow variant.
 */
const stageImplementation = (
  id: string,
  name: string,
  steps: 1 | 2,
): Component => {
  const stochastic = {
    lambdaType: "stochastic" as const,
    lambdaCode: generateDefaultLambdaCode("stochastic"),
    transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
    y: 160,
  };
  return {
    id,
    name,
    implements: ["stage_interface"],
    places: [
      place(`${id}_in`, "In", 80, 160, { isPort: true, portDirection: "in" }),
      ...(steps === 2 ? [place(`${id}_half`, "HalfDone", 440, 160)] : []),
      place(`${id}_out`, "Out", steps === 2 ? 800 : 440, 160, {
        isPort: true,
        portDirection: "out",
      }),
    ],
    transitions:
      steps === 1
        ? [
            {
              id: `${id}_process`,
              name: "Process",
              inputArcs: [{ placeId: `${id}_in`, weight: 1, type: "standard" }],
              outputArcs: [{ placeId: `${id}_out`, weight: 1 }],
              x: 260,
              ...stochastic,
            },
          ]
        : [
            {
              id: `${id}_prepare`,
              name: "Prepare",
              inputArcs: [{ placeId: `${id}_in`, weight: 1, type: "standard" }],
              outputArcs: [{ placeId: `${id}_half`, weight: 1 }],
              x: 260,
              ...stochastic,
            },
            {
              id: `${id}_finish`,
              name: "Finish",
              inputArcs: [
                { placeId: `${id}_half`, weight: 1, type: "standard" },
              ],
              outputArcs: [{ placeId: `${id}_out`, weight: 1 }],
              x: 620,
              ...stochastic,
            },
          ],
    types: [],
    differentialEquations: [],
    parameters: [],
  };
};

/**
 * The fused line wired against the Stage interface: the document runs the
 * fast stage by default, and the drill chooses the slow one for itself.
 */
export const interfacedLineNet: SDCPN = {
  ...fusedLineNet,
  components: [
    stageInterface,
    stageImplementation("fast_stage", "Fast stage", 1),
    stageImplementation("slow_stage", "Slow stage", 2),
  ],
  implementations: [
    { interface: { id: "stage_interface" }, component: { id: "fast_stage" } },
  ],
  componentInstances: [
    {
      id: "cutter",
      name: "Cutter",
      component: { id: "stage_interface" },
      parameterValues: {},
      x: 310,
      y: 220,
    },
    {
      id: "drill",
      name: "Drill",
      component: { id: "stage_interface" },
      implementation: { id: "slow_stage" },
      parameterValues: {},
      x: 730,
      y: 220,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      name: "Parts",
      members: [
        { kind: "place", placeId: "parts" },
        port("cutter", "iface_in"),
      ],
    },
    {
      id: "fuse_buffer",
      name: "Buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("cutter", "iface_out"),
        port("drill", "iface_in"),
      ],
    },
    {
      id: "fuse_finished",
      name: "Finished",
      members: [
        { kind: "place", placeId: "finished" },
        port("drill", "iface_out"),
      ],
    },
  ],
};

/** A cell with seven ports: four feeds in, three results out. */
const cellComponent: Component = {
  id: "cell",
  name: "Cell",
  displayColor: "#14b8a6",
  iconSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20V11l5 3v-3l5 3V5h4v15"/><path d="M9 17h.01M13 17h.01M17 17h.01"/></svg>',
  places: [
    place("cell_frames", "Frames", 80, 80, {
      isPort: true,
      portDirection: "in",
    }),
    place("cell_boards", "Boards", 80, 200, {
      isPort: true,
      portDirection: "in",
    }),
    place("cell_screws", "Screws", 80, 320, {
      isPort: true,
      portDirection: "in",
    }),
    place("cell_power", "Power", 80, 440, {
      isPort: true,
      portDirection: "in",
    }),
    place("cell_assemblies", "Assemblies", 620, 140, {
      isPort: true,
      portDirection: "out",
    }),
    place("cell_scrap", "Scrap", 620, 260, {
      isPort: true,
      portDirection: "out",
    }),
    place("cell_rejects", "Rejects", 620, 380, {
      isPort: true,
      portDirection: "out",
    }),
  ],
  transitions: [
    {
      id: "cell_assemble",
      name: "Assemble",
      inputArcs: [
        "cell_frames",
        "cell_boards",
        "cell_screws",
        "cell_power",
      ].map((placeId) => ({ placeId, weight: 1, type: "standard" as const })),
      outputArcs: ["cell_assemblies", "cell_scrap", "cell_rejects"].map(
        (placeId) => ({ placeId, weight: 1 }),
      ),
      lambdaType: "stochastic",
      lambdaCode: generateDefaultLambdaCode("stochastic"),
      transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
      x: 350,
      y: 260,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/**
 * One instance of the cell with every port wired: three feeds and three
 * results fused with the root's places, power fed by an arc. The card starts
 * folded, with the wires meeting its edges; its chevron unfolds the ports.
 */
export const manyPortsNet: SDCPN = {
  places: [
    place("frames", "Frames", 160, 120, { showAsInitialState: true }),
    place("boards", "Boards", 160, 260, { showAsInitialState: true }),
    place("screws", "Screws", 160, 400, { showAsInitialState: true }),
    place("assemblies", "Assemblies", 1040, 160),
    place("scrap", "Scrap", 1040, 300),
    place("rejects", "Rejects", 1040, 440),
  ],
  transitions: [
    {
      id: "supply_power",
      name: "Supply power",
      inputArcs: [],
      outputArcs: [{ endpoint: port("cell1", "cell_power"), weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: generateDefaultLambdaCode("stochastic"),
      transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
      x: 160,
      y: 540,
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
  components: [cellComponent],
  componentInstances: [
    {
      id: "cell1",
      name: "AssemblyCell",
      component: { id: "cell" },
      parameterValues: {},
      x: 600,
      y: 300,
    },
  ],
  fusions: (
    [
      ["frames", "cell_frames"],
      ["boards", "cell_boards"],
      ["screws", "cell_screws"],
      ["assemblies", "cell_assemblies"],
      ["scrap", "cell_scrap"],
      ["rejects", "cell_rejects"],
    ] as const
  ).map(([placeId, portPlaceId]) => ({
    id: `fuse_${placeId}`,
    name: `Cell ${placeId}`,
    members: [{ kind: "place" as const, placeId }, port("cell1", portPlaceId)],
  })),
};
