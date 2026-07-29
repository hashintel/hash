//! # HASH Graph Atlas
//!
//! Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic similarity
//! (what entities mean) with relational structure (how they connect), and distills each map into a
//! small encoder so that new entities can be placed on existing maps without refitting.
//!
//! The crate is organized as a foundation of domain-independent modules and the SALT pipeline built
//! on top of them:
//!
//! - [`math`] - 2D geometry, transforms, embedding kernels, and the affinity curve, all
//!   SIMD-native.
//! - [`random`] - unbiased sampling and statistical acceptance bounds.
//! - [`bitset`] - fixed-capacity dense bit sets over row domains.
//! - [`identity`] - positional identity: typed row ids over the dense row domains, and the
//!   element-typed artifact column view.
//! - [`integrity`] - SHA-256 content identity for published artifacts.
//! - [`morton`] - Z-order keys: interleaved axes, grid cells, and contiguous key ranges.
//! - [`progress`] - observation of a running fit: the seam operator surfaces render from.
//! - `file` - the on-disk artifact formats: plain files in a directory, described by metadata
//!   beside them.
//! - `dataset` - the [`Dataset`](dataset::Dataset) trait: the data one fit runs over, wherever it
//!   lives, plus the relation-card format.
//! - `salt` - the pipeline: graph construction, landmark layout, projector training, evaluation,
//!   and materialization; `salt::runner::live` is the operator seam the `cli` commands drive.
//! - [`serve`] - the serving read surface: opened generations answering tile reads as wire bytes.
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
    const_try,
    generic_atomic,
    impl_trait_in_assoc_type,
    iter_intersperse,
    iter_map_windows,
    pointer_is_aligned_to,
    portable_simd,
    step_trait,
    variant_count,nonpoison_mutex,sync_nonpoison
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
// The documentation's audience is the crate's developers: module docs
// link private items deliberately, and the links resolve under
// `--document-private-items`, the form the docs are read in.
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
