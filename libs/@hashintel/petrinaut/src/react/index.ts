// Public surface for `@hashintel/petrinaut/react` — React bindings.
//
// Hooks, contexts, and bridge providers that synchronize a Core instance with
// React. No visual widgets — `/ui` builds on top of this.

// --- Instance access + low-level adapters ---
export { PetrinautInstanceContext } from "./instance-context";
export { usePetrinautInstance } from "./use-petrinaut-instance";
export { useStore, useStoreSelector } from "./use-store";

// --- Public hook surface ---
export * from "./hooks";

// --- Re-export Core types for convenience ---
export type {
  CreatePetrinautConfig,
  EventStream,
  Petrinaut,
  PetrinautDocHandle,
  ReadableStore,
} from "../core";
