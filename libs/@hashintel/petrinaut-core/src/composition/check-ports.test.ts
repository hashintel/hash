import { describe, expect, it } from "vitest";

import { checkPorts } from "./check-ports";
import { inferPortDirection, portDirections } from "./ports";

import type {
  FusionMember,
  InputArc,
  OutputArc,
  Place,
  PortDirection,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";

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
            name: "F1",
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

  it("checks a thousand ports of one fusion without reading the arcs once per port", () => {
    const size = 1000;
    const ports = Array.from({ length: size }, (_, index) =>
      place(`port-${index}`, { isPort: true, portDirection: "out" }),
    );
    const wide = subnet("wide", {
      places: ports,
      transitions: ports.map(({ id }) => transition(`take-${id}`, [id], [])),
      fusions: [
        {
          id: "f1",
          name: "F1",
          members: ports.map(({ id }) => ({ kind: "place", placeId: id })),
        },
      ],
    });

    const started = Date.now();
    const problems = checkPorts(net([wide]));
    const elapsed = Date.now() - started;

    // Fused, the ports are one place the subnet consumes from: each of them
    // breaks its declaration.
    expect(problems).toHaveLength(size);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("a port's direction, as inferred and as checked", () => {
  /** What a subnet does with its port `edge`. */
  type Case = {
    name: string;
    inputArcs?: InputArc[];
    outputArcs?: OutputArc[];
    /** A port of the stage `s1` the subnet fuses `edge` with. */
    fusedWith?: FusionMember;
    /** The direction the arcs give the port. */
    inferred: PortDirection;
    /** The declarations the arcs break. */
    contradicts: PortDirection[];
  };
  const from = (type: InputArc["type"]): InputArc => ({
    placeId: "edge",
    weight: 1,
    type,
  });
  const into: OutputArc = { placeId: "edge", weight: 1 };
  const stagePort = (portPlaceId: string): FusionMember => ({
    kind: "componentPort",
    componentInstanceId: "s1",
    portPlaceId,
  });

  const cases: Case[] = [
    {
      name: "only standard input arcs",
      inputArcs: [from("standard")],
      inferred: "in",
      contradicts: ["out"],
    },
    {
      name: "only output arcs",
      outputArcs: [into],
      inferred: "out",
      contradicts: ["in"],
    },
    {
      name: "standard input arcs and output arcs",
      inputArcs: [from("standard")],
      outputArcs: [into],
      inferred: "inout",
      contradicts: ["in", "out"],
    },
    {
      name: "only an inhibitor arc",
      inputArcs: [from("inhibitor")],
      inferred: "inout",
      contradicts: [],
    },
    {
      name: "only a read arc",
      inputArcs: [from("read")],
      inferred: "inout",
      contradicts: [],
    },
    {
      name: "an inhibitor arc and an output arc",
      inputArcs: [from("inhibitor")],
      outputArcs: [into],
      inferred: "out",
      contradicts: ["in"],
    },
    {
      name: "no arc of its own, fused inside with an inner input port a transition produces into",
      fusedWith: stagePort("in"),
      outputArcs: [{ endpoint: stagePort("in"), weight: 1 }],
      inferred: "out",
      contradicts: ["in"],
    },
    {
      name: "no arc of its own, fused inside with an inner output port a transition consumes from",
      fusedWith: stagePort("out"),
      inputArcs: [{ endpoint: stagePort("out"), weight: 1, type: "standard" }],
      inferred: "in",
      contradicts: ["out"],
    },
    {
      name: "no arc of its own, fused inside with an inner port a transition only reads",
      fusedWith: stagePort("out"),
      inputArcs: [{ endpoint: stagePort("out"), weight: 1, type: "read" }],
      inferred: "inout",
      contradicts: [],
    },
  ];

  it.each(cases)(
    "$name",
    ({ inputArcs = [], outputArcs = [], fusedWith, inferred, contradicts }) => {
      const line = (portDirection?: PortDirection) =>
        subnet("line", {
          places: [place("edge", { isPort: true, portDirection })],
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
          fusions: fusedWith && [
            {
              id: "f1",
              name: "F1",
              members: [{ kind: "place", placeId: "edge" }, fusedWith],
            },
          ],
          transitions: [
            { ...transition("touch", [], []), inputArcs, outputArcs },
          ],
        });

      expect(inferPortDirection(line(), "edge")).toBe(inferred);
      for (const declared of portDirections) {
        expect(
          checkPorts(net([stage, line(declared)])).map(
            ({ placeId }) => placeId,
          ),
        ).toEqual(contradicts.includes(declared) ? ["edge"] : []);
      }
      // Declaring what the arcs give is never a problem.
      expect(contradicts).not.toContain(inferred);
    },
  );
});
