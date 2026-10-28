---
layer: core.rust.engine
role: Native and WebAssembly document state, patch generation, history, extension policies and native document editing commands
---

The `petrinaut-core` crate owns local document transactions. `PetrinautInstance`
normalizes authoring JSON and owns a typed SDCPN model, produces patches, keeps bounded undo/redo history, and
executes typed commands. Extension policies apply inside Rust on initialization and every commit, including compatibility drafts. `RustDocument` exposes these operations through
wasm-bindgen. The TypeScript adapter validates domain inputs and publishes stores.

All 41 public mutation methods execute native commands. Clipboard paste remaps
identifiers, deduplicates names and inserts a subgraph atomically in Rust. The host
supplies fresh IDs; Rust checks their count, uniqueness and absence from the document.
ELK layout calculation and browser clipboard access stay in TypeScript. Layout
results use the native batched-position command. `handle.change` remains a full-document
compatibility path. Simulation and collaboration remain outside this crate's scope.
