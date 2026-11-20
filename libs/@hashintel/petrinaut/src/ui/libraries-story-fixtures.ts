import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  type Library,
  type LibraryParameter,
  type LibraryPort,
  type ResolveImport,
  type SDCPN,
} from "@hashintel/petrinaut-core";

const lineInPort: LibraryPort = { id: "in", name: "In", direction: "in" };
const lineOutPort: LibraryPort = { id: "out", name: "Out", direction: "out" };
const rate: LibraryParameter = {
  id: "rate",
  name: "Rate",
  variableName: "rate",
  type: "real",
  defaultValue: "1",
};

/** What a component with one input and one output runs: one transition between them. */
const passThrough = (transitionName: string) => ({
  places: [
    {
      id: "in",
      name: "In",
      colorId: null,
      dynamicsEnabled: false,
      x: 80,
      y: 160,
    },
    {
      id: "out",
      name: "Out",
      colorId: null,
      dynamicsEnabled: false,
      x: 440,
      y: 160,
    },
  ],
  transitions: [
    {
      id: "pass",
      name: transitionName,
      inputArcs: [{ placeId: "in", weight: 1, type: "standard" as const }],
      outputArcs: [{ placeId: "out", weight: 1 }],
      lambdaType: "stochastic" as const,
      lambdaCode: generateDefaultLambdaCode("stochastic"),
      transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
      x: 260,
      y: 160,
    },
  ],
});

/**
 * A library with a component that runs, `conveyor`, and an interface with
 * the same ports and parameter, `station`, which the conveyor can stand
 * behind.
 */
export const logisticsLibrary: Library = {
  id: "@hashintel/logistics",
  name: "Logistics",
  components: [
    {
      id: "conveyor",
      name: "Conveyor",
      description: "Moves what comes in to the other end",
      displayColor: "#2563eb",
      ports: [lineInPort, lineOutPort],
      parameters: [rate],
      body: passThrough("Move"),
    },
    {
      id: "station",
      name: "Station",
      description: "A step of the line, run by what is bound to it",
      displayColor: "#7c3aed",
      ports: [lineInPort, lineOutPort],
      parameters: [rate],
    },
  ],
};

/** A second library, for a host to hand over late. */
export const toolingLibrary: Library = {
  id: "@hashintel/tooling",
  name: "Tooling",
  components: [
    {
      id: "press",
      name: "Press",
      description: "Presses one part at a time",
      displayColor: "#ea580c",
      ports: [lineInPort, lineOutPort],
      body: passThrough("Press"),
    },
  ],
};

/** An id no library answers to. */
export const missingLibraryId = "@hashintel/missing";

/**
 * A host's resolver over the two libraries: logistics is in memory and
 * resolves at once, tooling arrives after `delayMs`, and any other id is
 * refused after the same wait.
 */
export const createStoryImportResolver =
  (delayMs: number): ResolveImport =>
  (id) => {
    if (id === logisticsLibrary.id) {
      return logisticsLibrary;
    }
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (id === toolingLibrary.id) {
          resolve(toolingLibrary);
        } else {
          reject(new Error(`The registry has no library ${id}.`));
        }
      }, delayMs);
    });
  };

// Created once: a new resolver or a new list would create a new editor
// instance on every render, and resolve every import again.
export const resolveStoryImport = createStoryImportResolver(2500);
export const offeredLibraries = [
  logisticsLibrary.id,
  toolingLibrary.id,
  missingLibraryId,
];

/** A resolver over a library the host holds in memory: it resolves at once, with no loader. */
export const resolveLogistics: ResolveImport = (id) =>
  id === logisticsLibrary.id ? logisticsLibrary : undefined;
export const logisticsOnly = [logisticsLibrary.id];

const port = (componentInstanceId: string, portPlaceId: string) => ({
  kind: "componentPort" as const,
  componentInstanceId,
  portPlaceId,
});

/**
 * A line over three imports: a conveyor of the first feeds a press of the
 * second, and a third instance names a component of a library that does not
 * resolve.
 */
export const importingLineNet: SDCPN = {
  places: [
    {
      id: "parts",
      name: "Parts",
      colorId: null,
      dynamicsEnabled: false,
      showAsInitialState: true,
      x: 100,
      y: 220,
    },
    {
      id: "buffer",
      name: "Buffer",
      colorId: null,
      dynamicsEnabled: false,
      x: 520,
      y: 220,
    },
    {
      id: "finished",
      name: "Finished",
      colorId: null,
      dynamicsEnabled: false,
      x: 940,
      y: 220,
    },
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  imports: [
    { id: logisticsLibrary.id },
    { id: toolingLibrary.id },
    { id: missingLibraryId },
  ],
  componentInstances: [
    {
      id: "belt",
      name: "Belt",
      component: { from: logisticsLibrary.id, id: "conveyor" },
      parameterValues: {},
      x: 310,
      y: 220,
    },
    {
      id: "press",
      name: "Press",
      component: { from: toolingLibrary.id, id: "press" },
      parameterValues: {},
      x: 730,
      y: 220,
    },
    {
      id: "sorter",
      name: "Sorter",
      component: { from: missingLibraryId, id: "sorter" },
      parameterValues: {},
      x: 730,
      y: 420,
    },
  ],
  fusions: [
    {
      id: "fuse_parts",
      name: "Parts",
      members: [{ kind: "place", placeId: "parts" }, port("belt", "in")],
    },
    {
      id: "fuse_buffer",
      name: "Buffer",
      members: [
        { kind: "place", placeId: "buffer" },
        port("belt", "out"),
        port("press", "in"),
      ],
    },
    {
      id: "fuse_finished",
      name: "Finished",
      members: [{ kind: "place", placeId: "finished" }, port("press", "out")],
    },
  ],
};
