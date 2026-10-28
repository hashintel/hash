import { initializeRust } from "../../src/rust/initialize";
import { createWasmSimulation } from "../../src/wasm/simulator";

/** @type {{ readonly buffer: ArrayBuffer } | undefined} */
let memory;

/** @param {Uint8Array<ArrayBuffer>} bytes */
export const initialize = async (bytes) => {
  memory = (await initializeRust(bytes)).memory;
};

export const memoryBytes = () => memory?.buffer.byteLength ?? 0;
export const create = createWasmSimulation;
