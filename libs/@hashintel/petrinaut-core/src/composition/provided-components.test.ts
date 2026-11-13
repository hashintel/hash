import { describe, expect, it } from "vitest";

import { isPetrinautId } from "../petrinaut-id";
import { subnetSchema } from "../schemas/entity-schemas";
import { colorsStructurallyEqual } from "./check-fusions";
import { checkInterfaces } from "./check-interfaces";
import { isInterface, resolveImplementation } from "./interfaces";
import {
  ensureProvidedComponent,
  instantiableSubnets,
  noProvidedInterfaces,
  providedComponentSubnetId,
  resolveProvidedComponents,
  runsAtHost,
  toInterface,
  type ProvidedComponent,
  type ProvidedTokenType,
} from "./provided-components";

import type { SDCPN } from "../types/sdcpn";

const order: ProvidedTokenType = {
  name: "Order",
  displayColor: "#2563eb",
  elements: [
    { name: "weight", type: "real" },
    { name: "express", type: "boolean" },
  ],
};

const packer: ProvidedComponent = {
  id: "warehouse/packer",
  name: "Packer",
  description: "Packs an order into a parcel.",
  displayColor: "#0f766e",
  ports: [
    { name: "Orders", direction: "in", tokenType: order },
    { name: "Rush", direction: "in", tokenType: order },
    { name: "Parcels", direction: "out" },
  ],
  parameters: [
    {
      name: "Packing rate",
      variableName: "packing_rate",
      type: "real",
      defaultValue: "2",
    },
  ],
};

const sorter: ProvidedComponent = {
  id: "warehouse/sorter",
  name: "Sorter",
  ports: [
    { name: "Orders", direction: "out", tokenType: order },
    { name: "Parcels", direction: "in" },
  ],
};

const emptyDocument = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
});

describe("toInterface", () => {
  it("gives an interface the document accepts, with nothing behind its ports", () => {
    const subnet = toInterface(packer);

    expect(subnetSchema.parse(subnet)).toEqual(subnet);
    expect(isInterface(subnet)).toBe(true);
    expect(subnet.transitions).toEqual([]);
    expect(subnet.componentInstances).toBeUndefined();
    expect(checkInterfaces({ ...emptyDocument(), subnets: [subnet] })).toEqual(
      [],
    );
  });

  it("carries the name, description, colour and parameters over", () => {
    const subnet = toInterface(packer);

    expect(subnet).toMatchObject({
      name: "Packer",
      description: "Packs an order into a parcel.",
      displayColor: "#0f766e",
    });
    expect(subnet.parameters).toEqual([
      {
        id: expect.any(String) as string,
        name: "Packing rate",
        variableName: "packing_rate",
        type: "real",
        defaultValue: "2",
      },
    ]);
  });

  it("makes each port a port place with its direction", () => {
    const { places } = toInterface(packer);

    expect(
      places.map(({ name, isPort, portDirection }) => ({
        name,
        isPort,
        portDirection,
      })),
    ).toEqual([
      { name: "Orders", isPort: true, portDirection: "in" },
      { name: "Rush", isPort: true, portDirection: "in" },
      { name: "Parcels", isPort: true, portDirection: "out" },
    ]);
  });

  it("declares a token type once for the ports that share it", () => {
    const { places, types } = toInterface(packer);

    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({ name: "Order", displayColor: "#2563eb" });
    expect(places.map(({ colorId }) => colorId)).toEqual([
      types[0]!.id,
      types[0]!.id,
      null,
    ]);
  });

  it("gives the same ids every time, all of them Petrinaut ids", () => {
    const subnet = toInterface(packer);

    expect(toInterface(packer)).toEqual(subnet);
    expect(subnet.id).toBe(providedComponentSubnetId(packer));
    for (const id of [
      subnet.id,
      ...subnet.places.map((place) => place.id),
      ...subnet.types.map((type) => type.id),
      ...subnet.types.flatMap((type) =>
        type.elements.map((element) => element.elementId),
      ),
      ...subnet.parameters.map((parameter) => parameter.id),
    ]) {
      expect(isPetrinautId(id)).toBe(true);
    }
  });

  it("keeps two components apart when they name a port or a type alike", () => {
    const first = toInterface(packer);
    const second = toInterface(sorter);

    const ids = [first, second].flatMap((subnet) => [
      ...subnet.places.map((place) => place.id),
      ...subnet.types.map((type) => type.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    // The two `Order` types are still one type to a fusion.
    expect(colorsStructurallyEqual(first.types[0], second.types[0])).toBe(true);
  });
});

describe("resolveProvidedComponents", () => {
  it("gives each component's interface under its id in a document", () => {
    const provided = resolveProvidedComponents([packer, sorter]);

    expect([...provided.keys()]).toEqual([
      providedComponentSubnetId(packer),
      providedComponentSubnetId(sorter),
    ]);
    expect(provided.get(providedComponentSubnetId(sorter))).toEqual(
      toInterface(sorter),
    );
  });

  it("refuses a port whose name is not a place name", () => {
    expect(() =>
      resolveProvidedComponents([
        { ...sorter, ports: [{ name: "orders in", direction: "in" }] },
      ]),
    ).toThrow(/PascalCase/);
  });

  it("refuses two components under one id", () => {
    expect(() =>
      resolveProvidedComponents([packer, { ...sorter, id: packer.id }]),
    ).toThrow(/share the id/);
  });

  it("refuses two items of one kind that would share an id", () => {
    const refused = (component: ProvidedComponent) =>
      expect(() => resolveProvidedComponents([component]));

    refused({
      ...sorter,
      ports: [
        { name: "Orders", direction: "in" },
        { name: "Orders", direction: "out" },
      ],
    }).toThrow("has two ports named `Orders`");
    refused({
      ...packer,
      parameters: [packer.parameters![0]!, packer.parameters![0]!],
    }).toThrow("has two parameters named `packing_rate`");
    refused({
      ...sorter,
      ports: [
        {
          name: "Orders",
          direction: "in",
          tokenType: {
            ...order,
            elements: [
              { name: "weight", type: "real" },
              { name: "weight", type: "integer" },
            ],
          },
        },
      ],
    }).toThrow("has two elements of `Order` named `weight`");
  });

  it("refuses one token type name declared in two ways", () => {
    expect(() =>
      resolveProvidedComponents([
        {
          ...sorter,
          ports: [
            { name: "Orders", direction: "out", tokenType: order },
            {
              name: "Returns",
              direction: "in",
              tokenType: { ...order, elements: [] },
            },
          ],
        },
      ]),
    ).toThrow("declares the token type `Order` in two ways");
  });

  it("takes one token type written twice, whatever the order of its keys", () => {
    const [first] = order.elements;
    const rewritten = {
      elements: order.elements.map(({ name, type }) => ({ type, name })),
      displayColor: order.displayColor,
      name: order.name,
    };

    expect(first).toBeDefined();
    expect(() =>
      resolveProvidedComponents([
        {
          ...sorter,
          ports: [
            { name: "Orders", direction: "out", tokenType: order },
            { name: "Returns", direction: "in", tokenType: rewritten },
          ],
        },
      ]),
    ).not.toThrow();
  });
});

describe("instantiableSubnets", () => {
  it("lists the document's subnets, then the provided interfaces it has no copy of", () => {
    const held = { ...toInterface(packer), name: "Packer as saved" };
    const provided = resolveProvidedComponents([packer, sorter]);

    expect(
      instantiableSubnets({ subnets: [held] }, provided).map(
        ({ name }) => name,
      ),
    ).toEqual(["Packer as saved", "Sorter"]);
  });
});

describe("runsAtHost", () => {
  const provided = resolveProvidedComponents([packer]);
  const sdcpn: SDCPN = { ...emptyDocument(), subnets: [toInterface(packer)] };
  const instance = { subnetId: providedComponentSubnetId(packer) };

  it("is true of an instance of a provided interface with nothing bound", () => {
    expect(runsAtHost(resolveImplementation(sdcpn, instance), provided)).toBe(
      true,
    );
  });

  it("is false without the host, and for an instance that names an implementation", () => {
    expect(
      runsAtHost(resolveImplementation(sdcpn, instance), noProvidedInterfaces),
    ).toBe(false);
    expect(
      runsAtHost(
        resolveImplementation(sdcpn, { ...instance, implementation: "gone" }),
        provided,
      ),
    ).toBe(false);
  });
});

describe("ensureProvidedComponent", () => {
  it("copies the interface into a document that lacks it", () => {
    const document = emptyDocument();

    const provided = resolveProvidedComponents([packer, sorter]);

    ensureProvidedComponent(
      document,
      provided,
      providedComponentSubnetId(packer),
    );

    expect(document.subnets).toEqual([toInterface(packer)]);
    // The document's copy is its own.
    expect(document.subnets?.[0]).not.toBe(
      provided.get(providedComponentSubnetId(packer)),
    );
  });

  it("leaves the copy a document already holds", () => {
    const held = { ...toInterface(packer), name: "Packer as saved" };
    const document: SDCPN = { ...emptyDocument(), subnets: [held] };

    ensureProvidedComponent(
      document,
      resolveProvidedComponents([packer]),
      held.id,
    );

    expect(document.subnets).toEqual([held]);
  });

  it("does nothing for an id no provided component has", () => {
    const document = emptyDocument();

    ensureProvidedComponent(
      document,
      resolveProvidedComponents([packer]),
      providedComponentSubnetId(sorter),
    );

    expect(document.subnets).toBeUndefined();
  });
});
