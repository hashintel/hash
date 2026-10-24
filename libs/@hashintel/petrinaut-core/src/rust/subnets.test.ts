import { beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { PETRINAUT_EXTENSION_NAMES } from "../extensions";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut, type Petrinaut } from "../instance";
import { toPetrinautId } from "../petrinaut-id";
import { createRustPetrinaut, initializePetrinautRust } from "./index";

import type { MutationActionInput } from "../action-schemas";

beforeAll(async () => {
  await initializePetrinautRust(await readRustWasm());
});

const subnet: MutationActionInput<"addSubnet"> = {
  id: "subnet",
  name: "Reusable subnet",
  places: [
    {
      id: "port",
      name: "Port",
      isPort: true,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const component: MutationActionInput<"addComponentInstance"> = {
  id: "component",
  name: "Component",
  subnetId: "subnet",
  parameterValues: {},
  x: 0,
  y: 0,
};

const transition: MutationActionInput<"addTransition"> = {
  id: "transition",
  name: "Transition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
};

test.each(Array.from({ length: 32 }, (_, mask) => mask))(
  "subnet editing and cascades match under extension policy %i",
  async (mask) => {
    const options = {
      initial: { places: [], transitions: [] },
      capabilities: {
        disabledExtensions: PETRINAUT_EXTENSION_NAMES.filter(
          (_, index) => Math.floor(mask / 2 ** index) % 2 !== 0,
        ),
      },
    };
    const rust = await createRustPetrinaut(options);
    const reference = createPetrinaut({
      document: createJsonDocHandle(options),
    });
    const compatibility = vi.spyOn(rust.handle, "change");
    const step = (action: (instance: Petrinaut) => void) => {
      action(rust);
      action(reference);
      expect(rust.definition.get()).toEqual(reference.definition.get());
    };
    try {
      step((instance) => instance.mutations.addSubnet(subnet));
      step((instance) =>
        instance.mutations.updateSubnet({
          subnetId: "subnet",
          update: { name: "Renamed", metadata: { id: "opaque" } },
        }),
      );
      if (rust.definition.get().subnets?.length) {
        step((instance) =>
          instance.mutations.addSubnet({ ...subnet, id: "outer", places: [] }),
        );
        step((instance) => instance.mutations.addComponentInstance(component));
        step((instance) =>
          instance.mutations.addComponentInstance({
            ...component,
            id: "nested",
            targetSubnetId: "outer",
          }),
        );
        step((instance) =>
          instance.mutations.updateComponentInstance({
            instanceId: "component",
            update: { name: "ChangedComponent", description: "Description" },
          }),
        );
        for (const instance of [rust, reference]) {
          const before = instance.definition.get();
          expect(() =>
            instance.mutations.updateComponentInstance({
              instanceId: "component",
              update: { subnetId: "missing" },
            }),
          ).toThrow(/does not exist/);
          expect(() =>
            instance.mutations.updateComponentInstance({
              instanceId: "component",
              update: { parameterValues: { unknown: "2" } },
            }),
          ).toThrow(/unknown subnet parameter/);
          expect(instance.definition.get()).toEqual(before);
        }
        step((instance) => instance.mutations.addTransition(transition));
        step((instance) =>
          instance.mutations.addTransition({
            ...transition,
            id: "nested-transition",
            targetSubnetId: "outer",
          }),
        );
        step((instance) =>
          instance.mutations.addArc({
            transitionId: "transition",
            arcDirection: "input",
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "component",
              portPlaceId: "port",
            },
            weight: 1,
            type: "standard",
          }),
        );
        step((instance) =>
          instance.mutations.addArc({
            targetSubnetId: "outer",
            transitionId: "nested-transition",
            arcDirection: "output",
            endpoint: {
              kind: "componentPort",
              componentInstanceId: "nested",
              portPlaceId: "port",
            },
            weight: 1,
          }),
        );
        const before = rust.definition.get();
        const index = rust.handle.history!.currentIndex.get();
        step((instance) =>
          instance.mutations.deleteItemsByIds({
            targetSubnetId: "subnet",
            items: [{ type: "place", id: "port" }],
          }),
        );
        expect(rust.definition.get().transitions[0]!.inputArcs).toEqual([]);
        expect(
          rust.definition.get().subnets![1]!.transitions[0]!.outputArcs,
        ).toEqual([]);
        expect(rust.handle.history!.currentIndex.get()).toBe(index + 1);
        step((instance) => {
          instance.handle.history!.undo();
        });
        expect(rust.definition.get()).toEqual(before);
        step((instance) => {
          instance.handle.history!.redo();
        });
        step((instance) => {
          instance.handle.history!.undo();
        });
        step((instance) =>
          instance.mutations.removeComponentInstance({
            instanceId: "component",
          }),
        );
        expect(rust.definition.get().transitions[0]!.inputArcs).toEqual([]);
        step((instance) => {
          instance.handle.history!.undo();
        });
        step((instance) =>
          instance.mutations.removeSubnet({ subnetId: "subnet" }),
        );
        expect(rust.definition.get().componentInstances).toEqual([]);
        expect(rust.definition.get().subnets![0]!.componentInstances).toEqual(
          [],
        );
        expect(
          rust.definition.get().subnets![0]!.transitions[0]!.outputArcs,
        ).toEqual([]);
        step((instance) => {
          instance.handle.history!.undo();
        });
        expect(rust.definition.get()).toEqual(before);
        step((instance) =>
          instance.mutations.deleteItemsByIds({
            items: [
              {
                type: "arc",
                id: "$A_componentPort:component:port___transition",
              },
            ],
          }),
        );
        expect(rust.definition.get().transitions[0]!.inputArcs).toEqual([]);
        step((instance) =>
          instance.mutations.deleteItemsByIds({
            items: [
              { type: "componentInstance", id: "component" },
              { type: "transition", id: "transition" },
            ],
          }),
        );
        expect(rust.definition.get().transitions).toEqual([]);
        expect(rust.definition.get().subnets![1]!.id).toBe(
          toPetrinautId("outer"),
        );
      }
      step((instance) =>
        instance.mutations.removeSubnet({ subnetId: "subnet" }),
      );
      expect(compatibility).not.toHaveBeenCalled();
    } finally {
      rust.dispose();
      reference.dispose();
    }
  },
);
