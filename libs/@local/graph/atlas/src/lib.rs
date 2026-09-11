//! Fits 2D maps of HASH Graph entities from their embeddings and relationships.
//!
//! Fitting blends semantic similarity (what entities mean) with relational structure (how they
//! connect). Each fit distills the map into a small encoder that places new entities on the
//! existing map without refitting.
//!
//! For the HTTP request and response contracts, start with [`api`]. The graph binary serves the
//! interactive API reference at `/v1/atlas/openapi`.
//!
//! This HTTP sketch requires a running deployment with a published generation and valid actor
//! credentials. Replace `{generation}` with the `generation` field returned by the first response:
//!
//! ```text
//! GET /v1/atlas/current
//!     -> 200: JSON containing the generation ID
//! POST /v1/atlas/generation/{generation}/manifest  (empty body)
//!     -> 200: JSON manifest and an Atlas-Authority response header
//! ```
//!
//! An empty manifest body requests an unfiltered view of the actor's permitted entities. Present
//! the returned `Atlas-Authority` token on data requests. The manifest lists the variants and
//! request limits.
//!
//! - [Modules](#modules)
//! - [Using the crate](#using-the-crate)
//! - [Crate features](#crate-features)
//! - [Performance](#performance)
//! - [Limitations](#limitations)
//!
//! # Modules
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
//! Use [`cli`] for the operator commands that fit a generation over the live store and serve the
//! active one through the graph binary. The Rust items behind the [`api`] router are crate-internal
//! by design.
//!
//! # Crate features
//!
//! [`device::PinnedDevice`] selects CPU, CUDA, or Metal at runtime. CPU dispatches to `NdArray`,
//! while CUDA and Metal dispatch to `CubeCL`. Cargo features expose tools around that runtime. Both
//! `bench` and `cli` are disabled by default:
//!
//! - `bench` exposes `bench`, the measurement hooks the five `[[bench]]` targets in `Cargo.toml`
//!   consume. The standalone binary's lab commands build independently of this feature.
//! - `cli` compiles in the standalone `hash-graph-atlas` binary's shell and its exclusive
//!   dependencies, `ratatui`'s dashboard and `tracing-subscriber`'s log formatting. The operator
//!   commands and the read-API routes build unconditionally. The `hash-graph` binary consumes them
//!   feature-free.
//!
//! - `test-utils` exposes integration-test scenarios over private transfer machinery. It is off by
//!   default. Enable it to build the `generation_transfer` integration target.
//!
//! # Performance
//!
//! Generation maintenance maps and validates serving artifacts before publication. Requests reuse
//! those mappings. Response assembly runs on Rayon, including synchronous store calls for detail
//! hydration.
//!
//! # Limitations
//!
//! Serving and fitting never combine implicitly.
//!
//! [`cli::ServeCommand`] never fits a generation. Its maintenance task opens published artifacts
//! and retries failures. The current-generation endpoint answers 503 before initial publication.
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
    option_into_flat_iter,
    pointer_is_aligned_to,
    portable_simd,
    ptr_metadata,
    slice_shift,
    step_trait,
    str_copy_from_str,
    sync_nonpoison,
    time_saturating_systemtime,
    unboxed_closures,
    unwrap_infallible,
    variant_count,
)]
#![cfg_attr(feature = "cli", feature(exitcode_exit_method))]
#![cfg_attr(test, feature(iter_intersperse))]
#![cfg_attr(feature = "test-utils", feature(async_fn_track_caller))]
#![expect(
    unsafe_code,
    clippy::float_arithmetic,
    clippy::future_not_send,
    clippy::indexing_slicing
)]
// Operator-command machinery is unconditional library code whose one consumer, the command
// shell, sits behind `cli`. A build without `cli` marks that machinery dead rather than
// finding real rot. Bench machinery carries `cfg(any(test, feature = "bench"))` per item. The
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
mod cli2;
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
#[cfg(feature = "test-utils")]
pub mod test_utils;
