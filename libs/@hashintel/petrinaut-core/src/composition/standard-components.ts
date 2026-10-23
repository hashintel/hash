import { GRID_SIZE } from "../grid-size";

import type {
  ComponentLibrary,
  LibraryComponent,
} from "../composition/component-library";
import type { Parameter, Place, Transition } from "../types/sdcpn";

/**
 * The standard component library: the building blocks of a flow of untyped
 * tokens, each a small subnet whose ports are fused with the places of the
 * net that uses it. Every rate is a parameter, so an instance sets its own.
 */
export const standardComponentLibraryId = "hash.standard-components";

const rateParameter = (
  id: string,
  name: string,
  defaultValue: string,
): Parameter => ({
  id,
  name,
  variableName: id,
  type: "real",
  defaultValue,
});

const port = (
  id: string,
  name: string,
  x: number,
  y: number,
  description?: string,
): Place => ({
  id,
  name,
  ...(description === undefined ? {} : { description }),
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  isPort: true,
  x: x * GRID_SIZE,
  y: y * GRID_SIZE,
});

const place = (id: string, name: string, x: number, y: number): Place => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: x * GRID_SIZE,
  y: y * GRID_SIZE,
});

const stochastic = ({
  id,
  name,
  rate,
  inputs,
  outputs,
  x,
  y,
  description,
}: {
  id: string;
  name: string;
  /** The body of the rate function. */
  rate: string;
  inputs: string[];
  outputs: string[];
  x: number;
  y: number;
  description?: string;
}): Transition => ({
  id,
  name,
  ...(description === undefined ? {} : { description }),
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard",
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "stochastic",
  lambdaCode: rate,
  transitionKernelCode: "",
  x: x * GRID_SIZE,
  y: y * GRID_SIZE,
});

const source: LibraryComponent = {
  id: "source",
  name: "Source",
  description: "Creates tokens at a fixed rate.",
  keywords: ["arrivals", "generator", "producer"],
  template: {
    name: "Source",
    description: "Emits one token into Out at `rate` per time unit.",
    parameters: [rateParameter("rate", "Rate", "1")],
    types: [],
    differentialEquations: [],
    places: [port("out", "Out", 8, 0, "The tokens the source creates.")],
    transitions: [
      stochastic({
        id: "emit",
        name: "Emit",
        rate: "return parameters.rate;",
        inputs: [],
        outputs: ["out"],
        x: 0,
        y: 0,
      }),
    ],
  },
};

const sink: LibraryComponent = {
  id: "sink",
  name: "Sink",
  description: "Consumes tokens at a fixed rate.",
  keywords: ["departures", "consumer", "exit"],
  template: {
    name: "Sink",
    description:
      "Removes one token from In at `rate` per time unit while any is there.",
    parameters: [rateParameter("rate", "Rate", "1")],
    types: [],
    differentialEquations: [],
    places: [port("in", "In", 0, 0, "The tokens the sink removes.")],
    transitions: [
      stochastic({
        id: "absorb",
        name: "Absorb",
        rate: "return parameters.rate;",
        inputs: ["in"],
        outputs: [],
        x: 8,
        y: 0,
      }),
    ],
  },
};

const stage: LibraryComponent = {
  id: "stage",
  name: "Stage",
  description: "Passes tokens from In to Out after an exponential delay.",
  keywords: ["delay", "process", "machine", "server"],
  template: {
    name: "Stage",
    description:
      "Moves one token from In to Out at `rate` per time unit: a single server with an exponential service time.",
    parameters: [rateParameter("rate", "Rate", "1")],
    types: [],
    differentialEquations: [],
    places: [port("in", "In", 0, 0), port("out", "Out", 16, 0)],
    transitions: [
      stochastic({
        id: "process",
        name: "Process",
        rate: "return parameters.rate;",
        inputs: ["in"],
        outputs: ["out"],
        x: 8,
        y: 0,
      }),
    ],
  },
};

const server: LibraryComponent = {
  id: "server",
  name: "Server",
  description:
    "Serves tokens from In to Out one at a time per worker taken from Workers.",
  keywords: ["resource", "pool", "queue", "machine"],
  template: {
    name: "Server",
    description:
      "Start pairs a token from In with a worker from Workers; Finish returns the worker and puts the token into Out at `service_rate`. Fuse Workers with a place holding the workers.",
    parameters: [rateParameter("service_rate", "Service rate", "1")],
    types: [],
    differentialEquations: [],
    places: [
      port("in", "In", 0, 0),
      port(
        "workers",
        "Workers",
        0,
        8,
        "Idle workers; the place fused here sets how many.",
      ),
      place("busy", "Busy", 12, 4),
      port("out", "Out", 24, 0),
    ],
    transitions: [
      {
        id: "start",
        name: "Start",
        inputArcs: [
          { placeId: "in", weight: 1, type: "standard" },
          { placeId: "workers", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "busy", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: "return true;",
        transitionKernelCode: "",
        x: 6 * GRID_SIZE,
        y: 4 * GRID_SIZE,
      },
      stochastic({
        id: "finish",
        name: "Finish",
        rate: "return parameters.service_rate;",
        inputs: ["busy"],
        outputs: ["out", "workers"],
        x: 18,
        y: 4,
      }),
    ],
  },
};

const splitter: LibraryComponent = {
  id: "splitter",
  name: "Splitter",
  description: "Routes tokens from In to OutA or OutB by a ratio.",
  keywords: ["router", "branch", "choice"],
  template: {
    name: "Splitter",
    description:
      "Each token in In leaves through OutA with probability `ratio`, else OutB, at `rate` per time unit.",
    parameters: [
      rateParameter("rate", "Rate", "1"),
      rateParameter("ratio", "Ratio to OutA", "0.5"),
    ],
    types: [],
    differentialEquations: [],
    places: [
      port("in", "In", 0, 4),
      port("out_a", "OutA", 16, 0),
      port("out_b", "OutB", 16, 8),
    ],
    transitions: [
      stochastic({
        id: "to_a",
        name: "ToA",
        rate: "return parameters.rate * parameters.ratio;",
        inputs: ["in"],
        outputs: ["out_a"],
        x: 8,
        y: 0,
      }),
      stochastic({
        id: "to_b",
        name: "ToB",
        rate: "return parameters.rate * (1 - parameters.ratio);",
        inputs: ["in"],
        outputs: ["out_b"],
        x: 8,
        y: 8,
      }),
    ],
  },
};

const merger: LibraryComponent = {
  id: "merger",
  name: "Merger",
  description: "Joins the tokens of InA and InB into Out.",
  keywords: ["join", "union", "collect"],
  template: {
    name: "Merger",
    description:
      "Moves tokens from either input into Out at `rate` per time unit.",
    parameters: [rateParameter("rate", "Rate", "1")],
    types: [],
    differentialEquations: [],
    places: [
      port("in_a", "InA", 0, 0),
      port("in_b", "InB", 0, 8),
      port("out", "Out", 16, 4),
    ],
    transitions: [
      stochastic({
        id: "pass_a",
        name: "PassA",
        rate: "return parameters.rate;",
        inputs: ["in_a"],
        outputs: ["out"],
        x: 8,
        y: 0,
      }),
      stochastic({
        id: "pass_b",
        name: "PassB",
        rate: "return parameters.rate;",
        inputs: ["in_b"],
        outputs: ["out"],
        x: 8,
        y: 8,
      }),
    ],
  },
};

const assembly: LibraryComponent = {
  id: "assembly",
  name: "Assembly",
  description:
    "Combines one token of InA with one of InB into one token of Out.",
  keywords: ["join", "combine", "kit"],
  template: {
    name: "Assembly",
    description:
      "Takes one token from each input and puts one into Out, at `rate` per time unit while both inputs hold tokens.",
    parameters: [rateParameter("rate", "Rate", "1")],
    types: [],
    differentialEquations: [],
    places: [
      port("in_a", "InA", 0, 0),
      port("in_b", "InB", 0, 8),
      port("out", "Out", 16, 4),
    ],
    transitions: [
      stochastic({
        id: "assemble",
        name: "Assemble",
        rate: "return parameters.rate;",
        inputs: ["in_a", "in_b"],
        outputs: ["out"],
        x: 8,
        y: 4,
      }),
    ],
  },
};

export const standardComponentLibrary: ComponentLibrary = {
  id: standardComponentLibraryId,
  name: "Standard components",
  description:
    "Sources, sinks, stages, servers and routers for flows of untyped tokens. Fuse their ports with the places of your net.",
  components: [source, sink, stage, server, splitter, merger, assembly],
};
