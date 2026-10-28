/**
 * @layerRoot core.rust
 * @role Rust document transactions and history exposed through the existing TypeScript instance API
 */
import { initializeRust } from "./initialize";
import { createRustInstance } from "./instance";

import type { CreateJsonDocHandleOptions } from "../handle";
import type { Petrinaut } from "../instance";
import type { PetrinautWasmInput } from "./initialize";

export type { PetrinautWasmInput } from "./initialize";

export type CreateRustPetrinautOptions = CreateJsonDocHandleOptions & {
  readonly?: boolean;
  /** Explicit bytes or URL string for Node, tests, or hosts serving their own Wasm asset. */
  wasm?: PetrinautWasmInput;
};

/** Loads Wasm once. Instances remain synchronous after this startup step. */
export const initializePetrinautRust = async (
  input?: PetrinautWasmInput,
): Promise<void> => {
  await initializeRust(input);
};

/** Creates a local Rust-backed instance compatible with PetrinautProvider and Petrinaut. */
export const createRustPetrinaut = async (
  options: CreateRustPetrinautOptions,
): Promise<Petrinaut> => {
  await initializePetrinautRust(options.wasm);
  return createRustInstance(options);
};
