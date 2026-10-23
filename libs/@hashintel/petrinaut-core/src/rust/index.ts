/**
 * @layerRoot core.rust
 * @role Rust document transactions and history exposed through the existing TypeScript instance API
 */
import init from "../../rust/pkg/petrinaut_core.js";
import { mutationActionInputSchemas } from "../action-schemas";
import { createPetrinaut, type Petrinaut } from "../instance";
import { createRustDocHandle } from "./rust-doc-handle";

import type { CreateJsonDocHandleOptions } from "../handle";

export type CreateRustPetrinautOptions = CreateJsonDocHandleOptions & {
  readonly?: boolean;
  /** Explicit bytes or URL string for Node, tests, or hosts serving their own Wasm asset. */
  wasm?: PetrinautWasmInput;
};

/** Portable startup input shared by browser and Node hosts. */
export type PetrinautWasmInput = string | ArrayBuffer | Uint8Array<ArrayBuffer>;

// wasm-bindgen also accepts DOM objects; keep the public core types independent of lib.dom.
const initializeWasm = init as (input?: {
  module_or_path: PetrinautWasmInput;
}) => Promise<unknown>;

let initialization: Promise<unknown> | undefined;

/** Loads Wasm once. Instances remain synchronous after this startup step. */
export const initializePetrinautRust = async (
  input?: PetrinautWasmInput,
): Promise<void> => {
  initialization ??= initializeWasm(
    input === undefined ? undefined : { module_or_path: input },
  ).catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
};

/** Creates a local Rust-backed instance compatible with PetrinautProvider and Petrinaut. */
export const createRustPetrinaut = async (
  options: CreateRustPetrinautOptions,
): Promise<Petrinaut> => {
  await initializePetrinautRust(options.wasm);
  const handle = createRustDocHandle({
    ...options,
    capabilities: {
      ...options.capabilities,
      readonly: options.readonly || options.capabilities?.readonly,
    },
  });
  const instance = createPetrinaut({ document: handle });
  return {
    ...instance,
    mutations: {
      ...instance.mutations,
      commitNodePositions(input) {
        handle.commitNodePositions(
          mutationActionInputSchemas.commitNodePositions.parse(input),
        );
      },
      updatePlacePosition(input) {
        const { placeId, position, targetSubnetId } =
          mutationActionInputSchemas.updatePlacePosition.parse(input);
        handle.commitNodePositions({
          targetSubnetId,
          commits: [{ id: placeId, itemType: "place", position }],
        });
      },
      updateTransitionPosition(input) {
        const { transitionId, position, targetSubnetId } =
          mutationActionInputSchemas.updateTransitionPosition.parse(input);
        handle.commitNodePositions({
          targetSubnetId,
          commits: [{ id: transitionId, itemType: "transition", position }],
        });
      },
      updateComponentInstancePosition(input) {
        const { instanceId, position, targetSubnetId } =
          mutationActionInputSchemas.updateComponentInstancePosition.parse(
            input,
          );
        handle.commitNodePositions({
          targetSubnetId,
          commits: [
            { id: instanceId, itemType: "componentInstance", position },
          ],
        });
      },
    },
    dispose() {
      instance.dispose();
      handle.dispose();
    },
  };
};
