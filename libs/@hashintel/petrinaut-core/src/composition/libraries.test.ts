import { describe, expect, it } from "vitest";

import { toPetrinautId } from "../petrinaut-id";
import { isInterface, resolveComponent } from "./interfaces";
import { resolveLibrary, type Library } from "./libraries";
import { gateLibrary, logistics } from "./libraries.test-helpers";

const [scale, belt] = logistics.components;

/** `logistics` with its components replaced. */
const withComponents = (components: Library["components"]): Library => ({
  ...logistics,
  components,
});

const resolving = (library: unknown) => () =>
  resolveLibrary(logistics.id, library);

describe("resolveLibrary", () => {
  it("gives each component as a subnet under the id the library gives it", () => {
    const library = resolveLibrary(logistics.id, logistics);

    expect(library).toMatchObject({ id: logistics.id, name: "Logistics" });
    expect(library.components.map(({ id, name }) => [id, name])).toEqual([
      ["scale", "Scale"],
      ["belt", "Belt"],
    ]);
  });

  it("makes a component without a body an interface, its ports under their ids as a document reads them", () => {
    const [iface] = resolveLibrary(logistics.id, logistics).components;

    expect(iface && isInterface(iface)).toBe(true);
    expect(iface?.transitions).toEqual([]);
    expect(iface?.places).toMatchObject([
      {
        id: toPetrinautId("in"),
        name: "In",
        isPort: true,
        portDirection: "in",
      },
      {
        id: toPetrinautId("out"),
        name: "Out",
        isPort: true,
        portDirection: "out",
      },
    ]);
    expect(iface?.parameters).toMatchObject([
      { id: toPetrinautId("rate"), variableName: "rate" },
    ]);
  });

  it("marks the places of a body that the ports name, and wires its arcs to them", () => {
    const running = resolveLibrary(logistics.id, logistics).components[1];

    expect(running && isInterface(running)).toBe(false);
    expect(running?.places.map(({ id, isPort }) => [id, isPort])).toEqual([
      [toPetrinautId("in"), true],
      [toPetrinautId("out"), true],
    ]);
    expect(running?.transitions[0]?.inputArcs[0]?.placeId).toBe(
      toPetrinautId("in"),
    );
  });

  it("leaves a place of a body that no port names off the ports, whatever it says", () => {
    const library = withComponents([
      {
        ...belt!,
        body: {
          ...belt!.body!,
          places: [
            ...belt!.body!.places,
            {
              id: "buffer",
              name: "Buffer",
              colorId: null,
              dynamicsEnabled: false,
              isPort: true,
              portDirection: "in",
              x: 0,
              y: 0,
            },
          ],
        },
      },
    ]);

    const buffer = resolveLibrary(logistics.id, library).components[0]
      ?.places[2];

    expect(buffer).toMatchObject({ name: "Buffer" });
    expect(buffer).not.toHaveProperty("isPort");
    expect(buffer).not.toHaveProperty("portDirection");
  });

  it("declares one token type per name for the ports of an interface", () => {
    const parcel = {
      name: "Parcel",
      displayColor: "#1E90FF",
      elements: [{ name: "weight", type: "real" as const }],
    };
    const library = withComponents([
      {
        ...scale!,
        ports: [
          { id: "in", name: "In", tokenType: parcel },
          { id: "out", name: "Out", tokenType: parcel },
        ],
      },
    ]);

    const [iface] = resolveLibrary(logistics.id, library).components;

    expect(iface?.types).toMatchObject([
      { name: "Parcel", elements: [{ name: "weight", type: "real" }] },
    ]);
    expect(iface?.places.map(({ colorId }) => colorId)).toEqual([
      iface?.types[0]?.id,
      iface?.types[0]?.id,
    ]);
  });

  it("keeps the token types of two libraries apart, whatever ids their components and ports share", () => {
    const north = gateLibrary("@hashintel/north", {
      name: "weight",
      type: "real",
    });
    const south = gateLibrary("@hashintel/south", {
      name: "count",
      type: "integer",
    });
    const libraries = new Map(
      [north, south].map((library) => [
        library.id,
        resolveLibrary(library.id, library),
      ]),
    );
    const typeOf = (from: string) =>
      resolveComponent({}, { from, id: "gate" }, libraries)?.types[0];

    expect(typeOf(north.id)?.elements).toMatchObject([{ name: "weight" }]);
    expect(typeOf(south.id)?.elements).toMatchObject([{ name: "count" }]);
    expect(typeOf(north.id)?.id).not.toBe(typeOf(south.id)?.id);
    expect(typeOf(north.id)?.elements[0]?.elementId).not.toBe(
      typeOf(south.id)?.elements[0]?.elementId,
    );
  });

  it("gives the same subnets each time it reads the same library", () => {
    expect(resolveLibrary(logistics.id, logistics)).toEqual(
      resolveLibrary(logistics.id, logistics),
    );
  });

  it("refuses a library under another id than the import's", () => {
    expect(() => resolveLibrary("@hashintel/other", logistics)).toThrow(
      "The library resolved for `@hashintel/other` has the id `@hashintel/logistics`.",
    );
  });

  it("refuses two components with one id, naming both", () => {
    const library = withComponents([scale!, { ...belt!, id: "scale" }]);

    expect(resolving(library)).toThrow(
      "The library `@hashintel/logistics` has two components with the id `scale`: `Scale` and `Belt`.",
    );
  });

  it("refuses two ports of a component with one id, naming both", () => {
    const library = withComponents([
      {
        ...scale!,
        ports: [
          { id: "in", name: "In" },
          { id: "in", name: "Feed" },
        ],
      },
    ]);

    expect(resolving(library)).toThrow(
      "The component `Scale` of library `@hashintel/logistics` has two ports with the id `in`: `In` and `Feed`.",
    );
  });

  it("refuses two parameters of a component with one id", () => {
    const [parameter] = scale!.parameters!;
    const library = withComponents([
      {
        ...scale!,
        parameters: [parameter!, { ...parameter!, name: "Speed" }],
      },
    ]);

    expect(resolving(library)).toThrow(
      "has two parameters with the id `rate`: `Rate` and `Speed`.",
    );
  });

  it.each([
    ["a component", { ...scale, id: undefined }],
    ["a port", { ...scale, ports: [{ name: "In" }] }],
    ["a parameter", { ...scale, parameters: [{ name: "Rate" }] }],
  ])("refuses %s without an id", (_what, component) => {
    expect(resolving({ ...logistics, components: [component] })).toThrow(
      "The library `@hashintel/logistics` is not valid",
    );
  });

  it("refuses a key it does not know, so a misspelt `body` is not read as an interface", () => {
    const library = { ...logistics, components: [{ ...scale, Body: {} }] };

    expect(resolving(library)).toThrow("is not valid");
  });

  it("refuses a port that names no place of the body", () => {
    const library = withComponents([
      { ...belt!, ports: [...belt!.ports, { id: "spill", name: "Spill" }] },
    ]);

    expect(resolving(library)).toThrow(
      "Port `Spill` of the component `Belt` of library `@hashintel/logistics` names the place `spill`, which its body does not have.",
    );
  });

  it("refuses a port under another name than its place", () => {
    const library = withComponents([
      { ...belt!, ports: [{ id: "in", name: "Feed" }, belt!.ports[1]!] },
    ]);

    expect(resolving(library)).toThrow(
      "names a place of its body that is called `In`",
    );
  });

  it("refuses a port that declares another token type than its place holds", () => {
    const library = withComponents([
      {
        ...belt!,
        ports: [
          {
            id: "in",
            name: "In",
            tokenType: { name: "Parcel", displayColor: "#000", elements: [] },
          },
          belt!.ports[1]!,
        ],
      },
    ]);

    expect(resolving(library)).toThrow("declares another token type");
  });

  it("refuses one token type name declared in two ways", () => {
    const library = withComponents([
      {
        ...scale!,
        ports: [
          {
            id: "in",
            name: "In",
            tokenType: { name: "Parcel", displayColor: "#000", elements: [] },
          },
          {
            id: "out",
            name: "Out",
            tokenType: {
              name: "Parcel",
              displayColor: "#000",
              elements: [{ name: "weight", type: "real" }],
            },
          },
        ],
      },
    ]);

    expect(resolving(library)).toThrow(
      "declares the token type `Parcel` in two ways",
    );
  });

  it("holds a component to what a document accepts of a subnet", () => {
    const library = withComponents([
      { ...scale!, iconSvg: "<svg><script>alert(1)</script></svg>" },
    ]);

    expect(resolving(library)).toThrow(
      "The component `Scale` of library `@hashintel/logistics` is not valid: iconSvg: An icon cannot hold a `script` element",
    );
  });
});
