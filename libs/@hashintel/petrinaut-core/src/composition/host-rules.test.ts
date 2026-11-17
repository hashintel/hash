import { describe, expect, it } from "vitest";

import { createJsonDocHandle } from "../handle/json-doc-handle";
import { createPetrinaut } from "../instance";
import { toPetrinautId } from "../petrinaut-id";
import { composesOnly, sameRules } from "./host-rules";

import type { ComponentReference, SDCPN } from "../types/sdcpn";
import type { Library } from "./libraries";

const warehouse: Library = {
  id: "@hashintel/warehouse",
  name: "Warehouse",
  components: [
    {
      id: "packer",
      name: "Packer",
      ports: [
        { id: "orders", name: "Orders", direction: "in" },
        { id: "parcels", name: "Parcels", direction: "out" },
      ],
    },
  ],
};
/** A library the document's host knows and does not offer. */
const depot: Library = { ...warehouse, id: "@hashintel/depot", name: "Depot" };
const packer: ComponentReference = { from: warehouse.id, id: "packer" };
const own: ComponentReference = { id: "own" };
const portId = toPetrinautId;

const instanceOf = (id: string, component: ComponentReference) => ({
  id,
  name: id === "a" ? "PackerA" : "PackerB",
  ...(component.from === undefined
    ? { subnetId: component.id }
    : { component: { from: component.from, id: component.id } }),
  parameterValues: {},
  x: 0,
  y: 0,
});

/** A document with a place, and a subnet of its own beside the libraries' components. */
const initial = (): SDCPN => ({
  places: [
    {
      id: "buffer",
      name: "Buffer",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  subnets: [
    {
      id: "own",
      name: "Own",
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
});

const resolveImport = (id: string) =>
  [warehouse, depot].find((library) => library.id === id);

const compose = (document: SDCPN = initial()) =>
  createPetrinaut({
    document: createJsonDocHandle({ initial: document }),
    resolveImport,
    libraries: [warehouse.id],
    rules: { edit: "compose" },
  });

const onlyComposes =
  "This editor only places and connects the components it is given.";

describe("an instance that only composes", () => {
  it("places, wires, arranges and removes instances of what the host offers", () => {
    const { mutations, definition } = compose();

    mutations.addComponentInstance(instanceOf("a", packer));
    mutations.addComponentInstance(instanceOf("b", packer));
    mutations.addFusion({
      id: "belt",
      members: [
        {
          kind: "componentPort",
          componentInstanceId: "a",
          portPlaceId: portId("parcels"),
        },
        {
          kind: "componentPort",
          componentInstanceId: "b",
          portPlaceId: portId("orders"),
        },
      ],
    });
    mutations.updateComponentInstance({
      instanceId: "a",
      update: { name: "First" },
    });
    mutations.commitNodePositions({
      commits: [
        { id: "a", itemType: "componentInstance", position: { x: 40, y: 0 } },
      ],
    });

    expect(definition.get().componentInstances).toMatchObject([
      { name: "First", x: 40 },
      { name: "PackerB" },
    ]);
    expect(definition.get().fusions).toHaveLength(1);

    mutations.deleteItemsByIds({
      items: [
        { type: "fusion", id: "belt" },
        { type: "componentInstance", id: "b" },
      ],
    });
    expect(definition.get().fusions).toBeUndefined();
    expect(definition.get().componentInstances).toHaveLength(1);
  });

  it("moves what the document already holds, by either position mutation", () => {
    const { mutations, definition } = compose();

    mutations.updatePlacePosition({
      placeId: "buffer",
      position: { x: 10, y: 20 },
    });
    mutations.commitNodePositions({
      commits: [
        { id: "buffer", itemType: "place", position: { x: 30, y: 20 } },
      ],
    });

    expect(definition.get().places[0]).toMatchObject({ x: 30, y: 20 });
  });

  it("refuses what changes a net, naming the mutation", () => {
    const { mutations, definition } = compose();
    const before = definition.get();

    expect(() =>
      mutations.addPlace({
        id: "p",
        name: "Extra",
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      }),
    ).toThrow(`${onlyComposes} Refused: \`addPlace\`.`);
    expect(() => mutations.removeSubnet({ subnetId: "own" })).toThrow(
      onlyComposes,
    );
    expect(() =>
      mutations.deleteItemsByIds({ items: [{ type: "place", id: "buffer" }] }),
    ).toThrow(onlyComposes);
    expect(definition.get()).toBe(before);
  });

  it("refuses an instance of a subnet of the document", () => {
    const { mutations } = compose();
    mutations.addComponentInstance(instanceOf("a", packer));

    expect(() => mutations.addComponentInstance(instanceOf("b", own))).toThrow(
      onlyComposes,
    );
    expect(() =>
      mutations.updateComponentInstance({
        instanceId: "a",
        update: { subnetId: "own" },
      }),
    ).toThrow(onlyComposes);
  });

  it("refuses an instance of a component of a library that is not on offer, though the document imports it", () => {
    const { mutations, mutationRefusal } = compose({
      ...initial(),
      imports: [{ id: depot.id }],
    });
    const fromDepot = instanceOf("a", { from: depot.id, id: "packer" });

    expect(mutationRefusal("addComponentInstance", fromDepot)).toBe(
      onlyComposes,
    );
    expect(() => mutations.addComponentInstance(fromDepot)).toThrow(
      onlyComposes,
    );
  });

  it("composes the root net alone", () => {
    const { mutations, definition } = compose();

    expect(() =>
      mutations.addComponentInstance({
        ...instanceOf("a", packer),
        targetSubnetId: "own",
      }),
    ).toThrow(onlyComposes);
    expect(definition.get().subnets).toHaveLength(1);
  });

  it("leaves a malformed input to the mutation, which says what is wrong", () => {
    const { mutations } = compose();

    expect(() => mutations.deleteItemsByIds({} as never)).toThrow(/items/);
    expect(() => mutations.addComponentInstance(undefined as never)).toThrow();
    expect(() =>
      mutations.addComponentInstance(undefined as never),
    ).not.toThrow(TypeError);
  });

  it("refuses a paste", () => {
    expect(() =>
      compose().commands.applyClipboardPaste({ payload: {} as never }),
    ).toThrow("nothing can be pasted into it");
  });

  it("lays out the root net, and no subnet the document holds", async () => {
    const { commands, commandRefusal } = compose();

    expect(() => commands.applyAutoLayout({ targetSubnetId: "own" })).toThrow(
      "only places and connects the components it is given",
    );
    expect(commandRefusal("applyAutoLayout", {})).toBeNull();
    await expect(commands.applyAutoLayout()).resolves.toBeDefined();
  });

  it("answers for one mutation without running it", () => {
    const { mutationRefusal, definition } = compose();

    expect(
      mutationRefusal("addComponentInstance", instanceOf("a", packer)),
    ).toBeNull();
    expect(mutationRefusal("addComponentInstance", instanceOf("a", own))).toBe(
      onlyComposes,
    );
    expect(mutationRefusal("removeFusion", { fusionId: "belt" })).toBeNull();
    expect(mutationRefusal("removeSubnet", { subnetId: "own" })).toBe(
      onlyComposes,
    );
    expect(definition.get().componentInstances).toBeUndefined();
  });
});

describe("an instance the rules leave to edit everything", () => {
  it.each([
    ["no rules", undefined],
    ["rules that name none", {}],
    ['`edit: "all"`', { edit: "all" }],
  ] as const)("changes anything, with %s", (_label, given) => {
    const { mutations, definition, rules, mutationRefusal, commandRefusal } =
      createPetrinaut({
        document: createJsonDocHandle({ initial: initial() }),
        resolveImport,
        libraries: [warehouse.id],
        rules: given,
      });

    mutations.addComponentInstance(instanceOf("b", own));

    expect(composesOnly(rules)).toBe(false);
    expect(definition.get().componentInstances).toHaveLength(1);
    expect(mutationRefusal("addPlace", { targetSubnetId: "own" })).toBeNull();
    expect(commandRefusal("applyClipboardPaste", {})).toBeNull();
  });
});

describe("the rules", () => {
  it("say whether they keep an instance to composing", () => {
    expect(composesOnly(compose().rules)).toBe(true);
    expect(composesOnly({ edit: "all" })).toBe(false);
    expect(composesOnly({})).toBe(false);
  });

  it("are the same when they say the same, in whatever object", () => {
    expect(sameRules({ edit: "compose" }, { edit: "compose" })).toBe(true);
    expect(sameRules({}, { edit: "all" })).toBe(true);
    expect(sameRules({ edit: "compose" }, {})).toBe(false);
  });
});
