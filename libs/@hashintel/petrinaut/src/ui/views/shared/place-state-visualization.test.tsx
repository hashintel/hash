/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { lowerVisualizerToHir } from "@hashintel/petrinaut-core/view-hir";

import { SDCPNContext } from "../../../react/document/sdcpn-context";
import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
} from "../../../react/execution-frame/context";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../react/lsp/context";
import {
  DEFAULT_SIMULATION_CONTEXT,
  SimulationContext,
} from "../../../react/simulation/context";
import { PlaceStateVisualization } from "./place-state-visualization";

import type { Color, Place, VisualizerHir } from "@hashintel/petrinaut-core";

const color: Color = {
  id: "type",
  name: "Type",
  iconSlug: "circle",
  displayColor: "#3366ff",
  elements: [{ elementId: "x", name: "x", type: "real" }],
};
const place: Place = {
  id: "place",
  name: "Place",
  x: 0,
  y: 0,
  colorId: color.id,
  dynamicsEnabled: false,
};
const source = (label: string) =>
  `return <Visualizer.Svg viewBox="0 0 400 200"><text>${label}</text></Visualizer.Svg>;`;

const setup = () => {
  const compilations = new Map<string, (result: VisualizerHir) => void>();
  const requestVisualizerHir = vi.fn(
    (code: string) =>
      new Promise<VisualizerHir>((resolve) => compilations.set(code, resolve)),
  );
  const Harness = ({ code }: { code: string }) => {
    const sdcpn = use(SDCPNContext);
    return (
      <LanguageClientContext
        value={{ ...DEFAULT_LANGUAGE_CLIENT_CONTEXT, requestVisualizerHir }}
      >
        <SDCPNContext
          value={{
            ...sdcpn,
            petriNetDefinition: { ...sdcpn.petriNetDefinition, types: [color] },
          }}
        >
          <PlaceStateVisualization
            place={{ ...place, visualizerCode: code }}
            placeType={color}
            size={{ width: 400, height: 240 }}
          />
        </SDCPNContext>
      </LanguageClientContext>
    );
  };
  const complete = async (code: string) => {
    expect(compilations.has(code)).toBe(true);
    await act(async () => {
      compilations.get(code)!(
        lowerVisualizerToHir(code, {
          surface: "visualizer",
          parameters: [],
          elements: [{ name: "x", type: "real" }],
        }),
      );
    });
  };
  return { Harness, complete };
};

afterEach(cleanup);

it("keeps the last drawing visible until the newest compilation completes", async () => {
  const { Harness, complete } = setup();
  const first = source("First picture");
  const second = source("Second picture");
  const third = source("Third picture");
  const { rerender } = await act(() => render(<Harness code={first} />));
  expect(
    screen.getByRole("status", { name: "Loading visualizer" }),
  ).toBeDefined();
  await complete(first);
  const picture = screen.getByText("First picture").closest("svg");
  expect(picture?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  expect(screen.queryByRole("status")).toBeNull();

  await act(async () => rerender(<Harness code={second} />));
  expect(screen.getByText("First picture").closest("svg")).toBe(picture);
  expect(picture?.style.display).not.toBe("none");
  expect(screen.getByRole("status")).toBeDefined();
  await act(async () => rerender(<Harness code={third} />));
  await complete(second);
  expect(screen.queryByText("Second picture")).toBeNull();
  expect(screen.getByText("First picture").closest("svg")).toBe(picture);
  expect(screen.getByRole("status")).toBeDefined();
  await complete(third);
  expect(screen.getByText("Third picture")).toBeDefined();
  expect(screen.queryByText("First picture")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

/** A place that holds a count, drawn before a run or, given `frameCount`, during one. */
const setupCounted = (
  placeType: Color | null,
  marking: number | Record<string, never>[],
) => {
  const code =
    'return <Visualizer.Svg viewBox="0 0 400 200"><text>{tokens.length} in stock</text>{tokens.map((_, index) => <circle key={index} cx={20 + index * 20} cy={20} r={8} />)}</Visualizer.Svg>;';
  const requestVisualizerHir = vi.fn(() =>
    Promise.resolve(
      lowerVisualizerToHir(code, {
        surface: "visualizer",
        parameters: [],
        elements: placeType?.elements ?? null,
      }),
    ),
  );
  return ({ frameCount }: { frameCount?: number }) => (
    <LanguageClientContext
      value={{ ...DEFAULT_LANGUAGE_CLIENT_CONTEXT, requestVisualizerHir }}
    >
      <SimulationContext
        value={{
          ...DEFAULT_SIMULATION_CONTEXT,
          initialMarking: { place: marking },
        }}
      >
        <ExecutionFrameSourceContext
          value={
            frameCount === undefined
              ? emptyExecutionFrameSource
              : {
                  ...emptyExecutionFrameSource,
                  totalFrames: 1,
                  currentFrameReader: {
                    number: 0,
                    time: 0,
                    getPlaceTokenCount: () => frameCount,
                    // A frame holds no bytes for tokens that carry nothing.
                    getPlaceTokens: () => [],
                    getTransitionState: () => null,
                    toFrameState: () => ({ number: 0, places: {} }),
                  },
                }
          }
        >
          <PlaceStateVisualization
            place={{
              ...place,
              colorId: placeType?.id ?? null,
              visualizerCode: code,
            }}
            placeType={placeType}
            size={{ width: 400, height: 240 }}
          />
        </ExecutionFrameSourceContext>
      </SimulationContext>
    </LanguageClientContext>
  );
};

it("draws one mark per token of a place with no type, before a run and during one", async () => {
  const Harness = setupCounted(null, 3);

  const { rerender, container } = await act(() => render(<Harness />));
  expect(screen.getByText("3 in stock")).toBeDefined();
  expect(container.querySelectorAll("circle")).toHaveLength(3);

  await act(async () => rerender(<Harness frameCount={5} />));
  expect(screen.getByText("5 in stock")).toBeDefined();
  expect(container.querySelectorAll("circle")).toHaveLength(5);
});

it("counts the tokens of a type with no element as it does those of a place with no type", async () => {
  const Harness = setupCounted({ ...color, elements: [] }, [{}, {}, {}]);

  const { rerender, container } = await act(() => render(<Harness />));
  expect(screen.getByText("3 in stock")).toBeDefined();

  await act(async () => rerender(<Harness frameCount={5} />));
  expect(screen.getByText("5 in stock")).toBeDefined();
  expect(container.querySelectorAll("circle")).toHaveLength(5);
});

it("says a count is too large to draw in place of one record per token, and draws again once it is not", async () => {
  const Harness = setupCounted(null, 4_000_000_000);

  const { rerender, container } = await act(() => render(<Harness />));
  expect(
    screen.getByText(
      "This place holds more than 1,000,000 tokens, too many to draw.",
    ),
  ).toBeDefined();

  await act(async () => rerender(<Harness frameCount={2} />));
  expect(screen.getByText("2 in stock")).toBeDefined();
  expect(container.querySelectorAll("circle")).toHaveLength(2);
});

it("shows a compilation error only when ready and recovers on the next edit", async () => {
  const { Harness, complete } = setup();
  const first = source("First picture");
  const invalid = "export default Visualization(() => <Visualizer.Svg";
  const fixed = source("Fixed picture");
  const { rerender } = await act(() => render(<Harness code={first} />));
  await complete(first);
  await act(async () => rerender(<Harness code={invalid} />));
  expect(screen.getByText("First picture")).toBeDefined();
  await complete(invalid);
  expect(screen.queryByText("First picture")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => rerender(<Harness code={fixed} />));
  await complete(fixed);
  expect(screen.getByText("Fixed picture")).toBeDefined();
});

it("preserves the scene camera while new code compiles", async () => {
  const { Harness, complete } = setup();
  const first = source("First scene").replace(
    'viewBox="0 0 400 200"',
    'navigation="pan-zoom" origin="center"',
  );
  const second = first.replace("First scene", "Updated scene");
  const { rerender } = await act(() => render(<Harness code={first} />));
  await complete(first);
  expect(screen.queryByRole("button", { name: "Reset view" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pan and zoom" }));
  expect(screen.queryByRole("button", { name: "Reset view" })).toBeNull();
  const scene = screen.getByLabelText("Pan and zoom SVG scene");
  const original = scene.getAttribute("viewBox");
  fireEvent.keyDown(scene, { key: "+" });
  fireEvent.keyDown(scene, { key: "ArrowLeft" });
  const navigated = scene.getAttribute("viewBox");
  expect(navigated).not.toBe(original);
  await act(async () => rerender(<Harness code={second} />));
  await complete(second);
  expect(
    screen.getByText("Updated scene").closest("svg")?.getAttribute("viewBox"),
  ).toBe(navigated);
  fireEvent.keyDown(scene, { key: "Escape" });
  expect(screen.queryByLabelText("Pan and zoom SVG scene")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
  await waitFor(() => expect(scene.getAttribute("viewBox")).toBe(original));
  expect(screen.queryByRole("button", { name: "Reset view" })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Pan and zoom" }),
  );
});

it("recovers from a computed root-property error on the next edit", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { Harness, complete } = setup();
    const invalid =
      'return <Visualizer.Svg viewBox={"0 0 " + tokens.length + " 20"} />;';
    const fixed = source("Recovered picture");
    const { rerender } = await act(() => render(<Harness code={invalid} />));
    await complete(invalid);
    expect(screen.getByText("Visualizer Runtime Error")).toBeDefined();
    await act(async () => rerender(<Harness code={fixed} />));
    await complete(fixed);
    expect(screen.getByText("Recovered picture")).toBeDefined();
    expect(screen.queryByText("Visualizer Runtime Error")).toBeNull();
  } finally {
    consoleError.mockRestore();
  }
});
