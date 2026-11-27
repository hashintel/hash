import { useEffect, useState } from "react";

import { ActualModeContext } from "../../react/host/actual-mode-context";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";

import type {
  ActualModeContextValue,
  ActualModeTransitionFiring,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Actual mode, with the story standing in for the host: it reports an
 * execution of the net as it happens, and the editor shows it.
 */
const meta = {
  title: "States/Actual mode",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const received = "00000000-0000-4000-8000-0000000000a1";
const packing = "00000000-0000-4000-8000-0000000000a2";
const shipped = "00000000-0000-4000-8000-0000000000a3";
const pack = "00000000-0000-4000-8000-0000000000b1";
const ship = "00000000-0000-4000-8000-0000000000b2";

const orderNet: SDCPN = {
  places: [
    {
      id: received,
      name: "Received",
      colorId: null,
      dynamicsEnabled: false,
      x: 120,
      y: 180,
    },
    {
      id: packing,
      name: "Packing",
      colorId: null,
      dynamicsEnabled: false,
      x: 430,
      y: 180,
    },
    {
      id: shipped,
      name: "Shipped",
      colorId: null,
      dynamicsEnabled: false,
      x: 740,
      y: 180,
    },
  ],
  transitions: [
    {
      id: pack,
      name: "Pack",
      inputArcs: [{ placeId: received, weight: 1, type: "standard" }],
      outputArcs: [{ placeId: packing, weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "",
      x: 290,
      y: 205,
    },
    {
      id: ship,
      name: "Ship",
      inputArcs: [{ placeId: packing, weight: 1, type: "standard" }],
      outputArcs: [{ placeId: shipped, weight: 1 }],
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

/** What the host's system does, and how long after it started, in seconds. */
const SCRIPT: readonly (readonly [after: number, transition: string])[] = [
  [1.2, pack],
  [2.0, pack],
  [3.1, ship],
  [4.4, pack],
  [5.0, ship],
  [6.8, pack],
  [7.3, ship],
  [9.5, pack],
  [10.1, ship],
  [11.6, pack],
  [12.4, ship],
  [14.0, ship],
];

const firingAt = (
  startedAtMs: number,
  [after, transition]: (typeof SCRIPT)[number],
): ActualModeTransitionFiring => ({
  transitionId: transition,
  input: transition === pack ? { [received]: 1 } : { [packing]: 1 },
  output: transition === pack ? { [packing]: 1 } : { [shipped]: 1 },
  ts: new Date(startedAtMs + after * 1000).toISOString(),
});

/** How often the host says what time it is, in milliseconds. */
const HEARTBEAT_MS = 250;

/**
 * A host reporting the script against the wall clock: every firing whose
 * time has come, the time it now is, and the end once the script has run.
 */
const useReportedExecution = (): Extract<
  ActualModeContextValue,
  { available: true }
> => {
  const [startedAtMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(startedAtMs);
  const due = SCRIPT.filter(([after]) => startedAtMs + after * 1000 <= nowMs);
  const complete = due.length === SCRIPT.length;

  useEffect(() => {
    if (complete) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [complete]);

  return {
    available: true,
    source: { id: `story-${startedAtMs}`, label: "Order fulfilment" },
    status: complete ? "complete" : "streaming",
    title: "Order fulfilment",
    definition: orderNet,
    initialState: { [received]: 6, [packing]: 0, [shipped]: 0 },
    transitionFirings: due.map((step) => firingAt(startedAtMs, step)),
    timelineStartedAtMs: startedAtMs,
    timelineNowMs: nowMs,
    error: null,
  };
};

const ReportedExecution = () => (
  <ActualModeContext value={useReportedExecution()}>
    <PetrinautStoryProvider
      initialTitle="Order fulfilment"
      initialDefinition={orderNet}
      hideNetManagementControls="all"
    />
  </ActualModeContext>
);

/**
 * A host reports an execution while it happens. The editor opens on it,
 * follows it, and plays it back on the controls a simulated run has: both
 * are a trace of events to the player.
 */
export const LiveExecution: Story = {
  name: "An execution reported as it happens",
  render: () => <ReportedExecution />,
};
