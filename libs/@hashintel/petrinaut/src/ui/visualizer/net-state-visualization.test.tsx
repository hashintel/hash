/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { lowerVisualizerToHir } from "@hashintel/petrinaut-core/view-hir";

import { SDCPNContext } from "../../react/document/sdcpn-context";
import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
} from "../../react/execution-frame/context";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../react/lsp/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
} from "../../react/simulation/context";
import { NetStateVisualization } from "./net-state-visualization";

import type { InitialMarking } from "../../react/simulation/context";
import type {
  Component,
  HirVisualizerContext,
  Place,
  SDCPN,
  TokenRecord,
} from "@hashintel/petrinaut-core";

const place = (
  id: string,
  name: string,
  extra: Partial<Place> = {},
): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...extra,
});

/** A machine with a queue at its port and the jobs it works on, each of a size. */
const machine: Component = {
  id: "machine",
  name: "Machine",
  places: [
    place("in", "In", { isPort: true }),
    place("work", "Work", { colorId: "job" }),
  ],
  transitions: [],
  types: [
    {
      id: "job",
      name: "Job",
      iconSlug: "circle",
      displayColor: "#3366ff",
      elements: [{ elementId: "size", name: "size", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1",
    },
  ],
  visualizerCode: `return (
    <Visualizer.Svg>
      <text>{places.In.count} waiting at rate {parameters.rate}</text>
      {places.Work.tokens.map((job, index) => (
        <circle key={index} r={job.size} />
      ))}
    </Visualizer.Svg>
  );`,
};

const instance = (id: string, rate: string) => ({
  id,
  name: id,
  component: { id: "machine" },
  parameterValues: { rate },
  x: 0,
  y: 0,
});

/** Two machines, the first fed from the root net's Buffer through a fusion. */
const definition: SDCPN = {
  places: [place("buffer", "Buffer")],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [
    {
      id: "speed",
      name: "Speed",
      variableName: "speed",
      type: "real",
      defaultValue: "2",
    },
  ],
  components: [machine],
  componentInstances: [instance("cutter", "3"), instance("drill", "5")],
  fusions: [
    {
      id: "belt",
      name: "Buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        {
          kind: "componentPort",
          componentInstanceId: "cutter",
          portPlaceId: "in",
        },
      ],
    },
  ],
  visualizerCode: `return (
    <Visualizer.Svg>
      <text>{places.Buffer.count} buffered at speed {parameters.speed}</text>
    </Visualizer.Svg>
  );`,
};

/** A frame of a run: the count of each flat place, and the tokens of some. */
const frameOf = (
  counts: Record<string, number>,
  tokens: Record<string, TokenRecord[]> = {},
) => ({
  ...emptyExecutionFrameSource,
  totalFrames: 1,
  currentFrameReader: {
    number: 0,
    time: 0,
    getPlaceTokenCount: (placeId: string) =>
      counts[placeId] ?? tokens[placeId]?.length ?? 0,
    getPlaceTokens: (read: Place) => tokens[read.id] ?? [],
    getTransitionState: () => null,
    toFrameState: () => ({ number: 0, places: {} }),
  },
});

// Lowered here as the language worker lowers it, with the context it is given.
const requestVisualizerHir = vi.fn(
  (code: string, context: HirVisualizerContext) =>
    Promise.resolve(lowerVisualizerToHir(code, context)),
);

const Harness = ({
  net,
  path,
  frame = emptyExecutionFrameSource,
  initialMarking = {},
}: {
  net: SDCPN | Component;
  path: readonly string[] | null;
  frame?: typeof emptyExecutionFrameSource;
  initialMarking?: InitialMarking;
}) => {
  const sdcpn = use(SDCPNContext);
  return (
    <LanguageClientContext
      value={{ ...DEFAULT_LANGUAGE_CLIENT_CONTEXT, requestVisualizerHir }}
    >
      <SDCPNContext value={{ ...sdcpn, petriNetDefinition: definition }}>
        <SimulationContext
          value={{ ...DEFAULT_SIMULATION_CONTEXT, initialMarking }}
        >
          <ExecutionFrameSourceContext value={frame}>
            <NetStateVisualization
              net={net}
              path={path}
              size={{ width: 200, height: 120 }}
            />
          </ExecutionFrameSourceContext>
        </SimulationContext>
      </SDCPNContext>
    </LanguageClientContext>
  );
};

afterEach(cleanup);

it("draws the root net from its marking before a run, and from the frame during one", async () => {
  const { rerender } = await act(() =>
    render(
      <Harness net={definition} path={[]} initialMarking={{ buffer: 4 }} />,
    ),
  );
  expect(screen.getByText("4 buffered at speed 2")).toBeDefined();

  await act(async () =>
    rerender(
      <Harness net={definition} path={[]} frame={frameOf({ buffer: 7 })} />,
    ),
  );
  expect(screen.getByText("7 buffered at speed 2")).toBeDefined();
});

it("draws each instance of a component from its own places and parameter values", async () => {
  const frame = frameOf(
    { buffer: 2, "drill::in": 6 },
    {
      "cutter::work": [{ size: 9 }],
      "drill::work": [{ size: 3 }, { size: 4 }],
    },
  );

  const { rerender, container } = await act(() =>
    render(<Harness net={machine} path={["cutter"]} frame={frame} />),
  );
  // The cutter's port is fused with Buffer: it reads the root net's place.
  expect(screen.getByText("2 waiting at rate 3")).toBeDefined();
  expect(
    [...container.querySelectorAll("circle")].map((circle) =>
      circle.getAttribute("r"),
    ),
  ).toEqual(["9"]);

  await act(async () =>
    rerender(<Harness net={machine} path={["drill"]} frame={frame} />),
  );
  expect(screen.getByText("6 waiting at rate 5")).toBeDefined();
  expect(
    [...container.querySelectorAll("circle")].map((circle) =>
      circle.getAttribute("r"),
    ),
  ).toEqual(["3", "4"]);
});

it("draws a component nothing instantiates with no token, at its default parameter values", async () => {
  const { container } = await act(() =>
    render(
      <Harness
        net={machine}
        path={null}
        frame={frameOf({ buffer: 2, in: 5 }, { work: [{ size: 9 }] })}
      />,
    ),
  );
  expect(screen.getByText("0 waiting at rate 1")).toBeDefined();
  expect(container.querySelectorAll("circle")).toHaveLength(0);
});

it("draws nothing for a net with no visualizer", async () => {
  const { container } = await act(() =>
    render(
      <Harness net={{ ...machine, visualizerCode: undefined }} path={[]} />,
    ),
  );
  expect(container.innerHTML).toBe("");
});

it("shows the first diagnostic of code that does not lower", async () => {
  await act(() =>
    render(
      <Harness
        net={{
          ...definition,
          visualizerCode:
            "return <Visualizer.Svg><text>{places.Nowhere.count}</text></Visualizer.Svg>;",
        }}
        path={[]}
      />,
    ),
  );
  expect(screen.getByText(/`Nowhere` does not exist here/u)).toBeDefined();
});
