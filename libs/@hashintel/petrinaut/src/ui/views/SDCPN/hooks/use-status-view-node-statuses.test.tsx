/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ExecutionFrameSourceContext,
  emptyExecutionFrameSource,
} from "../../../../react/execution-frame/context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";
import { useStatusViewNodeStatuses } from "./use-status-view-node-statuses";

import type { SDCPNContextValue } from "../../../../react/state/sdcpn-context";
import type {
  SDCPN,
  SimulationFrameReader,
  TokenRecord,
} from "@hashintel/petrinaut-core";

const subnetPlace = {
  id: "inner-place",
  name: "InnerPlace",
  colorId: "type-ticket",
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const sdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [
    {
      id: "type-ticket",
      name: "Ticket",
      iconSlug: "circle",
      displayColor: "#0000FF",
      elements: [
        {
          elementId: "ticket-id",
          name: "ticket_id",
          type: "string",
          identityRef: "identity-ticket",
        },
      ],
    },
  ],
  differentialEquations: [],
  parameters: [],
  identities: [
    { id: "identity-ticket", name: "Ticket", keyElementTypes: ["string"] },
  ],
  statusViews: [
    {
      id: "view-1",
      name: "Ticket status",
      identityRef: "identity-ticket",
      labels: [
        {
          id: "label-doing",
          name: "Doing",
          displayColor: "#2563eb",
          places: ["instance-1::inner-place", "instance-2::inner-place"],
        },
      ],
    },
  ],
  subnets: [
    {
      id: "subnet-1",
      name: "Worker",
      places: [subnetPlace],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  componentInstances: [
    {
      id: "instance-1",
      name: "WorkerA",
      subnetId: "subnet-1",
      parameterValues: {},
      x: 0,
      y: 0,
    },
    {
      id: "instance-2",
      name: "WorkerB",
      subnetId: "subnet-1",
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
};

const makeFrame = (
  tokensByPlaceId: Record<string, TokenRecord[]>,
): SimulationFrameReader => ({
  number: 0,
  time: 0,
  getPlaceTokenCount: (placeId) => tokensByPlaceId[placeId]?.length ?? 0,
  getPlaceTokens: (place) => tokensByPlaceId[place.id] ?? [],
  getTransitionState: () => null,
  toFrameState: () => ({ number: 0, places: {} }),
});

const sdcpnContextValue = {
  petriNetDefinition: sdcpn,
} as SDCPNContextValue;

describe("useStatusViewNodeStatuses", () => {
  it("summarizes tracked tokens per component instance under scoped ids", () => {
    const frame = makeFrame({
      "instance-1::inner-place": [{ ticket_id: "a" }, { ticket_id: "b" }],
    });

    const { result } = renderHook(() => useStatusViewNodeStatuses(), {
      wrapper: ({ children }) => (
        <SDCPNContext value={sdcpnContextValue}>
          <ExecutionFrameSourceContext
            value={{ ...emptyExecutionFrameSource, currentFrameReader: frame }}
          >
            {children}
          </ExecutionFrameSourceContext>
        </SDCPNContext>
      ),
    });

    expect(result.current.get("instance-2")).toBeUndefined();
    expect(result.current.get("instance-1")).toEqual({
      statusViewId: "view-1",
      statusViewName: "Ticket status",
      labels: [
        {
          labelId: "label-doing",
          name: "Doing",
          displayColor: "#2563eb",
          count: 2,
        },
      ],
      tintColor: "#2563eb",
    });
  });

  it("returns no summaries without a frame", () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useStatusViewNodeStatuses(), {
      wrapper: ({ children }) => (
        <SDCPNContext value={sdcpnContextValue}>{children}</SDCPNContext>
      ),
    });
    expect(result.current.size).toBe(0);
  });
});
