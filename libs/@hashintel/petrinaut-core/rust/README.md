---
layer: core.rust.engine
role: Native and WebAssembly document state, patch generation, history and node-position transactions
---

The `petrinaut-core` crate owns local document transactions. `PetrinautInstance`
accepts normalized JSON, produces patches, keeps bounded undo/redo history, and
executes node-position commands. `RustDocument` exposes these operations through
wasm-bindgen. The TypeScript adapter validates domain inputs and publishes stores.
