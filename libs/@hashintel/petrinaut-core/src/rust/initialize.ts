import init from "../../rust/pkg/petrinaut_core.js";

import type { InitOutput } from "../../rust/pkg/petrinaut_core.js";

export type PetrinautWasmInput = string | ArrayBuffer | Uint8Array<ArrayBuffer>;

const initializeWasm = init as (input?: {
  module_or_path: PetrinautWasmInput;
}) => Promise<InitOutput>;

let initialization: Promise<InitOutput> | undefined;

export const initializeRust = (
  input?: PetrinautWasmInput,
): Promise<InitOutput> => {
  initialization ??= initializeWasm(
    input === undefined ? undefined : { module_or_path: input },
  ).catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
};
