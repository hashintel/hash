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
//! - [`runs`] - compressed runs of items over dense key domains stored as two flat columns.
//! - [`progress`] - observation of a running fit, the feed the `cli` dashboard renders from.
//! - [`file`](mod@file) - the on-disk artifact formats, plain files in a directory described by
//!   metadata beside them.
//! - [`dataset`] - the [`Dataset`](dataset::Dataset) trait for the data one fit runs over, wherever
//!   it lives, plus the relation-card format.
//! - [`salt`] - the pipeline that runs graph construction, landmark layout, projector training,
//!   evaluation, and materialization. `salt::runner::operator` holds the entry points the `cli`
//!   commands drive, over the live store and over a dump directory.
//! - [`serve`] - the serving read surface: opened generations answering tile reads as wire bytes.
//!
//! # Using the crate
//!
//! A caller outside this crate reaches a published generation over HTTP. [`cli`] carries the
//! operator commands that fit a generation over the live store and serve the active one through the
//! [`api`] router the graph binary hosts. The Rust items behind that router are crate-internal by
//! design. [`serve::Atlas`] carries the worked example for the read path.
//!
//! # Crate features
//!
//! [`device::PinnedDevice`] selects CPU, CUDA, or Metal at runtime. CPU dispatches to `NdArray`,
//! while CUDA and Metal dispatch to `CubeCL`. Cargo features expose tools around that runtime:
//!
//! - `bench` exposes `bench`, the measurement hooks the five `[[bench]]` targets in `Cargo.toml`
//!   consume. The lab instruments the standalone binary runs stay outside it and build with the
//!   crate regardless.
//! - `cli` compiles in the standalone `hash-graph-atlas` binary's shell and its exclusive
//!   dependencies, `ratatui`'s dashboard and `tracing-subscriber`'s log formatting. The operator
//!   commands and the read-API routes build unconditionally, so the `hash-graph` binary consumes
//!   them feature-free.
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
//! process lifetime of the generation. Reads are synchronous and CPU-bound over mapped memory, so
//! an async transport schedules them on a compute pool rather than inline on its own runtime
//! threads.
//!
//! # Limitations
//!
//! Serving and fitting never combine implicitly.
//!
//! [`cli::ServeCommand`] opens an already-published generation and never fits one. An empty or
//! unfitted root fails the open with a named [`cli::ServeError::Missing`] rather than fitting on
//! demand.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    async_fn_traits,
    const_trait_impl,
    default_field_values,
    exhaustive_patterns,
    f128,
    impl_restriction,
    macro_metavar_expr_concat,
    never_type,
    macro_metavar_expr,

    // Library Features
    allocator_api,
    arc_is_unique,
    clone_from_ref,
    clone_to_uninit,
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
    exact_size_is_empty,
    file_buffered,
    generic_atomic,
    get_mut_unchecked,
    impl_trait_in_assoc_type,
    integer_casts,
    iter_map_windows,
    iterator_try_collect,
    nonpoison_mutex,
    nonpoison_rwlock,
    pointer_is_aligned_to,
    portable_simd,
    ptr_metadata,
    step_trait,
    sync_nonpoison,
    time_saturating_systemtime,
    variant_count,
    unwrap_infallible,
)]
#![cfg_attr(feature = "cli", feature(exitcode_exit_method))]
#![cfg_attr(test, feature(iter_intersperse))]
#![expect(
    unsafe_code,
    clippy::float_arithmetic,
    clippy::future_not_send,
    clippy::indexing_slicing
)]
// Operator-command machinery is unconditional library code whose one consumer, the command
// shell, sits behind `cli`, so a build without `cli` marks that machinery dead rather than
// finding real rot. Bench machinery carries `cfg(any(test, feature = "bench"))` per item, so the
// dead-code lint is live on every other item in every unit with `cli` on.
#![cfg_attr(not(feature = "cli"), allow(dead_code))]
// The documentation's audience is the crate's developers. Module docs link private items on
// purpose, and readers view the docs under `--document-private-items`, where those links resolve.
#![allow(rustdoc::private_intra_doc_links)]
extern crate alloc;

mod allocator;
pub(crate) mod api;
#[cfg(feature = "bench")]
pub mod bench;
pub(crate) mod bitset;
pub mod cli;
pub(crate) mod dataset;
pub mod device;
pub(crate) mod file;
pub(crate) mod identity;
pub(crate) mod integrity;
pub(crate) mod math;
pub(crate) mod morton;
pub(crate) mod offload;
pub(crate) mod postgres;
pub(crate) mod progress;
pub(crate) mod random;
pub(crate) mod runs;
pub(crate) mod salt;
pub(crate) mod serve;
