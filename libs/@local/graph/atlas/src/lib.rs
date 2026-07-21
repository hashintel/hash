//! # HASH Graph Atlas
//!
//! Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic
//! similarity (what entities mean) with relational structure (how they connect), and distills
//! each map into a small encoder so that new entities can be placed on existing maps without
//! refitting.
//!
//! The crate is organized as a foundation of domain-independent modules
//! and the SALT pipeline built on top of them:
//!
//! - [`math`] - 2D geometry, transforms, embedding kernels, and the affinity curve, all
//!   SIMD-native.
//! - [`random`] - unbiased sampling and statistical acceptance bounds.
//! - [`bitset`] - fixed-capacity dense bit sets over row domains.
//! - [`integrity`] - SHA-256 content identity for published artifacts.
//! - [`morton`] - Z-order keys: interleaved axes, grid cells, and contiguous key ranges.
//! - `file` - the on-disk artifact formats: plain files in a directory, described by metadata
//!   beside them.
//! - `dataset` - the [`Dataset`](dataset::Dataset) trait: the data one fit runs over, wherever it
//!   lives, plus the relation-card format.
//! - `salt` - the pipeline: graph construction, landmark layout, projector training, evaluation,
//!   and materialization.
//! - `run` - the operator seam: one production run over a live store, the `atlas` binary's fallible
//!   surface (`cli`/`bench` features).
//! - [`serve`] - the serving read surface: opened generations answering tile reads as wire bytes.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    const_trait_impl,
    default_field_values,
    never_type,
    exhaustive_patterns,

    // Library Features
    allocator_api,
    array_try_from_fn,
    const_cmp,
    const_convert,
    const_index,
    const_ops,
    impl_trait_in_assoc_type,
    iter_intersperse,
    pointer_is_aligned_to,
    portable_simd,
    variant_count,
    const_closures,
    const_array,
    const_default
)]
#![expect(
    dead_code,
    unsafe_code,
    clippy::float_arithmetic,
    clippy::indexing_slicing
)]
extern crate alloc;

pub mod api;
#[cfg(feature = "bench")]
pub mod bench;
pub mod bitset;
pub mod cli;
pub(crate) mod dataset;
pub mod disjoint;
mod file;
pub mod integrity;
pub mod math;
pub mod morton;
pub mod random;
pub mod run;
mod salt;
pub mod serve;
