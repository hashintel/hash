---
layer: core.rust.engine
role: Native and WebAssembly document state, patch generation, history, extension policies and native place, transition and arc commands
---

The `petrinaut-core` crate owns local document transactions. `PetrinautInstance`
accepts normalized JSON, produces patches, keeps bounded undo/redo history, and
executes typed commands. Extension policies apply inside Rust on initialization and every commit, including compatibility drafts. `RustDocument` exposes these operations through
wasm-bindgen. The TypeScript adapter validates domain inputs and publishes stores.

Place, transition and arc commands validate their entity fields and references
inside Rust. Their inputs use the same identifiers as the normalized document.
The TypeScript adapter still normalizes IDs and applies public input schemas.
Other mutation families use full-document compatibility commits. Simulation and
collaboration remain outside this crate's current scope.
