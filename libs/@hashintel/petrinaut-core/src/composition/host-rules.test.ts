import { describe, expect, it } from "vitest";

import { createJsonDocHandle } from "../handle/json-doc-handle";
import { createPetrinaut } from "../instance";
import { toPetrinautId } from "../petrinaut-id";
import {
  providedComponentSubnetId,
  type ProvidedComponent,
} from "./provided-components";

import type { SDCPN } from "../types/sdcpn";

const packer: ProvidedComponent = {
  id: "warehouse/packer",
  name: "Packer",
  ports: [
    { name: "Orders", direction: "in" },
    { name: "Parcels", direction: "out" },
  ],
};
const packerId = providedComponentSubnetId(packer);
const portId = (name: string) => toPetrinautId(`${packer.id}/port/${name}`);

const instanceOf = (id: string, subnetId: string) => ({
  id,
  name: id === "a" ? "PackerA" : "PackerB",
  subnetId,
  parameterValues: {},
  x: 0,
  y: 0,
});

/** A document with a place, and a subnet of its own beside the host's components. */
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

const compose = () =>
  createPetrinaut({
    document: createJsonDocHandle({ initial: initial() }),
    components: [packer],
    compositionOnly: true,
  });

const onlyComposes =
  "This editor only places and connects the components it is given.";

describe("an instance that only composes", () => {
  it("places, wires, arranges and removes instances of what the host provides", () => {
    const { mutations, definition } = compose();

    mutations.addComponentInstance(instanceOf("a", packerId));
    mutations.addComponentInstance(instanceOf("b", packerId));
    mutations.addFusion({
      id: "belt",
      members: [
        {
          kind: "componentPort",
          componentInstanceId: "a",
          portPlaceId: portId("Parcels"),
        },
        {
          kind: "componentPort",
          componentInstanceId: "b",
          portPlaceId: portId("Orders"),
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

  it("refuses an instance of anything the host does not provide", () => {
    const { mutations } = compose();
    mutations.addComponentInstance(instanceOf("a", packerId));

    expect(() =>
      mutations.addComponentInstance(instanceOf("b", "own")),
    ).toThrow(onlyComposes);
    expect(() =>
      mutations.updateComponentInstance({
        instanceId: "a",
        update: { subnetId: "own" },
      }),
    ).toThrow(onlyComposes);
  });

  it("composes the root net alone", () => {
    const { mutations, definition } = compose();

    expect(() =>
      mutations.addComponentInstance({
        ...instanceOf("a", packerId),
        targetSubnetId: "own",
      }),
    ).toThrow(onlyComposes);
    // The host's own interface answers for itself.
    expect(() =>
      mutations.addComponentInstance({
        ...instanceOf("a", packerId),
        targetSubnetId: packerId,
      }),
    ).toThrow("Packer is a component the application provides");
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
      mutationRefusal("addComponentInstance", instanceOf("a", packerId)),
    ).toBeNull();
    expect(
      mutationRefusal("addComponentInstance", instanceOf("a", "own")),
    ).toBe(onlyComposes);
    expect(mutationRefusal("removeFusion", { fusionId: "belt" })).toBeNull();
    expect(mutationRefusal("removeSubnet", { subnetId: "own" })).toBe(
      onlyComposes,
    );
    expect(definition.get().componentInstances).toBeUndefined();
  });
});

describe("an instance without the restriction", () => {
  it("changes anything but the host's interfaces", () => {
    const { mutations, definition, compositionOnly, mutationRefusal } =
      createPetrinaut({
        document: createJsonDocHandle({ initial: initial() }),
        components: [packer],
      });

    mutations.addComponentInstance(instanceOf("b", "own"));

    expect(compositionOnly).toBe(false);
    expect(definition.get().componentInstances).toHaveLength(1);
    expect(mutationRefusal("addPlace", { targetSubnetId: "own" })).toBeNull();
  });
});
