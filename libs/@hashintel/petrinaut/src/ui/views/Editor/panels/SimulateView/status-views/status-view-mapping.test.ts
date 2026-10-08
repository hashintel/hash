import { describe, expect, it } from "vitest";

import { buildStatusViewFromFormState } from "./status-view-mapping";
import { getStatusViewPlaceOptions } from "./status-view-place-options";

import type { SDCPN } from "@hashintel/petrinaut-core";

describe("buildStatusViewFromFormState", () => {
  it("keeps label order, drops empty optionals, and clears exit-label places", () => {
    const statusView = buildStatusViewFromFormState(
      {
        name: " Ticket status ",
        description: "",
        identityRef: "identity-1",
        labels: [
          {
            id: "label-1",
            name: " Todo ",
            displayColor: "#94a3b8",
            places: ["todo"],
            tokenCondition: "  ",
            isExit: false,
          },
          {
            id: "label-2",
            name: "Retrying",
            displayColor: "#f59e0b",
            places: ["doing"],
            tokenCondition: "token.attempts > 0",
            isExit: false,
          },
          {
            id: "label-3",
            name: "Gone",
            displayColor: "#64748b",
            places: ["stale-selection"],
            tokenCondition: "",
            isExit: true,
          },
        ],
      },
      "view-1",
    );

    expect(statusView).toEqual({
      id: "view-1",
      name: "Ticket status",
      identityRef: "identity-1",
      labels: [
        {
          id: "label-1",
          name: "Todo",
          displayColor: "#94a3b8",
          places: ["todo"],
        },
        {
          id: "label-2",
          name: "Retrying",
          displayColor: "#f59e0b",
          places: ["doing"],
          tokenCondition: "token.attempts > 0",
        },
        {
          id: "label-3",
          name: "Gone",
          displayColor: "#64748b",
          places: [],
          isExit: true,
        },
      ],
    });
  });
});

describe("getStatusViewPlaceOptions", () => {
  it("lists root places and instance-scoped copies of subnet places", () => {
    const place = (id: string, name: string) => ({
      id,
      name,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    const sdcpn: SDCPN = {
      places: [place("root-place", "RootPlace")],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      subnets: [
        {
          id: "subnet-1",
          name: "Worker",
          places: [place("inner-place", "InnerPlace")],
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
      ],
    };

    expect(getStatusViewPlaceOptions(sdcpn)).toEqual([
      { value: "root-place", label: "RootPlace" },
      { value: "instance-1::inner-place", label: "WorkerA::InnerPlace" },
    ]);
  });
});
