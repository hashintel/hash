import { describe, expect, it } from "vitest";

import { checkPorts } from "./check-ports";

import type { Place, SDCPN, Subnet, Transition } from "../types/sdcpn";

const place = (id: string, overrides: Partial<Place> = {}): Place => ({
  id,
  name: id,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...overrides,
});

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): Transition => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard",
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

const subnet = (id: string, overrides: Partial<Subnet> = {}): Subnet => ({
  id,
  name: id,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  ...overrides,
});

const net = (subnets: Subnet[]): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  subnets,
});

const stage = subnet("stage", {
  places: [place("in", { isPort: true }), place("out", { isPort: true })],
  transitions: [transition("work", ["in"], ["out"])],
});

describe("checkPorts", () => {
  it("reports a port declared input that its subnet writes to", () => {
    const loop = subnet("loop", {
      places: [place("pool", { isPort: true, portDirection: "in" })],
      transitions: [transition("cycle", ["pool"], ["pool"])],
    });

    expect(checkPorts(net([loop]))).toMatchObject([
      { subnetId: "loop", placeId: "pool", severity: "warning" },
    ]);
  });

  it("holds a port to its direction through what its subnet fuses with it", () => {
    // Inside the line, the port is fused with a port of a stage, and a
    // transition of the line touches that port of the stage: fused, the two
    // are one place.
    const stagePort = {
      kind: "componentPort" as const,
      componentInstanceId: "s1",
      portPlaceId: "in",
    };
    const problems = ({
      direction,
      produces = false,
      consumes = false,
    }: {
      direction: "in" | "out";
      produces?: boolean;
      consumes?: boolean;
    }) => {
      const line = subnet("line", {
        places: [place("edge", { isPort: true, portDirection: direction })],
        componentInstances: [
          {
            id: "s1",
            name: "s1",
            subnetId: "stage",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
        fusions: [
          {
            id: "f1",
            members: [{ kind: "place", placeId: "edge" }, stagePort],
          },
        ],
        transitions: [
          {
            ...transition("touch", [], []),
            inputArcs: consumes
              ? [{ endpoint: stagePort, weight: 1, type: "standard" }]
              : [],
            outputArcs: produces ? [{ endpoint: stagePort, weight: 1 }] : [],
          },
        ],
      });
      return checkPorts(net([stage, line]));
    };

    expect(problems({ direction: "in", produces: true })).toMatchObject([
      { subnetId: "line", placeId: "edge" },
    ]);
    expect(problems({ direction: "out", consumes: true })).toMatchObject([
      { subnetId: "line", placeId: "edge" },
    ]);
    expect(problems({ direction: "in", consumes: true })).toEqual([]);
  });
});
