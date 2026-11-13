import { useMemo, useState, useEffect } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  type ProvidedComponent,
  type ProvidedTokenType,
  type Subnet,
} from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  createJsonDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "../main";
import { useStoreSelector } from "../react/use-store";
import { Petrinaut } from "../ui/petrinaut";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "./plugins/define-petrinaut-plugin";
import {
  describeRefusal,
  type PluginDocumentReader,
} from "./plugins/plugin-access";
import {
  AssistantPanelTitle,
  useAssistantPanel,
} from "./plugins/plugin-assistant";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const barePetriNet: SDCPN = {
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

const barePetriNetCapabilities = {
  disabledExtensions: ["colors", "stochasticity", "dynamics", "parameters"],
} satisfies PetrinautHandleCapabilities;

const colouredTokensOnlyCapabilities = {
  disabledExtensions: ["stochasticity", "dynamics", "parameters"],
} satisfies PetrinautHandleCapabilities;

const colouredDynamicsCapabilities = {
  disabledExtensions: ["stochasticity", "parameters"],
} satisfies PetrinautHandleCapabilities;

const stochasticTimingCapabilities = {
  disabledExtensions: ["colors", "dynamics", "parameters"],
} satisfies PetrinautHandleCapabilities;

const subnetsWithColorsCapabilities = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

const subnetsWithoutColorsCapabilities = {
  disabledExtensions: ["colors", "dynamics"],
} satisfies PetrinautHandleCapabilities;

const colouredTokenFlowNet: SDCPN = {
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

const colouredDynamicsNet: SDCPN = {
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

const stochasticTimingNet: SDCPN = {
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

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Petrinaut",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider />
    </div>
  ),
};

export const Readonly: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider readonly />
    </div>
  ),
};

export const HiddenNetManagement: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        initialTitle={sirModel.title}
        initialDefinition={sirModel.petriNetDefinition}
        hideNetManagementControls="all"
      />
    </div>
  ),
};

const CounterPlugin = definePetrinautPlugin({
  id: "story.counter",
  name: "Counter",
  description: "Counts clicks at the end of the top bar.",
  author: "Storybook",
  topBarItems: { counter: { place: "top-bar-end" } },
});

const useCounterPlugin: PluginHook<typeof CounterPlugin> = () => {
  const [count, setCount] = useState(0);

  return {
    topBarItems: {
      counter: (
        <Button size="sm" variant="ghost" onClick={() => setCount(count + 1)}>
          {`Clicked ${count}`}
        </Button>
      ),
    },
  };
};

const placeCountStyle = css({ whiteSpace: "nowrap" });

const PlaceCount = ({ document }: { document: PluginDocumentReader }) => {
  const count = useStoreSelector(document.net, (net) => net.places.length);

  return <span className={placeCountStyle}>{`${count} places`}</span>;
};

const NetSummaryPlugin = definePetrinautPlugin({
  id: "story.net-summary",
  name: "Net summary",
  description:
    "Shows the place count before the title, and lays the net out from the viewport controls.",
  author: "Storybook",
  access: { document: "write" },
  settings: {
    showCount: {
      type: "boolean",
      default: true,
      label: "Place count",
      description: "Show the number of places before the title.",
      section: "viewport",
    },
  },
  buttons: { layout: { label: "Lay out the net", place: "viewport-controls" } },
  topBarItems: { count: { place: "top-bar-start" } },
});

const useNetSummaryPlugin: PluginHook<typeof NetSummaryPlugin> = (api) => ({
  buttons: {
    layout: {
      icon: <Icon name="diagramProject" size="xs" />,
      onClick: () => {
        void api.document.edit.applyAutoLayout().then((result) => {
          if (!result.applied) {
            api.notifications.add({
              message: describeRefusal(result.reason),
              tone: "error",
            });
          }
        });
      },
    },
  },
  topBarItems: {
    count: api.settings.get("showCount") ? (
      <PlaceCount document={api.document} />
    ) : null,
  },
});

const storyPlugins = [
  CounterPlugin(useCounterPlugin),
  NetSummaryPlugin(useNetSummaryPlugin),
];

/** Two plugins: see them in User settings → Plugins, and their setting under Viewport. */
export const WithPlugins: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        plugins={storyPlugins}
        initialTitle={sirModel.title}
        initialDefinition={sirModel.petriNetDefinition}
      />
    </div>
  ),
};

const echoLinesStyle = css({
  flex: "[1]",
  overflowY: "auto",
  padding: "3",
  fontSize: "sm",
});

const echoFormStyle = css({
  display: "flex",
  gap: "2",
  padding: "3",
  borderTop: "[1px solid {colors.neutral.bd.subtle}]",
});

const EchoAssistantPlugin = definePetrinautPlugin({
  id: "storybook.echo-assistant",
  name: "Echo assistant",
  description: "Repeats what you send, to show an assistant plugin's panel.",
  assistant: true,
});

/** The panel's content: the title bar's title and Clear, and a transcript that echoes. */
const EchoChat = () => {
  const { isOpen } = useAssistantPanel();
  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  return (
    <>
      <AssistantPanelTitle
        actions={
          lines.length > 0 ? (
            <Button size="xs" variant="ghost" onClick={() => setLines([])}>
              Clear
            </Button>
          ) : null
        }
      >
        Echo
      </AssistantPanelTitle>
      <div className={echoLinesStyle}>
        {lines.map((line, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- lines repeat and never reorder
          <p key={index}>{line}</p>
        ))}
      </div>
      <form
        className={echoFormStyle}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") return;
          setLines([...lines, draft]);
          setDraft("");
        }}
      >
        <input
          aria-label="Message Echo"
          data-autofocus
          disabled={!isOpen}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button size="xs" type="submit">
          Send
        </Button>
      </form>
    </>
  );
};

const echoAssistantPlugin = EchoAssistantPlugin({
  assistant: { content: <EchoChat /> },
});

/** An assistant from a plugin: its content and title bar in the editor's panel. */
export const WithAssistantPlugin: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        plugins={[echoAssistantPlugin]}
        initialTitle="Assistant plugin"
        initialDefinition={emptySDCPN}
      />
    </div>
  ),
};

const HandleSpikeRender = ({
  capabilities,
  initial,
  initialTitle,
  components,
}: {
  capabilities?: PetrinautHandleCapabilities;
  initial: SDCPN;
  initialTitle: string;
  components?: readonly ProvidedComponent[];
}) => {
  const handle = useMemo(
    () => createJsonDocHandle({ id: "spike-net", initial, capabilities }),
    [capabilities, initial],
  );

  const [patchLog, setPatchLog] = useState<string[]>([]);
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    return handle.subscribe((event) => {
      const summary = (event.patches ?? []).map(
        (p) => `${p.op} /${p.path.join("/")}`,
      );
      setPatchLog((prev) => [...summary, ...prev].slice(0, 12));
    });
  }, [handle]);

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <Petrinaut
        handle={handle}
        title={title}
        setTitle={setTitle}
        hideNetManagementControls="all"
        components={components}
      />
      <pre
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          maxWidth: 360,
          maxHeight: 220,
          overflow: "auto",
          background: "rgba(0, 0, 0, 0.7)",
          color: "lime",
          fontSize: 11,
          padding: 8,
          borderRadius: 4,
          margin: 0,
          pointerEvents: "none",
        }}
      >
        {`Last ${patchLog.length} patches (newest first):\n` +
          (patchLog.length === 0 ? "(no mutations yet)" : patchLog.join("\n"))}
      </pre>
    </div>
  );
};

export const HandleSpike: Story = {
  render: () => (
    <HandleSpikeRender initial={emptySDCPN} initialTitle="Handle spike" />
  ),
};

export const HandleSpikeWithSir: Story = {
  render: () => (
    <HandleSpikeRender
      initial={sirModel.petriNetDefinition}
      initialTitle={sirModel.title}
    />
  ),
};

export const ExtensionsDisabled: Story = {
  name: "Core Petri net (no extensions)",
  render: () => (
    <HandleSpikeRender
      capabilities={barePetriNetCapabilities}
      initial={barePetriNet}
      initialTitle="Bare Petri net"
    />
  ),
};

export const ColouredTokensOnly: Story = {
  name: "Coloured tokens only",
  render: () => (
    <HandleSpikeRender
      capabilities={colouredTokensOnlyCapabilities}
      initial={colouredTokenFlowNet}
      initialTitle="Coloured tokens only"
    />
  ),
};

export const ColouredTokensWithDynamics: Story = {
  name: "Coloured tokens with dynamics",
  render: () => (
    <HandleSpikeRender
      capabilities={colouredDynamicsCapabilities}
      initial={colouredDynamicsNet}
      initialTitle="Coloured dynamics"
    />
  ),
};

export const StochasticTimingOnly: Story = {
  name: "Stochastic timing only",
  render: () => (
    <HandleSpikeRender
      capabilities={stochasticTimingCapabilities}
      initial={stochasticTimingNet}
      initialTitle="Stochastic timing"
    />
  ),
};

export const SubnetsWithColors: Story = {
  name: "Subnets — with colours",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithColorsCapabilities}
      initial={sirModel.petriNetDefinition}
      initialTitle={sirModel.title}
    />
  ),
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
const stageSubnet: Subnet = {
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
const fusedLineNet: SDCPN = {
  places: [
    place("parts", "Parts", 100, 220, { showAsInitialState: true }),
    place("buffer", "Buffer", 520, 220, { capacity: 5 }),
    place("finished", "Finished", 940, 220),
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [stageSubnet],
  componentInstances: [
    {
      id: "cutter",
      name: "Cutter",
      subnetId: "stage",
      parameterValues: {},
      x: 310,
      y: 220,
    },
    {
      id: "drill",
      name: "Drill",
      subnetId: "stage",
      parameterValues: {},
      x: 730,
      y: 220,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      members: [
        { kind: "place", placeId: "parts" },
        port("cutter", "stage_in"),
      ],
    },
    {
      id: "fuse_buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("cutter", "stage_out"),
        port("drill", "stage_in"),
      ],
    },
    {
      id: "fuse_finished",
      members: [
        { kind: "place", placeId: "finished" },
        port("drill", "stage_out"),
      ],
    },
  ],
};

export const PlaceFusion: Story = {
  name: "Place fusion",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithColorsCapabilities}
      initial={fusedLineNet}
      initialTitle="Fused line"
    />
  ),
};

/** The stage as a signature alone: two ports, no transition. */
const stageInterface: Subnet = {
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
): Subnet => {
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
const interfacedLineNet: SDCPN = {
  ...fusedLineNet,
  subnets: [
    stageInterface,
    stageImplementation("fast_stage", "Fast stage", 1),
    stageImplementation("slow_stage", "Slow stage", 2),
  ],
  implementations: { stage_interface: "fast_stage" },
  componentInstances: [
    {
      id: "cutter",
      name: "Cutter",
      subnetId: "stage_interface",
      parameterValues: {},
      x: 310,
      y: 220,
    },
    {
      id: "drill",
      name: "Drill",
      subnetId: "stage_interface",
      implementation: "slow_stage",
      parameterValues: {},
      x: 730,
      y: 220,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      members: [
        { kind: "place", placeId: "parts" },
        port("cutter", "iface_in"),
      ],
    },
    {
      id: "fuse_buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("cutter", "iface_out"),
        port("drill", "iface_in"),
      ],
    },
    {
      id: "fuse_finished",
      members: [
        { kind: "place", placeId: "finished" },
        port("drill", "iface_out"),
      ],
    },
  ],
};

export const Interfaces: Story = {
  name: "Interfaces",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithColorsCapabilities}
      initial={interfacedLineNet}
      initialTitle="Interfaced line"
    />
  ),
};

/** A cell with seven ports: four feeds in, three results out. */
const cellSubnet: NonNullable<SDCPN["subnets"]>[number] = {
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
const manyPortsNet: SDCPN = {
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
  subnets: [cellSubnet],
  componentInstances: [
    {
      id: "cell1",
      name: "AssemblyCell",
      subnetId: "cell",
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
    members: [{ kind: "place" as const, placeId }, port("cell1", portPlaceId)],
  })),
};

export const ManyPorts: Story = {
  name: "Many ports",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithColorsCapabilities}
      initial={manyPortsNet}
      initialTitle="Assembly cell"
    />
  ),
};

const parcel: ProvidedTokenType = {
  name: "Parcel",
  displayColor: "#3b82f6",
  elements: [{ name: "weight", type: "real" }],
};

/** The stations of a packing line, as a host would provide them. */
const packingLineComponents: ProvidedComponent[] = [
  {
    id: "packing-line/feeder",
    name: "Feeder",
    description: "Puts parcels on the line",
    ports: [{ name: "Out", direction: "out", tokenType: parcel }],
  },
  {
    id: "packing-line/scale",
    name: "Scale",
    description: "Weighs each parcel",
    displayColor: "#8b5cf6",
    ports: [
      { name: "In", direction: "in", tokenType: parcel },
      { name: "Out", direction: "out", tokenType: parcel },
    ],
    parameters: [
      {
        name: "Tolerance",
        variableName: "tolerance",
        type: "real",
        defaultValue: "0.05",
      },
    ],
  },
  {
    id: "packing-line/sorter",
    name: "Sorter",
    description: "Sends parcels down one of two lanes",
    displayColor: "#10b981",
    ports: [
      { name: "In", direction: "in", tokenType: parcel },
      { name: "Light", direction: "out", tokenType: parcel },
      { name: "Heavy", direction: "out", tokenType: parcel },
    ],
  },
];

export const HostComponents: Story = {
  name: "Components provided by the host",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithColorsCapabilities}
      initial={emptySDCPN}
      initialTitle="Packing line"
      components={packingLineComponents}
    />
  ),
};

export const SubnetsWithoutColors: Story = {
  name: "Subnets — without colours",
  render: () => (
    <HandleSpikeRender
      capabilities={subnetsWithoutColorsCapabilities}
      initial={sirModel.petriNetDefinition}
      initialTitle={sirModel.title}
    />
  ),
};
