/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { lowerVisualizerToHir } from "@hashintel/petrinaut-core/view-hir";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../react/lsp/context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
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
  differentialEquationId: null,
};
const source = (label: string) =>
  `return <svg viewBox="0 0 400 200"><text>${label}</text></svg>;`;

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

it("shows a compilation error only when ready and recovers on the next edit", async () => {
  const { Harness, complete } = setup();
  const first = source("First picture");
  const invalid = "export default Visualization(() => <svg";
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
