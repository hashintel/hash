---
layer: core.rust.engine
role: Native and WebAssembly document state, patch generation, history, extension policies and typed commands
---

The `petrinaut-core` crate owns local document transactions. `PetrinautInstance`
accepts normalized JSON, produces patches, keeps bounded undo/redo history, and
executes typed commands. Extension policies apply inside Rust on initialization and every commit, including compatibility drafts. `RustDocument` exposes these operations through
wasm-bindgen. The TypeScript adapter validates domain inputs and publishes stores.
