import { describe, expect, it } from "vitest";

import {
  generatePetrinautId,
  isPetrinautId,
  toPetrinautId,
} from "../document/petrinaut-id";
import { checkComposition } from "./check-composition";
import { flattenComponentInstancesForSimulation } from "./flatten-component-instances";
import { inlineImports } from "./inline-imports";
import { resolveImplementation } from "./interfaces";
import { resolveLibrary } from "./libraries";
import { gateLibrary, logistics, tankLibrary } from "./libraries.test-helpers";

import type { Component, ComponentInstance, SDCPN } from "../types/sdcpn";

const libraries = new Map([
  [logistics.id, resolveLibrary(logistics.id, logistics)],
]);

const instance = (
  id: string,
  overrides: Partial<ComponentInstance> & Pick<ComponentInstance, "component">,
): ComponentInstance => ({
  id,
  name: id,
  parameterValues: {},
  x: 0,
  y: 0,
  ...overrides,
});

const fromLogistics = (id: string) => ({ from: logistics.id, id });

/** A stock fused with the input of a belt of the library, and a transition that takes from its output. */
const document: SDCPN = {
  places: [
    {
      id: "stock",
      name: "Stock",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "ship",
      name: "Ship",
      inputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "belt-1",
            portPlaceId: toPetrinautId("out"),
          },
          weight: 1,
          type: "standard",
        },
      ],
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
  imports: [{ id: logistics.id }],
  componentInstances: [
    instance("belt-1", {
      component: fromLogistics("belt"),
      parameterValues: { [toPetrinautId("rate")]: "3" },
    }),
  ],
  fusions: [
    {
      id: "feed",
      name: "Feed",
      members: [
        { kind: "place", placeId: "stock" },
        {
          kind: "componentPort",
          componentInstanceId: "belt-1",
          portPlaceId: toPetrinautId("in"),
        },
      ],
    },
  ],
};

const componentNamed = (sdcpn: SDCPN, name: string): Component | undefined =>
  sdcpn.components?.find((component) => component.name === name);

describe("inlineImports", () => {
  it("returns the document itself when it takes nothing from a library", () => {
    const plain: SDCPN = {
      ...document,
      imports: undefined,
      componentInstances: [],
      fusions: [],
      transitions: [],
    };

    expect(inlineImports(plain, libraries)).toBe(plain);
  });

  it("makes a component the document uses a component of its own, and stops listing the import", () => {
    const inlined = inlineImports(document, libraries);
    const belt = componentNamed(inlined, "Belt");

    expect(inlined).not.toHaveProperty("imports");
    expect(inlined.components).toHaveLength(1);
    expect(inlined.componentInstances?.[0]).toMatchObject({
      id: "belt-1",
      component: { id: belt?.id },
      parameterValues: { [toPetrinautId("rate")]: "3" },
    });
  });

  it("points the fusions and arcs at the instance's ports to the component's places", () => {
    const inlined = inlineImports(document, libraries);
    const [input, output] = componentNamed(inlined, "Belt")?.places ?? [];

    expect(inlined.fusions?.[0]?.members[1]).toMatchObject({
      portPlaceId: input?.id,
    });
    expect(inlined.transitions[0]?.inputArcs[0]?.endpoint).toMatchObject({
      portPlaceId: output?.id,
    });
    expect(componentNamed(inlined, "Belt")?.transitions[0]).toMatchObject({
      inputArcs: [{ placeId: input?.id }],
      outputArcs: [{ placeId: output?.id }],
    });
  });

  it("leaves a document that no check faults and that runs without its libraries", () => {
    const inlined = inlineImports(document, libraries);

    expect(
      checkComposition(inlined).filter(({ severity }) => severity === "error"),
    ).toEqual([]);
    const flat = flattenComponentInstancesForSimulation({
      sdcpn: inlined,
      initialMarking: {},
      rootParameterValues: {},
      parametersEnabled: true,
    });
    expect(flat.sdcpn.transitions.map(({ name }) => name)).toEqual([
      "Ship",
      "Move",
    ]);
    // The stock, with the belt's input fused into it, and the belt's output.
    expect(flat.sdcpn.places).toHaveLength(2);
  });

  it("gives a component the same ids each time, unless it is handed fresh ones", () => {
    const ids = (sdcpn: SDCPN) => [
      componentNamed(sdcpn, "Belt")?.id,
      ...(componentNamed(sdcpn, "Belt")?.places.map(({ id }) => id) ?? []),
    ];
    const stable = ids(inlineImports(document, libraries));
    const fresh = ids(inlineImports(document, libraries, generatePetrinautId));

    expect(ids(inlineImports(document, libraries))).toEqual(stable);
    expect(fresh.every(isPetrinautId)).toBe(true);
    expect(fresh.filter((id) => stable.includes(id))).toEqual([]);
    // Fresh ids for the places, and so for the ports they are.
    expect(fresh).not.toContain(toPetrinautId("in"));
  });

  it("carries a binding across a library into what the component says it implements", () => {
    const bound: SDCPN = {
      ...document,
      transitions: [],
      fusions: [],
      componentInstances: [
        instance("scale-1", { component: fromLogistics("scale") }),
      ],
      implementations: [
        { interface: fromLogistics("scale"), component: fromLogistics("belt") },
      ],
    };

    const inlined = inlineImports(bound, libraries);
    const scale = componentNamed(inlined, "Scale");
    const belt = componentNamed(inlined, "Belt");

    expect(inlined.implementations).toEqual([
      { interface: { id: scale?.id }, component: { id: belt?.id } },
    ]);
    expect(belt?.implements).toEqual([scale?.id]);
    expect(
      resolveImplementation(inlined, inlined.componentInstances![0]!),
    ).toMatchObject({ kind: "bound", implementation: { name: "Belt" } });
  });

  it("rewrites the implementation an instance chooses, and marks a component of the document that stands behind an interface of a library", () => {
    const own: Component = {
      id: "own-scale",
      name: "OwnScale",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const bound: SDCPN = {
      ...document,
      transitions: [],
      fusions: [],
      components: [own],
      componentInstances: [
        instance("scale-1", {
          component: fromLogistics("scale"),
          implementation: { id: own.id },
        }),
      ],
    };

    const inlined = inlineImports(bound, libraries);

    expect(inlined.componentInstances?.[0]?.implementation).toEqual({
      id: own.id,
    });
    expect(componentNamed(inlined, "OwnScale")?.implements).toEqual([
      componentNamed(inlined, "Scale")?.id,
    ]);
  });

  it("carries the bindings of many instances across a library with one list of what a component implements", () => {
    const own: Component = {
      id: "own-scale",
      name: "OwnScale",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const bound: SDCPN = {
      ...document,
      transitions: [],
      fusions: [],
      components: [own],
      componentInstances: Array.from({ length: 50_000 }, (_, index) =>
        instance(`scale-${index}`, {
          component: fromLogistics("scale"),
          implementation: { id: own.id },
        }),
      ),
    };

    const started = Date.now();
    const inlined = inlineImports(bound, libraries);
    const elapsed = Date.now() - started;

    expect(componentNamed(inlined, "OwnScale")?.implements).toEqual([
      componentNamed(inlined, "Scale")?.id,
    ]);
    // A copy of the list for every instance takes several seconds.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("keeps the token types of two libraries apart in the components it makes of theirs", () => {
    const north = gateLibrary("@hashintel/north", {
      name: "weight",
      type: "real",
    });
    const south = gateLibrary("@hashintel/south", {
      name: "count",
      type: "integer",
    });
    const gates: SDCPN = {
      ...document,
      places: [],
      transitions: [],
      fusions: [],
      imports: [{ id: north.id }, { id: south.id }],
      componentInstances: [north, south].map((library) =>
        instance(library.name, { component: { from: library.id, id: "gate" } }),
      ),
    };

    const inlined = inlineImports(
      gates,
      new Map(
        [north, south].map((library) => [
          library.id,
          resolveLibrary(library.id, library),
        ]),
      ),
    );

    const types = inlined.components?.map((component) => component.types[0]);
    expect(types).toMatchObject([
      { elements: [{ name: "weight" }] },
      { elements: [{ name: "count" }] },
    ]);
    expect(types?.[0]?.id).not.toBe(types?.[1]?.id);
    expect(
      inlined.components?.map((component) => component.places[0]?.colorId),
    ).toEqual(types?.map((type) => type?.id));
  });

  it("gives no two items of one kind one id, whatever ids the bodies of two libraries and the document write alike", () => {
    const north = tankLibrary("@hashintel/north", {
      name: "level",
      type: "real",
    });
    const south = tankLibrary("@hashintel/south", {
      name: "count",
      type: "integer",
    });
    // A document that wrote the words the bodies write holds these ids.
    const fluid = toPetrinautId("fluid");
    const drain = toPetrinautId("drain");
    const fill = toPetrinautId("fill");
    const store = toPetrinautId("store");
    const tanks: SDCPN = {
      places: [
        {
          id: store,
          name: "Store",
          colorId: fluid,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: fill,
          name: "Fill",
          inputArcs: [],
          outputArcs: [{ placeId: store, weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [
        {
          id: fluid,
          name: "Fluid",
          iconSlug: "circle",
          displayColor: "#000",
          elements: [],
        },
      ],
      differentialEquations: [
        { id: drain, name: "Drain", colorId: fluid, code: "", arity: 1 },
      ],
      parameters: [],
      imports: [{ id: north.id }, { id: south.id }],
      componentInstances: [north, south].map((library) =>
        instance(library.name, { component: { from: library.id, id: "tank" } }),
      ),
    };

    const inlined = inlineImports(
      tanks,
      new Map(
        [north, south].map((library) => [
          library.id,
          resolveLibrary(library.id, library),
        ]),
      ),
    );

    const nets = [inlined, ...(inlined.components ?? [])];
    expect(nets).toHaveLength(3);
    for (const kind of [
      "places",
      "transitions",
      "types",
      "differentialEquations",
    ] as const) {
      const ids = nets.flatMap((net) => net[kind].map(({ id }) => id));
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
    // Each body still reads its own type, equation and places.
    for (const tank of inlined.components ?? []) {
      const [port, held] = tank.places;
      expect(port?.colorId).toBe(tank.types[0]?.id);
      expect(port?.dynamics?.[0]?.differentialEquationId).toBe(
        tank.differentialEquations[0]?.id,
      );
      expect(tank.differentialEquations[0]?.colorId).toBe(tank.types[0]?.id);
      expect(tank.transitions[0]).toMatchObject({
        inputArcs: [{ placeId: port?.id }],
        outputArcs: [{ endpoint: { placeId: held?.id } }],
      });
    }
  });

  it("leaves what names an import that did not resolve as it is", () => {
    const partial: SDCPN = {
      ...document,
      imports: [{ id: logistics.id }, { id: "@hashintel/missing" }],
      componentInstances: [
        ...(document.componentInstances ?? []),
        instance("lost-1", {
          component: { from: "@hashintel/missing", id: "lost" },
        }),
      ],
    };

    const inlined = inlineImports(partial, libraries);

    expect(inlined.imports).toEqual([{ id: "@hashintel/missing" }]);
    expect(inlined.componentInstances?.[1]).toEqual(
      partial.componentInstances?.[1],
    );
  });
});
