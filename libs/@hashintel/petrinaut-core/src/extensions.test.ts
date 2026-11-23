import { describe, expect, it } from "vitest";

import { isSDCPNEqual } from "./document/deep-equal";
import {
  createTransitionLogicAvailabilityReader,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  sanitizeTransitionForAvailability,
  stripDisabledExtensionData,
} from "./extensions";

import type { ResolvedLibraries } from "./composition/libraries";
import type { PetrinautExtensionSettings } from "./extensions";
import type { SDCPN } from "./types/sdcpn";

const allEnabled: PetrinautExtensionSettings = {
  colors: true,
  stochasticity: true,
  dynamics: true,
  parameters: true,
  components: true,
};

/** One transition of the net, sanitised as a pass over the net sanitises each. */
const sanitizeTransitionForExtensions = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
) =>
  sanitizeTransitionForAvailability(
    transition,
    getTransitionLogicAvailability(transition, sdcpn, extensions),
  );

const createSDCPN = (
  transition: Partial<SDCPN["transitions"][number]> = {},
  place: Partial<SDCPN["places"][number]> = {},
): SDCPN => ({
  places: [
    {
      id: "place-1",
      name: "Input",
      colorId: place.colorId ?? "type-1",
      dynamicsEnabled: false,
      x: 0,
      y: 0,
      ...place,
    },
  ],
  transitions: [
    {
      id: "transition-1",
      name: "Fire",
      inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" as const }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
      ...transition,
    },
  ],
  types: [
    {
      id: "type-1",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#808080",
      elements: [{ elementId: "element-1", name: "x", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [],
});

const createComponentPortSDCPN = (
  transition: Partial<SDCPN["transitions"][number]> = {},
): SDCPN => ({
  places: [],
  transitions: [
    {
      id: "transition-1",
      name: "Fire",
      inputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "instance-1",
            portPlaceId: "port-in",
          },
          weight: 1,
          type: "standard",
        },
      ],
      outputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "instance-1",
            portPlaceId: "port-out",
          },
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
      ...transition,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [
    {
      id: "instance-1",
      name: "Instance 1",
      component: { id: "component-1" },
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
  components: [
    {
      id: "component-1",
      name: "Component 1",
      places: [
        {
          id: "port-in",
          name: "Port In",
          colorId: "type-1",
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
        {
          id: "port-out",
          name: "Port Out",
          colorId: "type-1",
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      types: [
        {
          id: "type-1",
          name: "Token",
          iconSlug: "circle",
          displayColor: "#808080",
          elements: [{ elementId: "element-1", name: "x", type: "real" }],
        },
      ],
      differentialEquations: [],
      parameters: [],
      componentInstances: [],
    },
  ],
});

describe("transition logic availability", () => {
  it("allows predicate and stochastic lambda authoring without coloured inputs when stochasticity is enabled", () => {
    const sdcpn = createSDCPN({}, { colorId: null });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, allEnabled),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
      stochasticLambda: true,
    });
  });

  it("allows predicate lambda authoring for coloured standard inputs", () => {
    const sdcpn = createSDCPN();

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
      stochasticLambda: false,
    });
  });

  it("allows predicate lambda authoring for coloured read inputs", () => {
    const sdcpn = createSDCPN({
      inputArcs: [{ placeId: "place-1", weight: 1, type: "read" as const }],
    });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
      stochasticLambda: false,
    });
  });

  it("ignores inhibitor arcs for predicate lambda authoring", () => {
    const sdcpn = createSDCPN({
      inputArcs: [
        { placeId: "place-1", weight: 1, type: "inhibitor" as const },
      ],
    });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: false,
      predicateLambda: false,
      stochasticLambda: false,
    });
  });

  it("allows predicate lambda authoring for coloured component-port inputs", () => {
    const sdcpn = createComponentPortSDCPN({ outputArcs: [] });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
      stochasticLambda: false,
    });
  });

  it("allows transition kernel authoring for coloured component-port outputs", () => {
    const sdcpn = createComponentPortSDCPN({ inputArcs: [] });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      transitionKernel: true,
    });
  });

  it("ignores component-port arcs when components are disabled", () => {
    const sdcpn = createComponentPortSDCPN();

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
        components: false,
      }),
    ).toMatchObject({
      lambda: false,
      predicateLambda: false,
      stochasticLambda: false,
      transitionKernel: false,
    });
  });

  it("clears unavailable lambda and kernel code while preserving core fields", () => {
    const sdcpn = createSDCPN(
      {
        lambdaType: "stochastic",
        outputArcs: [{ placeId: "place-1", weight: 1 }],
      },
      { colorId: null },
    );
    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        colors: false,
        stochasticity: false,
        dynamics: false,
        parameters: true,
        components: true,
      },
    );

    expect(transition).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
  });

  it("coerces stochastic lambda type when stochasticity is disabled", () => {
    const sdcpn = createSDCPN({
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 1);",
    });

    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        ...allEnabled,
        stochasticity: false,
      },
    );

    expect(transition).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
    });
  });

  it("preserves lambda and kernel code for coloured component-port arcs", () => {
    const sdcpn = createComponentPortSDCPN();
    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        ...allEnabled,
        stochasticity: false,
      },
    );

    expect(transition).toMatchObject({
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
    });
  });

  it("returns a sanitized SDCPN copy without mutating the source", () => {
    const sdcpn = createSDCPN(
      {
        lambdaType: "stochastic",
        outputArcs: [{ placeId: "place-1", weight: 1 }],
      },
      { colorId: "type-1" },
    );

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      colors: false,
      stochasticity: false,
      dynamics: false,
      parameters: false,
      components: true,
    });

    expect(sanitized.places[0]!.colorId).toBeNull();
    expect(sanitized.transitions[0]).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
    expect(sdcpn.places[0]!.colorId).toBe("type-1");
    expect(sdcpn.transitions[0]!.lambdaCode).not.toBe("");
  });

  it("removes component-port arcs and code when components are disabled", () => {
    const sdcpn = createComponentPortSDCPN();

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      ...allEnabled,
      stochasticity: false,
      components: false,
    });

    expect(sanitized.components).toBeUndefined();
    expect(sanitized.componentInstances).toBeUndefined();
    expect(sanitized.transitions[0]).toMatchObject({
      inputArcs: [],
      outputArcs: [],
      lambdaCode: "",
      transitionKernelCode: "",
    });
    expect(sdcpn.transitions[0]!.inputArcs).toHaveLength(1);
    expect(sdcpn.transitions[0]!.outputArcs).toHaveLength(1);
  });

  it("converts coloured scenario initial-state rows to uncoloured counts when colours are disabled", () => {
    const sdcpn = {
      ...createSDCPN({}, { colorId: "type-1" }),
      scenarios: [
        {
          id: "scenario-1",
          name: "Scenario 1",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: {
            type: "per_place" as const,
            content: {
              "place-1": [[1], [2]],
            },
          },
        },
      ],
    };

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      ...allEnabled,
      colors: false,
      dynamics: false,
    });

    expect(sanitized.scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: { "place-1": "2" },
    });
    expect(sdcpn.scenarios[0]!.initialState).toEqual({
      type: "per_place",
      content: {
        "place-1": [[1], [2]],
      },
    });
  });

  it("does not add optional keys that are absent on the source", () => {
    const sdcpn = createSDCPN();

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, allEnabled);

    expect(Object.hasOwn(sanitized, "description")).toBe(false);
    expect(Object.hasOwn(sanitized, "metadata")).toBe(false);
    expect(Object.hasOwn(sanitized, "scenarios")).toBe(false);
    expect(Object.hasOwn(sanitized, "metrics")).toBe(false);
    expect(Object.hasOwn(sanitized, "components")).toBe(false);
    expect(Object.hasOwn(sanitized, "componentInstances")).toBe(false);
  });

  it("does not add optional keys to components that are absent on the source", () => {
    const sdcpn: SDCPN = {
      ...createSDCPN(),
      components: [
        {
          id: "component-1",
          name: "Component 1",
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
    };

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, allEnabled);

    expect(Object.hasOwn(sanitized.components![0]!, "componentInstances")).toBe(
      false,
    );
    expect(Object.hasOwn(sanitized.components![0]!, "description")).toBe(false);
    expect(Object.hasOwn(sanitized.components![0]!, "metadata")).toBe(false);
  });

  it("keeps a component's icon and colour", () => {
    const iconSvg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const sdcpn: SDCPN = {
      ...createSDCPN(),
      components: [
        {
          id: "component-1",
          name: "Component 1",
          iconSvg,
          displayColor: "#3b82f6",
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
    };

    expect(
      sanitizeSDCPNForExtensions(sdcpn, allEnabled).components?.[0],
    ).toMatchObject({ iconSvg, displayColor: "#3b82f6" });
  });

  it("keeps the description and metadata of the net and its components", () => {
    const sdcpn: SDCPN = {
      ...createSDCPN(),
      description: "An SIR model",
      metadata: { source: { app: "host", tags: ["sir"] } },
      components: [
        {
          id: "component-1",
          name: "Component 1",
          description: "A reusable stage",
          metadata: { owner: "host" },
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
    };

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, allEnabled);

    expect(sanitized.description).toBe("An SIR model");
    expect(sanitized.metadata).toEqual(sdcpn.metadata);
    expect(sanitized.metadata).not.toBe(sdcpn.metadata);
    expect(sanitized.components?.[0]).toMatchObject({
      description: "A reusable stage",
      metadata: { owner: "host" },
    });

    const persisted = JSON.parse(JSON.stringify(sanitized)) as SDCPN;
    expect(
      isSDCPNEqual(
        sanitizeSDCPNForExtensions(persisted, allEnabled),
        persisted,
      ),
    ).toBe(true);
  });

  it("strips composed dynamics when the dynamics extension is disabled", () => {
    const sdcpn = createSDCPN(
      {},
      {
        dynamicsEnabled: true,
        dynamics: [
          { differentialEquationId: "equation-1" },
          { differentialEquationId: "equation-2" },
        ],
      },
    );

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      ...allEnabled,
      dynamics: false,
    });

    expect(sanitized.places[0]).toMatchObject({
      dynamicsEnabled: false,
    });
    expect(sanitized.places[0]).not.toHaveProperty("dynamics");
    expect(sdcpn.places[0]!.dynamics).toHaveLength(2);
  });

  it("copies composed dynamics without sharing them with the source", () => {
    const sdcpn = createSDCPN(
      {},
      {
        dynamicsEnabled: true,
        dynamics: [
          { differentialEquationId: "equation-1" },
          { differentialEquationId: "equation-2" },
        ],
      },
    );

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, allEnabled);

    expect(sanitized.places[0]!.dynamics).toEqual(sdcpn.places[0]!.dynamics);
    expect(sanitized.places[0]!.dynamics).not.toBe(sdcpn.places[0]!.dynamics);
    expect(sanitized.places[0]!.dynamics![0]).not.toBe(
      sdcpn.places[0]!.dynamics![0],
    );
    expect(
      sanitizeSDCPNForExtensions(createSDCPN(), allEnabled).places[0],
    ).not.toHaveProperty("dynamics");
  });

  it("copies fusions without sharing them, and drops them when components are disabled", () => {
    const sdcpn: SDCPN = {
      ...createComponentPortSDCPN(),
      places: createSDCPN().places,
      fusions: [
        {
          id: "fusion-1",
          name: "Fusion-1",
          members: [
            { kind: "place", placeId: "place-1" },
            {
              kind: "componentPort",
              componentInstanceId: "instance-1",
              portPlaceId: "port-1",
            },
          ],
        },
      ],
    };

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, allEnabled);
    expect(sanitized.fusions).toEqual(sdcpn.fusions);
    expect(sanitized.fusions![0]!.members).not.toBe(sdcpn.fusions![0]!.members);

    expect(
      sanitizeSDCPNForExtensions(sdcpn, { ...allEnabled, components: false }),
    ).not.toHaveProperty("fusions");
  });

  it("leaves a freshly loaded net comparing equal to its persisted form", () => {
    // The in-memory document, as the editor holds it.
    const inMemory = sanitizeSDCPNForExtensions(createSDCPN(), allEnabled);

    // Saving serialises to JSON, which drops keys that are absent (or set to
    // `undefined`).
    const persisted = JSON.parse(JSON.stringify(inMemory)) as SDCPN;

    // Loading sanitizes the stored definition again. An untouched net must
    // still compare equal to its snapshot, or the editor reports unsaved
    // changes and the host arms its `beforeunload` guard.
    const loaded = sanitizeSDCPNForExtensions(persisted, allEnabled);

    expect(isSDCPNEqual(loaded, persisted)).toBe(true);
  });
});

type Place = SDCPN["places"][number];
type Transition = SDCPN["transitions"][number];

const tokenType: SDCPN["types"][number] = {
  id: "type-1",
  name: "Token",
  iconSlug: "circle",
  displayColor: "#808080",
  elements: [{ elementId: "element-1", name: "x", type: "real" }],
};

const placeOf = (
  id: string,
  colorId: string | null,
  rest: Partial<Place> = {},
): Place => ({
  id,
  name: id,
  colorId,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
  ...rest,
});

const fromPlace = (placeId: string): Transition["inputArcs"][number] => ({
  placeId,
  weight: 1,
  type: "standard",
});

const toPlace = (placeId: string): Transition["outputArcs"][number] => ({
  placeId,
  weight: 1,
});

const toPort = (
  componentInstanceId: string,
  portPlaceId: string,
): Transition["outputArcs"][number] => ({
  endpoint: { kind: "componentPort", componentInstanceId, portPlaceId },
  weight: 1,
});

const fromPort = (
  componentInstanceId: string,
  portPlaceId: string,
): Transition["inputArcs"][number] => ({
  ...toPort(componentInstanceId, portPlaceId),
  type: "standard",
});

/** A predicate transition with a lambda and a kernel written, named `name`. */
const transitionOf = (
  name: string,
  inputArcs: Transition["inputArcs"],
  outputArcs: Transition["outputArcs"],
): Transition => ({
  id: name,
  name,
  inputArcs,
  outputArcs,
  lambdaType: "predicate",
  lambdaCode: "export default Lambda(() => true);",
  transitionKernelCode: "export default TransitionKernel(() => ({}));",
  x: 0,
  y: 0,
});

/**
 * A net with places of its own, an instance of one of its components, an
 * instance of a component of an import, and a fusion. Each transition is
 * named after what its arcs reach. The component has a plain place under the
 * id of a typed place of the net.
 */
const createComposedSDCPN = (): SDCPN => ({
  places: [placeOf("typed", "type-1"), placeOf("plain", null)],
  transitions: [
    transitionOf("typed places", [fromPlace("typed")], [toPlace("typed")]),
    transitionOf("plain places", [fromPlace("plain")], [toPlace("plain")]),
    transitionOf(
      "typed place behind an inhibitor",
      [{ placeId: "typed", weight: 1, type: "inhibitor" }],
      [toPlace("plain")],
    ),
    transitionOf(
      "typed ports",
      [fromPort("instance-1", "port-typed")],
      [toPort("instance-1", "port-typed")],
    ),
    transitionOf(
      "plain port and place inside the component",
      [fromPort("instance-1", "port-plain")],
      [toPort("instance-1", "inner")],
    ),
    transitionOf(
      "ports of an import",
      [fromPort("instance-2", "port")],
      [toPort("instance-2", "port")],
    ),
    transitionOf(
      "missing place and instance",
      [fromPlace("missing")],
      [toPort("missing", "port-typed")],
    ),
    transitionOf("no arcs", [], []),
  ],
  types: [tokenType],
  differentialEquations: [],
  parameters: [],
  componentInstances: [
    {
      id: "instance-1",
      name: "Instance 1",
      component: { id: "component-1" },
      parameterValues: {},
      x: 0,
      y: 0,
    },
    {
      id: "instance-2",
      name: "Instance 2",
      component: { from: "library-1", id: "remote" },
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
  fusions: [
    {
      id: "fusion-1",
      name: "Fusion",
      members: [
        { kind: "place", placeId: "typed" },
        {
          kind: "componentPort",
          componentInstanceId: "instance-1",
          portPlaceId: "port-typed",
        },
      ],
    },
  ],
  components: [
    {
      id: "component-1",
      name: "Component",
      places: [
        placeOf("port-typed", "type-1", { isPort: true }),
        placeOf("port-plain", null, { isPort: true }),
        placeOf("inner", "type-1"),
        placeOf("typed", null),
      ],
      transitions: [
        transitionOf(
          "typed places of the component",
          [fromPlace("port-typed")],
          [toPlace("inner")],
        ),
        transitionOf(
          "plain place under the id of a typed place of the net",
          [fromPlace("typed")],
          [toPlace("typed")],
        ),
      ],
      types: [tokenType],
      differentialEquations: [],
      parameters: [],
    },
  ],
});

/** The import of the composed net, read: its component has one plain port. */
const readLibraries: ResolvedLibraries = new Map([
  [
    "library-1",
    {
      id: "library-1",
      name: "Library",
      components: [
        {
          id: "remote",
          name: "Remote",
          places: [placeOf("port", null, { isPort: true })],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
    },
  ],
]);

const withoutStochasticity: PetrinautExtensionSettings = {
  ...allEnabled,
  stochasticity: false,
};

/**
 * Whether a predicate and a kernel can be written, by name of transition,
 * for the composed net with colours and components on and no rates.
 */
const composedAvailability: Record<string, [boolean, boolean]> = {
  "typed places": [true, true],
  "plain places": [false, false],
  "typed place behind an inhibitor": [false, false],
  "typed ports": [true, true],
  "plain port and place inside the component": [false, false],
  // What a port of an import carries cannot be told until the import is read.
  "ports of an import": [true, true],
  "missing place and instance": [false, false],
  "no arcs": [false, false],
  "typed places of the component": [true, true],
  "plain place under the id of a typed place of the net": [false, false],
};

const netsOf = (sdcpn: SDCPN) => [sdcpn, ...(sdcpn.components ?? [])];

describe("a pass over the transitions of a net", () => {
  const askPerPass = (
    sdcpn: SDCPN,
    extensions: PetrinautExtensionSettings,
    libraries?: ResolvedLibraries,
  ) =>
    netsOf(sdcpn).flatMap((net) => {
      const readAvailability = createTransitionLogicAvailabilityReader(
        sdcpn,
        extensions,
        net,
        libraries,
      );
      return net.transitions.map(
        (transition) =>
          [transition.name, readAvailability(transition)] as const,
      );
    });

  const askPerTransition = (
    sdcpn: SDCPN,
    extensions: PetrinautExtensionSettings,
    libraries?: ResolvedLibraries,
  ) =>
    netsOf(sdcpn).flatMap((net) =>
      net.transitions.map(
        (transition) =>
          [
            transition.name,
            getTransitionLogicAvailability(
              transition,
              sdcpn,
              extensions,
              net,
              libraries,
            ),
          ] as const,
      ),
    );

  it.each([
    ["one reader per net", askPerPass],
    ["one question per transition", askPerTransition],
  ])(
    "tells what each transition of a net and of its components can have, through %s",
    (_, ask) => {
      const sdcpn = createComposedSDCPN();
      const predicateAndKernel = (
        extensions: PetrinautExtensionSettings,
        libraries?: ResolvedLibraries,
      ) =>
        Object.fromEntries(
          ask(sdcpn, extensions, libraries).map(([name, availability]) => [
            name,
            [availability.predicateLambda, availability.transitionKernel],
          ]),
        );

      expect(predicateAndKernel(withoutStochasticity)).toEqual(
        composedAvailability,
      );
      expect(predicateAndKernel(withoutStochasticity, readLibraries)).toEqual({
        ...composedAvailability,
        "ports of an import": [false, false],
      });
      expect(
        predicateAndKernel({ ...withoutStochasticity, components: false }),
      ).toEqual({
        ...composedAvailability,
        "typed ports": [false, false],
        "ports of an import": [false, false],
      });
      expect(
        predicateAndKernel({ ...withoutStochasticity, colors: false }),
      ).toEqual(
        Object.fromEntries(
          Object.keys(composedAvailability).map((name) => [
            name,
            [false, false],
          ]),
        ),
      );
      // A rate needs no typed input, and a kernel still needs a typed output.
      expect(predicateAndKernel(allEnabled)).toEqual(
        Object.fromEntries(
          Object.entries(composedAvailability).map(([name, [, kernel]]) => [
            name,
            [true, kernel],
          ]),
        ),
      );
    },
  );

  const writtenCode = (sdcpn: SDCPN) =>
    Object.fromEntries(
      netsOf(sdcpn).flatMap((net) =>
        net.transitions.map((transition) => [
          transition.name,
          [
            transition.lambdaCode !== "",
            transition.transitionKernelCode !== "",
          ],
        ]),
      ),
    );

  it("keeps the code of the transitions that can have it, in the net and in each component", () => {
    const sanitized = sanitizeSDCPNForExtensions(
      createComposedSDCPN(),
      withoutStochasticity,
    );

    expect(writtenCode(sanitized)).toEqual(composedAvailability);
    expect(sanitized.fusions).toEqual(createComposedSDCPN().fusions);
  });

  it("drops port arcs, fusions and the code that needed them when components are disabled", () => {
    const sanitized = sanitizeSDCPNForExtensions(createComposedSDCPN(), {
      ...withoutStochasticity,
      components: false,
    });

    expect(writtenCode(sanitized)).toEqual({
      "typed places": [true, true],
      "plain places": [false, false],
      "typed place behind an inhibitor": [false, false],
      "typed ports": [false, false],
      "plain port and place inside the component": [false, false],
      "ports of an import": [false, false],
      "missing place and instance": [false, false],
      "no arcs": [false, false],
    });
    expect(
      sanitized.transitions.find(({ name }) => name === "typed ports"),
    ).toMatchObject({ inputArcs: [], outputArcs: [] });
    expect(sanitized).not.toHaveProperty("fusions");
  });

  it("reads the places as they are when the pass starts", () => {
    const sdcpn = createSDCPN({ outputArcs: [toPlace("place-2")] });
    const kernelCode = sdcpn.transitions[0]!.transitionKernelCode;

    // The output place is not in the net yet.
    stripDisabledExtensionData(sdcpn, allEnabled);
    expect(sdcpn.transitions[0]!.transitionKernelCode).toBe("");

    sdcpn.places.push(placeOf("place-2", "type-1"));
    sdcpn.transitions[0]!.transitionKernelCode = kernelCode;
    stripDisabledExtensionData(sdcpn, allEnabled);
    expect(sdcpn.transitions[0]!.transitionKernelCode).toBe(kernelCode);

    sdcpn.places.pop();
    stripDisabledExtensionData(sdcpn, allEnabled);
    expect(sdcpn.transitions[0]!.transitionKernelCode).toBe("");
  });

  /**
   * A net of `transitionCount` transitions between three typed places, and
   * how many times the id of a place was read: indexing the places of a net
   * reads the id of each of them once.
   */
  const createCountedNet = (transitionCount: number) => {
    let placeIdReads = 0;
    const sdcpn: SDCPN = {
      places: ["place-1", "place-2", "place-3"].map((id) =>
        Object.defineProperty(placeOf(id, "type-1"), "id", {
          enumerable: true,
          get: () => {
            placeIdReads += 1;
            return id;
          },
        }),
      ),
      transitions: Array.from({ length: transitionCount }, (_, index) =>
        transitionOf(
          `transition-${index}`,
          [fromPlace("place-1"), fromPlace("place-2")],
          [toPlace("place-3")],
        ),
      ),
      types: [tokenType],
      differentialEquations: [],
      parameters: [],
    };
    return { sdcpn, placeIdReads: () => placeIdReads };
  };

  it.each([
    ["every extension enabled", allEnabled],
    ["stochasticity disabled", withoutStochasticity],
    ["components disabled", { ...allEnabled, components: false }],
  ])(
    "reads each place of a net once, however many transitions the net has, with %s",
    (_, extensions) => {
      const few = createCountedNet(2);
      const many = createCountedNet(250);

      stripDisabledExtensionData(few.sdcpn, extensions);
      stripDisabledExtensionData(many.sdcpn, extensions);

      expect(few.placeIdReads()).toBe(3);
      expect(many.placeIdReads()).toBe(3);
    },
  );

  it("reads no place when colours are disabled", () => {
    const { sdcpn, placeIdReads } = createCountedNet(250);
    const readAvailability = createTransitionLogicAvailabilityReader(sdcpn, {
      ...allEnabled,
      colors: false,
    });

    for (const transition of sdcpn.transitions) {
      readAvailability(transition);
    }
    expect(placeIdReads()).toBe(0);
  });
});
