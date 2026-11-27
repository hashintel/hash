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

/** Two places of one token type, with a guard and a kernel that read it. */
export const colouredTokenFlowNet: SDCPN = {
  places: [
    {
      id: "p_queued",
      name: "Queued",
      colorId: "type_ticket",
      dynamicsEnabled: false,
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_processed",
      name: "Processed",
      colorId: "type_ticket",
      dynamicsEnabled: false,
      x: 520,
      y: 180,
    },
  ],
  transitions: [
    {
      id: "t_process",
      name: "Process",
      inputArcs: [{ placeId: "p_queued", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p_processed", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: `return input.Queued[0].age >= 0;`,
      transitionKernelCode: `return {
  Processed: [{ age: input.Queued[0].age + 1 }],
};`,
      x: 320,
      y: 205,
    },
  ],
  types: [
    {
      id: "type_ticket",
      name: "Ticket",
      iconSlug: "circle",
      displayColor: "#0f766e",
      elements: [{ elementId: "ticket_age", name: "age", type: "real" }],
    },
  ],
  parameters: [],
  differentialEquations: [],
};

/** A typed place whose tokens follow a differential equation until a guard releases them. */
export const colouredDynamicsNet: SDCPN = {
  places: [
    {
      id: "p_heating",
      name: "Heating",
      colorId: "type_batch",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "de_heat_up" }],
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_ready",
      name: "Ready",
      colorId: "type_batch",
      dynamicsEnabled: false,
      x: 520,
      y: 180,
    },
  ],
  transitions: [
    {
      id: "t_release",
      name: "Release",
      inputArcs: [{ placeId: "p_heating", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p_ready", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: `return input.Heating[0].temperature >= 80;`,
      transitionKernelCode: `return {
  Ready: [{ temperature: input.Heating[0].temperature }],
};`,
      x: 320,
      y: 205,
    },
  ],
  types: [
    {
      id: "type_batch",
      name: "Batch",
      iconSlug: "circle",
      displayColor: "#b45309",
      elements: [
        { elementId: "temperature", name: "temperature", type: "real" },
      ],
    },
  ],
  parameters: [],
  differentialEquations: [
    {
      id: "de_heat_up",
      name: "Heat up",
      colorId: "type_batch",
      arity: 1,
      code: `return { temperature: 5 };`,
    },
  ],
};

/** A source that fires at a rate into an untyped queue. */
export const stochasticTimingNet: SDCPN = {
  places: [
    {
      id: "p_queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 260,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_served",
      name: "Served",
      colorId: null,
      dynamicsEnabled: false,
      x: 660,
      y: 180,
    },
  ],
  transitions: [
    {
      id: "t_arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [{ placeId: "p_queue", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: `return 0.5;`,
      transitionKernelCode: "",
      x: 80,
      y: 205,
    },
    {
      id: "t_serve",
      name: "Serve",
      inputArcs: [{ placeId: "p_queue", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p_served", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: `return true;`,
      transitionKernelCode: "",
      x: 460,
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

/** A part on the visualized line: its size is the radius it is drawn with. */
const partElements = [
  { elementId: "size", name: "size", type: "real" as const },
];

/**
 * A station that works one part at a time: a queue at its In port, the part
 * being worked on, and what it has put out. Its visualizer draws all three,
 * so each instance shows on its card what goes on inside it.
 */
const stationComponent: Component = {
  id: "station",
  name: "Station",
  displayColor: "#16a34a",
  places: [
    place("station_in", "In", 80, 160, {
      colorId: "station_part",
      isPort: true,
      portDirection: "in",
    }),
    place("station_working", "Working", 440, 160, {
      colorId: "station_part",
      capacity: 1,
    }),
    place("station_out", "Out", 800, 160, {
      colorId: "station_part",
      isPort: true,
      portDirection: "out",
    }),
  ],
  transitions: [
    {
      id: "station_start",
      name: "Start",
      inputArcs: [{ placeId: "station_in", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "station_working", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: `return 4;`,
      transitionKernelCode: `return { Working: [{ size: input.In[0].size }] };`,
      x: 260,
      y: 160,
    },
    {
      id: "station_finish",
      name: "Finish",
      inputArcs: [{ placeId: "station_working", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "station_out", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: `return parameters.rate;`,
      transitionKernelCode: `return { Out: [{ size: input.Working[0].size }] };`,
      x: 620,
      y: 160,
    },
  ],
  types: [
    {
      id: "station_part",
      name: "Part",
      iconSlug: "circle",
      displayColor: "#2563eb",
      elements: partElements,
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "station_rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    },
  ],
  visualizerCode: `// Draws one station: its queue, the part it works on and what it put out.
// \`places\` holds every place of the component, for this instance alone.
const queue = places.In.tokens;
const working = places.Working.tokens;
return (
  <Visualizer.Svg viewBox="0 0 200 124">
    <text x="12" y="18" fontSize="10" fill="#6b7280">QUEUE</text>
    <text x="188" y="18" fontSize="10" textAnchor="end" fill="#111827">{queue.length}</text>
    {queue.slice(0, 9).map((part, index) => (
      <circle key={index} cx={20 + index * 20} cy={36} r={part.size / 2} fill="#bfdbfe" stroke="#2563eb" />
    ))}
    <rect x="12" y="54" width="176" height="38" rx="8"
      fill={working.length > 0 ? "#dcfce7" : "#f3f4f6"}
      stroke={working.length > 0 ? "#16a34a" : "#d1d5db"} />
    {working.map((part, index) => (
      <circle key={index} cx={100} cy={73} r={part.size} fill="#22c55e" />
    ))}
    {working.length === 0 && (
      <text x="100" y="77" fontSize="10" textAnchor="middle" fill="#9ca3af">idle</text>
    )}
    <text x="12" y="112" fontSize="10" fill="#6b7280">{parameters.rate.toFixed(1)} / s</text>
    <text x="188" y="112" fontSize="10" textAnchor="end" fill="#111827">{places.Out.count} out</text>
  </Visualizer.Svg>
);`,
};

/**
 * A line of two stations of one component, with a visualizer at each level:
 * the root net draws its three places as lanes, and the Station component
 * draws its inside on the card of each of its instances. The stations run at
 * different rates, so the two cards show different states of one picture.
 */
export const visualizedLineNet: SDCPN = {
  places: [
    place("parts", "Parts", 330, 220, { colorId: "part" }),
    place("buffer", "Buffer", 790, 220, { colorId: "part" }),
    place("finished", "Finished", 1250, 220, { colorId: "part" }),
  ],
  transitions: [
    {
      id: "arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [{ placeId: "parts", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: `return 1.2;`,
      transitionKernelCode: `return { Parts: [{ size: Distribution.Uniform(4, 12) }] };`,
      x: 100,
      y: 220,
    },
  ],
  types: [
    {
      id: "part",
      name: "Part",
      iconSlug: "circle",
      displayColor: "#2563eb",
      elements: partElements,
    },
  ],
  parameters: [],
  differentialEquations: [],
  components: [stationComponent],
  componentInstances: [
    {
      id: "cutter",
      name: "Cutter",
      component: { id: "station" },
      parameterValues: { station_rate: "1.5" },
      x: 560,
      y: 220,
    },
    {
      id: "drill",
      name: "Drill",
      component: { id: "station" },
      parameterValues: { station_rate: "0.8" },
      x: 1020,
      y: 220,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      name: "Parts",
      members: [
        { kind: "place", placeId: "parts" },
        port("cutter", "station_in"),
      ],
    },
    {
      id: "fuse_buffer",
      name: "Buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("cutter", "station_out"),
        port("drill", "station_in"),
      ],
    },
    {
      id: "fuse_finished",
      name: "Finished",
      members: [
        { kind: "place", placeId: "finished" },
        port("drill", "station_out"),
      ],
    },
  ],
  visualizerCode: `// Draws the whole line: one lane per place of the root net.
// \`places\` holds every place by name, each with its \`count\` and its \`tokens\`.
const lanes = [
  { name: "Parts", tokens: places.Parts.tokens },
  { name: "Buffer", tokens: places.Buffer.tokens },
  { name: "Finished", tokens: places.Finished.tokens },
];
const laneWidth = width / lanes.length;
const perRow = Math.max(1, Math.floor((laneWidth - 24) / 16));
return (
  <Visualizer.Svg>
    {lanes.map((lane, index) => (
      <g key={lane.name} transform={\`translate(\${index * laneWidth} 0)\`}>
        <rect x="4" y="4" width={laneWidth - 8} height={height - 8} rx="8" fill="#f9fafb" stroke="#e5e7eb" />
        <text x="14" y="22" fontSize="11" fill="#6b7280">{lane.name}</text>
        <text x={laneWidth - 14} y="22" fontSize="11" textAnchor="end" fill="#111827">{lane.tokens.length}</text>
        {lane.tokens.slice(0, perRow * 6).map((part, at) => (
          <circle key={at}
            cx={20 + (at % perRow) * 16}
            cy={42 + Math.floor(at / perRow) * 16}
            r={part.size / 2}
            fill="#bfdbfe" stroke="#2563eb" />
        ))}
      </g>
    ))}
  </Visualizer.Svg>
);`,
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
