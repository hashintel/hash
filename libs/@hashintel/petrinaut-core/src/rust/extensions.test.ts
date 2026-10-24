import { beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { PETRINAUT_EXTENSION_NAMES } from "../extensions";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut, type Petrinaut } from "../instance";
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
  "matches native place edits and transition templates under policy %i",
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
        (instance) => instance.mutations.removePlace({ placeId: "output" }),
      ];
      for (const step of steps) {
        step(rust);
        step(reference);
        expect(rust.handle.doc()).toEqual(reference.handle.doc());
      }
      for (const instance of [rust, reference]) {
        instance.handle.history?.undo();
      }
      expect(rust.handle.doc()).toEqual(reference.handle.doc());
      for (const instance of [rust, reference]) {
        instance.handle.history?.redo();
      }
      expect(rust.handle.doc()).toEqual(reference.handle.doc());
      expect(draft).not.toHaveBeenCalled();
    } finally {
      rust.dispose();
      reference.dispose();
    }
  },
);
