import { useMemo, useState, useEffect } from "react";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  createJsonDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "../main";
import { Petrinaut } from "../ui/petrinaut";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { createStorybookAiTransport } from "./views/Editor/panels/create-storybook-ai-transport";

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
      differentialEquationId: null,
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_processing",
      name: "Processing",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 430,
      y: 180,
    },
    {
      id: "p_done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
  disabledExtensions: ["colors", "stochasticity", "dynamics"],
} satisfies PetrinautHandleCapabilities;

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

export const WithAiAssistant: Story = {
  render: () => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <PetrinautStoryProvider
        aiAssistant={{ transport: createStorybookAiTransport() }}
        initialTitle={sirModel.title}
        initialDefinition={sirModel.petriNetDefinition}
      />
    </div>
  ),
};

const HandleSpikeRender = ({
  aiAssistant,
  capabilities,
  initial,
  initialTitle,
}: {
  aiAssistant?: {
    transport: ReturnType<typeof createStorybookAiTransport>;
  };
  capabilities?: PetrinautHandleCapabilities;
  initial: SDCPN;
  initialTitle: string;
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
        aiAssistant={aiAssistant}
        handle={handle}
        title={title}
        setTitle={setTitle}
        hideNetManagementControls="all"
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
  render: () => (
    <HandleSpikeRender
      capabilities={barePetriNetCapabilities}
      initial={barePetriNet}
      initialTitle="Bare Petri net"
    />
  ),
};

export const HandleSpikeWithAi: Story = {
  render: () => (
    <HandleSpikeRender
      aiAssistant={{ transport: createStorybookAiTransport() }}
      initial={emptySDCPN}
      initialTitle="AI mutation spike"
    />
  ),
};
