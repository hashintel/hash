import { beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { PETRINAUT_EXTENSION_NAMES } from "../extensions";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut, type Petrinaut } from "../instance";
import { isSDCPNEqual } from "../lib/deep-equal";
import { createRustPetrinaut, initializePetrinautRust } from "./index";
import { createRustDocHandle } from "./rust-doc-handle";

import type { SDCPN } from "../types/sdcpn";

beforeAll(async () => {
  await initializePetrinautRust(await readRustWasm());
});

test.each(Array.from({ length: 32 }, (_, mask) => mask))(
  "applies extension policy %i to imported state, compatibility drafts and undo",
  (mask) => {
    const options = {
      initial: probabilisticSatellitesSDCPN.petriNetDefinition,
      capabilities: {
        disabledExtensions: PETRINAUT_EXTENSION_NAMES.filter(
          (_, index) => Math.floor(mask / 2 ** index) % 2 !== 0,
        ),
      },
    };
    const rust = createRustDocHandle(options);
    const reference = createJsonDocHandle(options);
    try {
      expect(rust.doc()).toEqual(reference.doc());
      for (const handle of [rust, reference]) {
        handle.change((draft) => {
          Object.assign(
            draft,
            JSON.parse(JSON.stringify(options.initial)) as SDCPN,
          );
          draft.description = "Updated model";
        });
      }
      expect(rust.doc()).toEqual(reference.doc());
      for (const handle of [rust, reference]) {
        handle.history?.undo();
      }
      expect(rust.doc()).toEqual(reference.doc());
      for (const handle of [rust, reference]) {
        handle.history?.redo();
      }
      expect(rust.doc()).toEqual(reference.doc());
    } finally {
      rust.dispose();
    }
  },
);

test.each(Array.from({ length: 32 }, (_, mask) => mask))(
  "matches native entity edits and transition templates under policy %i",
  async (mask) => {
    const options = {
      initial: {
        places: [
          { id: "input", name: "Input", x: 0, y: 0 },
          { id: "output", name: "Output", x: 0, y: 0 },
        ],
        transitions: [
          {
            id: "move",
            name: "Move",
            x: 0,
            y: 0,
            lambdaCode: "return true;",
            inputArcs: [{ placeId: "input", type: "read" as const, weight: 1 }],
            outputArcs: [{ placeId: "output", weight: 2 }],
          },
        ],
        types: [
          {
            id: "color",
            name: "Token",
            iconSlug: "circle",
            displayColor: "#000000",
            elements: [
              { elementId: "real", name: "value", type: "real" as const },
              { elementId: "bool", name: "enabled", type: "boolean" as const },
              { elementId: "uuid", name: "key", type: "uuid" as const },
              { elementId: "str", name: "label", type: "string" as const },
            ],
          },
        ],
      },
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
    const draft = vi.spyOn(rust.handle, "change");
    try {
      const steps: ((instance: Petrinaut) => void)[] = [
        (instance) =>
          instance.mutations.updatePlace({
            placeId: "output",
            update: { colorId: "color" },
          }),
        (instance) =>
          instance.mutations.updatePlace({
            placeId: "input",
            update: { colorId: "color" },
          }),
        (instance) =>
          instance.mutations.addPlace({
            id: "new",
            name: "New",
            colorId: "color",
            dynamicsEnabled: false,
            differentialEquationId: null,
            capacity: null,
            x: 12,
            y: 24,
          }),
        (instance) =>
          instance.mutations.addTransition({
            id: "edited",
            name: "Edited transition",
            inputArcs: [],
            outputArcs: [],
            lambdaType: "predicate",
            lambdaCode: "return true;",
            transitionKernelCode: "",
            x: 0,
            y: 0,
          }),
        (instance) =>
          instance.mutations.addArc({
            transitionId: "edited",
            arcDirection: "output",
            placeId: "output",
            weight: 2,
          }),
        (instance) =>
          instance.mutations.addArc({
            transitionId: "edited",
            arcDirection: "output",
            endpoint: { kind: "place", placeId: "output" },
            weight: 3,
          }),
        (instance) =>
          instance.mutations.addArc({
            transitionId: "edited",
            arcDirection: "input",
            placeId: "input",
            weight: 1,
            type: "read",
          }),
        (instance) =>
          instance.mutations.updateTransition({
            transitionId: "edited",
            update: {
              name: "Updated transition",
              lambdaCode: "return true;",
              transitionKernelCode: "return { custom: [] };",
            },
          }),
        (instance) =>
          instance.mutations.updateArcWeight({
            transitionId: "edited",
            arcDirection: "input",
            placeId: "input",
            weight: 2.5,
          }),
        (instance) =>
          instance.mutations.updateArcType({
            transitionId: "edited",
            placeId: "input",
            type: "inhibitor",
          }),
        (instance) =>
          instance.mutations.updateArcPlace({
            transitionId: "edited",
            arcDirection: "output",
            oldPlaceId: "output",
            newPlaceId: "new",
          }),
        (instance) =>
          instance.mutations.updateTransition({
            transitionId: "edited",
            update: { transitionKernelCode: "" },
          }),
        (instance) =>
          instance.mutations.updateArcType({
            transitionId: "edited",
            placeId: "input",
            type: "read",
          }),
        (instance) =>
          instance.mutations.removeArc({
            transitionId: "edited",
            arcDirection: "input",
            endpoint: { kind: "place", placeId: "input" },
          }),
        (instance) =>
          instance.mutations.removeArc({
            transitionId: "edited",
            arcDirection: "output",
            placeId: "new",
          }),
        (instance) =>
          instance.mutations.removeTransition({ transitionId: "edited" }),
        (instance) => instance.mutations.removePlace({ placeId: "output" }),
      ];
      for (const step of steps) {
        step(rust);
        step(reference);
        expect(rust.handle.doc()).toEqual(reference.handle.doc());
      }
      const historyStates = (
        instance: Petrinaut,
        direction: "undo" | "redo",
      ): SDCPN[] => {
        const states = [instance.handle.doc()!];
        while (instance.handle.history?.[direction]()) {
          const next = instance.handle.doc()!;
          // TypeScript can record equal arc arrays when subnets are disabled; Rust omits these no-ops.
          if (!isSDCPNEqual(states.at(-1)!, next)) {
            states.push(next);
          }
        }
        return states;
      };
      const index = rust.handle.history?.currentIndex.get();
      const undo = historyStates(rust, "undo");
      expect(undo).toHaveLength(index! + 1);
      expect(undo).toEqual(historyStates(reference, "undo"));
      expect(historyStates(rust, "redo")).toEqual(
        historyStates(reference, "redo"),
      );
      expect(draft).not.toHaveBeenCalled();
    } finally {
      rust.dispose();
      reference.dispose();
    }
  },
);
