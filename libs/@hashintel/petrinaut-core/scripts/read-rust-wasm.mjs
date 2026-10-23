import { readFile } from "node:fs/promises";

export const readRustWasm = async () =>
  new Uint8Array(
    await readFile(
      new URL("../rust/pkg/petrinaut_core_bg.wasm", import.meta.url),
    ),
  );
