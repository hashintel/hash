//! # HASH Graph Atlas
//!
//! Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic similarity
//! (what entities mean) with relational structure (how they connect), and distills each map into a
//! small encoder that places new entities on an existing map without refitting.
//!
//! The crate builds the SALT pipeline on top of a foundation of domain-independent modules:
//!
//! - [`math`] - 2D geometry, transforms, embedding kernels, and the affinity curve, all
//!   SIMD-native.
//! - [`random`] - unbiased sampling and statistical acceptance bounds.
//! - [`bitset`] - fixed-capacity dense bit sets over row domains.
//! - [`identity`] - positional identity, with typed row ids over the dense row domains and the
//!   element-typed artifact column view.
//! - [`integrity`] - SHA-256 content identity for published artifacts.
//! - [`morton`] - Z-order keys from interleaved axes, plus grid cells and contiguous key ranges.
//! - [`progress`] - observation of a running fit, the seam operator surfaces render from.
//! - [`file`](mod@file) - the on-disk artifact formats, plain files in a directory described by
//!   metadata beside them.
//! - [`dataset`] - the [`Dataset`](dataset::Dataset) trait for the data one fit runs over, wherever
//!   it lives, plus the relation-card format.
//! - [`salt`] - the pipeline that runs graph construction, landmark layout, projector training,
//!   evaluation, and materialization. `salt::runner::live` is the operator seam the `cli` commands
//!   drive.
//! - [`serve`] - the serving read surface: opened generations answering tile reads as wire bytes.
//!
//! # Examples
//!
//! Opens the active generation and answers one tile request.
//!
//! ```no_run
//! use std::sync::Arc;
//!
//! use hash_graph_atlas::serve::{
//!     Atlas, CutOffset, GenerationRoot, OpenOptions, TileCoordinate, TileLimits, TileQuery,
//!     TileRequest, VisibilityProof, WireSecret,
//! };
//!
//! # fn main() -> Result<(), Box<dyn core::error::Error>> {
//! let root = GenerationRoot::new("/var/atlas/generations")?;
//! let id = root.current()?.expect("a generation is active");
//! let secret =
//!     WireSecret::from_hex("6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55")?;
//! let atlas = Arc::new(Atlas::open(
//!     &root,
//!     id,
//!     OpenOptions {
//!         wire_secret: secret,
//!     },
//! )?);
//!
//! let proof = VisibilityProof::full_visibility();
//! let bytes = atlas.tile(
//!     &TileRequest {
//!         coordinate: TileCoordinate { z: 0, x: 0, y: 0 },
//!         query: TileQuery::default(),
//!     },
//!     TileLimits::default(),
//!     &proof,
//!     CutOffset::ZERO,
//! )?;
//! # let _ = bytes;
//! # Ok(())
//! # }
//! ```
//!
//! # Crate features
//!
//! Each feature below gates optional compilation beyond the default build.
//!
//! - `bench` exposes `bench`, the measurement seams the five `[[bench]]` targets in `Cargo.toml`
//!   consume; the lab instruments the standalone binary runs are not gated behind it and build with
//!   the crate regardless.
//! - `gpu` switches the projector's training and inference backend from the CPU `NdArray` backend
//!   to `burn`'s Metal-backed `wgpu` `CubeBackend`. It compiles on any target; the GPU-flavored
//!   tests carry `#[ignore]` because running them needs an Apple GPU.
//! - `cli` gates the standalone `hash-graph-atlas` binary's shell and its exclusive dependencies,
//!   `ratatui`'s dashboard and `tracing-subscriber`'s log formatting; the operator commands and the
//!   read-API routes build unconditionally, so the `hash-graph` binary consumes them feature-free.
//!
//! # Performance
//!
//! Opening a generation validates every artifact once.
//!
//! [`serve::Atlas::open`] maps and validates every serving artifact and their cross-artifact
//! agreement a single time, so every read after that is an mmap gather and a wire encode, never a
//! decode. Every published artifact is a plain file mapped whole by `mmap`, so serving cost after
//! open is page-cache and address-space bound rather than parse bound. An opened [`serve::Atlas`]
//! is `Send + Sync` and immutable, so a caller can keep one in an `Arc` across requests for the
//! process lifetime of the generation; reads are synchronous and CPU-bound over mapped memory, so
//! an async transport schedules them on a compute pool rather than inline on its own runtime
//! threads.
//!
//! # Limitations
//!
//! Serving and fitting never combine implicitly.
//!
//! [`cli::ServeCommand`] opens an already-published generation and never fits one; an empty or
//! unfitted root fails the open with a named [`cli::ServeError::Missing`] rather than fitting on
//! demand.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    const_trait_impl,
    default_field_values,
    exhaustive_patterns,
    f128,
    never_type,

    // Library Features
    allocator_api,
    array_try_from_fn,
    const_array,
    const_closures,
    const_cmp,
    const_convert,
    const_default,
    const_destruct,
    const_index,
    const_ops,
    const_option_ops,
    const_try,
    generic_atomic,
    impl_trait_in_assoc_type,
    iter_intersperse,
    iter_map_windows,
    nonpoison_mutex,
    pointer_is_aligned_to,
    portable_simd,
    step_trait,
    sync_nonpoison,
    time_saturating_systemtime,
    variant_count,
)]
// The dashboard's interrupt path leaves through an exit code, and it is
// the only consumer of the feature.
#![cfg_attr(feature = "cli", feature(exitcode_exit_method))]
#![expect(
    dead_code,
    unsafe_code,
    clippy::float_arithmetic,
    // Async surfaces follow the `Dataset` trait, which does not promise
    // `Send` streams: a future's sendability is the caller's dataset
    // choice, not a per-function property worth restating.
    clippy::future_not_send,
    clippy::indexing_slicing
)]
// The documentation's audience is the crate's developers. Module docs link private items on
// purpose, and readers view the docs under `--document-private-items`, where those links resolve.
#![allow(rustdoc::private_intra_doc_links)]
extern crate alloc;

pub mod api;
#[cfg(feature = "bench")]
pub mod bench;
pub mod bitset;
pub mod cli;
pub(crate) mod dataset;
pub mod disjoint;
mod file;
pub mod identity;
pub mod integrity;
pub mod math;
pub mod morton;
pub mod progress;
pub mod random;
mod salt;
pub mod serve;
