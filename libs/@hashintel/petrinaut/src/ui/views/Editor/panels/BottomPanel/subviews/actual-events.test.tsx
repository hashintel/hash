/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { toPetrinautId, type SDCPN } from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../../../../../../react/actual-mode-context";
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

afterEach(cleanup);

describe("Actual mode events", () => {
  it("names the transition and places of each event, and falls back to the id", () => {
    const Events = actualEventsSubView.component;

    render(
      <ActualModeContext
        value={{
          available: true,
          source: { kind: "brunch", endpoint: "/brunch" },
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
          receivedEvents: [],
          timelineStartedAtMs: null,
          timelineNowMs: null,
          error: null,
        }}
      >
        <Events />
      </ActualModeContext>,
    );

    expect(screen.getByText("Serve")).not.toBeNull();
    expect(screen.getByText("Queue: 1")).not.toBeNull();
    expect(screen.getByText(`${servedId}: 1`)).not.toBeNull();
  });
});
