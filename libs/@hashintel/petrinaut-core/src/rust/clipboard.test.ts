import { beforeAll, expect, test, vi } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { PETRINAUT_EXTENSION_NAMES } from "../extensions";
import { createJsonDocHandle } from "../handle";
import { createPetrinaut } from "../instance";
import * as ids from "../petrinaut-id";
import { createRustPetrinaut, initializePetrinautRust } from "./index";

import type { ClipboardPayload } from "../clipboard/types";

beforeAll(async () => {
  await initializePetrinautRust(await readRustWasm());
});

test.each(Array.from({ length: 32 }, (_, mask) => mask))(
  "pasting remaps and deduplicates the same subgraph under extension policy %i",
  async (mask) => {
    const initial = probabilisticSatellitesSDCPN.petriNetDefinition;
    const options = {
      initial,
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
    let sequence = 0;
    const fresh = vi
      .spyOn(ids, "generatePetrinautId")
      .mockImplementation(() => ids.toPetrinautId(`fresh-${sequence++}`));
    const compatibility = vi.spyOn(rust.handle, "change");
    const payload: ClipboardPayload = {
      format: "petrinaut-sdcpn",
      version: 1,
      documentId: null,
      data: initial,
    };
    try {
      for (let pass = 0; pass < 2; pass++) {
        const start = sequence;
        const created = rust.commands.applyClipboardPaste({ payload });
        sequence = start;
        expect(created).toEqual(
          reference.commands.applyClipboardPaste({ payload }),
        );
        expect(rust.definition.get()).toEqual(reference.definition.get());
      }
      for (const direction of ["undo", "undo", "redo", "redo"] as const) {
        rust.handle.history![direction]();
        reference.handle.history![direction]();
        expect(rust.definition.get()).toEqual(reference.definition.get());
      }
      const before = rust.definition.get();
      const history = rust.handle.history!.currentIndex.get();
      const bad = {
        ...payload,
        data: {
          ...payload.data,
          places: [{ ...payload.data.places[0]!, name: "invalid name" }],
        },
      };
      expect(() =>
        rust.commands.applyClipboardPaste({ payload: bad }),
      ).toThrow();
      expect(rust.definition.get()).toEqual(before);
      expect(rust.handle.history!.currentIndex.get()).toBe(history);
      expect(compatibility).not.toHaveBeenCalled();
    } finally {
      fresh.mockRestore();
      rust.dispose();
      reference.dispose();
    }
  },
);
