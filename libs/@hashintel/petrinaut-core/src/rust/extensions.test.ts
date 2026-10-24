import { beforeAll, expect, test } from "vitest";

import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { PETRINAUT_EXTENSION_NAMES } from "../extensions";
import { createJsonDocHandle } from "../handle";
import { initializePetrinautRust } from "./index";
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
