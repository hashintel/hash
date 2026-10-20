/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  toPetrinautId,
  type ActualModeContextValue,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../../../../../../react/actual-mode-context";
import { definePetrinautPlugin } from "../../../../../plugins/define-petrinaut-plugin";
import { renderPlugins } from "../../../../../plugins/plugins-test-harness";
import { actualEventsSubView } from "./actual-events";

const queueId = toPetrinautId("place__queue");
const servedId = toPetrinautId("place__served");
const serveId = toPetrinautId("transition__serve");

const definition: SDCPN = {
  places: [
    {
      id: queueId,
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: servedId,
      name: "",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: serveId,
      name: "Serve",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const actualMode: ActualModeContextValue = {
  available: true,
  source: { id: "run-1" },
  status: "complete",
  title: null,
  definition,
  initialState: {},
  transitionFirings: [
    {
      transitionId: serveId,
      input: { [queueId]: 1 },
      output: { [servedId]: 1 },
      ts: "2026-10-07T00:00:00.000Z",
    },
  ],
  timelineStartedAtMs: null,
  timelineNowMs: null,
  error: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Actual mode events", () => {
  it("names the transition and places of each event, and falls back to the id", () => {
    const Events = actualEventsSubView.component;

    render(
      <ActualModeContext value={actualMode}>
        <Events />
      </ActualModeContext>,
    );

    expect(screen.getByText("Serve")).not.toBeNull();
    expect(screen.getByText("Queue: 1")).not.toBeNull();
    expect(screen.getByText(`${servedId}: 1`)).not.toBeNull();
  });

  it("lists a plugin's exports before the built-in ones and runs them", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const Events = actualEventsSubView.component;
    const run = vi.fn();
    const rawExportPlugin = definePetrinautPlugin(
      {
        id: "test.raw-export",
        name: "Raw export",
        actualExports: { raw: { label: "Export Stream" } },
      },
      { actualExports: { raw: { run } } },
    );

    renderPlugins(
      [rawExportPlugin],
      <ActualModeContext value={actualMode}>
        <Events />
      </ActualModeContext>,
    );

    const trigger = screen.getByRole("button", { name: /^Export/ });
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).toBe("true"),
    );
    const items = screen.getAllByRole("menuitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "Export Stream",
      "Export Recording",
      "Export Net",
    ]);

    // The menu selects the highlighted item, and a pointer-down highlights it.
    fireEvent.pointerDown(items[0]!);
    await waitFor(() =>
      expect(items[0]!.hasAttribute("data-highlighted")).toBe(true),
    );
    fireEvent.click(items[0]!);
    await waitFor(() => expect(run).toHaveBeenCalledOnce());
  });
});
