import { useMemo, useState, useEffect } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  sirModel,
  supplyChainProfit,
} from "@hashintel/petrinaut-core/examples";
import { createServicePetrinautOptimization } from "@local/petrinaut-optimizer-client";

import {
  createJsonDocHandle,
  definePetrinautAiInteractiveTool,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "../main";
import { PetrinautOptimizationContext } from "../react/optimization-context";
import { Petrinaut } from "../ui/petrinaut";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";
import { createStorybookAiTransport } from "./views/Editor/panels/create-storybook-ai-transport";

import type { PetrinautAiMessage } from "./views/Editor/panels/ai-assistant-panel";
import type { ChatTransport, UIMessageChunk } from "ai";

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const hostInteractiveToolWidgetStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  border: "[1px solid #bee6ff]",
  borderRadius: "lg",
  background: "[#eff9ff]",
});

const hostInteractiveToolOptionsStyle = css({
  display: "flex",
  gap: "2",
});

const hostInteractiveToolStoryStyle = css({
  height: "[100vh]",
  width: "[100vw]",
});

type ReviewDepthInput = {
  prompt: string;
  options: [string, string];
};

type ReviewDepthOutput = {
  choice: string;
};

const parseReviewDepthInput = (raw: unknown): ReviewDepthInput => {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as { prompt?: unknown }).prompt !== "string" ||
    !Array.isArray((raw as { options?: unknown }).options) ||
    (raw as { options: unknown[] }).options.length !== 2 ||
    !(raw as { options: unknown[] }).options.every(
      (option) => typeof option === "string",
    )
  ) {
    throw new Error("Invalid review-depth input");
  }

  return raw as ReviewDepthInput;
};

const parseReviewDepthOutput = (raw: unknown): ReviewDepthOutput => {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as { choice?: unknown }).choice !== "string"
  ) {
    throw new Error("Invalid review-depth output");
  }

  return raw as ReviewDepthOutput;
};

const reviewDepthTool = definePetrinautAiInteractiveTool({
  toolName: "chooseReviewDepth",
  inputSchema: { parse: parseReviewDepthInput },
  outputSchema: { parse: parseReviewDepthOutput },
  component: ({ input, state, submit, submittedOutput, toolCallId }) => (
    <div className={hostInteractiveToolWidgetStyle}>
      <strong>{input.prompt}</strong>
      <small>Tool call: {toolCallId}</small>
      {state === "awaiting" ? (
        <div className={hostInteractiveToolOptionsStyle}>
          {input.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => submit({ choice: option })}
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <span>Submitted: {submittedOutput.choice}</span>
      )}
    </div>
  ),
});

const streamStoryChunks = (
  chunks: UIMessageChunk[],
): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

const getReviewDepthOutput = (
  messages: PetrinautAiMessage[],
): ReviewDepthOutput | undefined => {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "dynamic-tool" &&
        part.toolName === reviewDepthTool.toolName &&
        part.state === "output-available"
      ) {
        return parseReviewDepthOutput(part.output);
      }
    }
  }
  return undefined;
};

const createHostInteractiveToolTransport =
  (): ChatTransport<PetrinautAiMessage> => ({
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: ({ messages }) => {
      const submittedOutput = getReviewDepthOutput(messages);

      return Promise.resolve(
        streamStoryChunks(
          submittedOutput
            ? [
                { type: "start-step" },
                { type: "text-start", id: "host-tool-follow-up" },
                {
                  type: "text-delta",
                  id: "host-tool-follow-up",
                  delta: `Thanks — I'll use the ${submittedOutput.choice.toLowerCase()} review.`,
                },
                { type: "text-end", id: "host-tool-follow-up" },
              ]
            : [
                { type: "start-step" },
                {
                  type: "tool-input-available",
                  dynamic: true,
                  toolCallId: "storybook-review-depth-1",
                  toolName: reviewDepthTool.toolName,
                  input: {
                    prompt: "How deeply should I review this net?",
                    options: ["Quick scan", "Detailed review"],
                  },
                },
              ],
        ),
      );
    },
  });

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
      differentialEquationId: null,
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_processed",
      name: "Processed",
      colorId: "type_ticket",
      dynamicsEnabled: false,
      differentialEquationId: null,
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
      differentialEquationId: "de_heat_up",
      x: 120,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_ready",
      name: "Ready",
      colorId: "type_batch",
      dynamicsEnabled: false,
      differentialEquationId: null,
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
      code: `return tokens.map(() => ({ temperature: 5 }));`,
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
      differentialEquationId: null,
      x: 260,
      y: 180,
      showAsInitialState: true,
    },
    {
      id: "p_served",
      name: "Served",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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

/**
 * Whether the host serves a real Petrinaut Optimizer behind the Storybook
 * dev proxy; the dev task's `--with-optimizer-service` flag sets it.
 */
const realOptimizerEnabled =
  (import.meta as { env?: Record<string, string | undefined> }).env?.[
    "VITE_PETRINAUT_OPT_PROVIDER"
  ] === "service";

const realOptimizerGuidanceStyle = css({
  padding: "6",
  fontSize: "sm",
  color: "neutral.s100",
  maxWidth: "[60ch]",
});

/**
 * The full editor against the real optimizer service, with the editor built
 * from source — the fast-refresh counterpart of the demo website's
 * `/optimization` route. Optimization studies created in Simulate mode run
 * on the local Petrinaut Optimizer container.
 */
/**
 * One capability for the story's lifetime: a fresh identity per render
 * restarts the provider's re-attach effect against a live study.
 */
const realOptimizer = realOptimizerEnabled
  ? createServicePetrinautOptimization({
      endpoint: () => new URL("/api/petrinaut-opt/", location.href),
    })
  : null;

export const WithRealOptimizer: Story = {
  render: () =>
    realOptimizer ? (
      <PetrinautOptimizationContext value={realOptimizer}>
        <div style={{ height: "100vh", width: "100vw" }}>
          <PetrinautStoryProvider
            initialTitle={supplyChainProfit.title}
            initialDefinition={supplyChainProfit.petriNetDefinition}
          />
        </div>
      </PetrinautOptimizationContext>
    ) : (
      <div className={realOptimizerGuidanceStyle}>
        This story talks to a real Petrinaut Optimizer and is inactive: start
        Storybook with{" "}
        <code>
          turbo run dev --filter @hashintel/petrinaut --
          --with-optimizer-service
        </code>{" "}
        from the repository root, which starts the optimizer container and sets{" "}
        <code>VITE_PETRINAUT_OPT_PROVIDER=service</code>.
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

export const WithHostInteractiveAiTool: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Open the AI panel and send any prompt. The synthetic host transport requests a review depth, the host widget submits once, and the automatic AI SDK follow-up confirms the selected value.",
      },
    },
  },
  render: () => (
    <div className={hostInteractiveToolStoryStyle}>
      <PetrinautStoryProvider
        aiAssistant={{
          interactiveTools: [reviewDepthTool],
          transport: createHostInteractiveToolTransport(),
        }}
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

export const HandleSpikeWithAi: Story = {
  render: () => (
    <HandleSpikeRender
      aiAssistant={{ transport: createStorybookAiTransport() }}
      initial={emptySDCPN}
      initialTitle="AI mutation spike"
    />
  ),
};
