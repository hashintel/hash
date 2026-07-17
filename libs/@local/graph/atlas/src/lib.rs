//! # HASH Graph Atlas
//!
//! Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic
//! similarity (what entities mean) with relational structure (how they connect), and distills
//! each map into a small encoder so that new entities can be placed on existing maps without
//! refitting.
//!
//! This is the Rust home for the functionality prototyped in the `tools/embedding2d` Python
//! tool: sampling embeddings and relations, building the semantic and relational graphs, fitting
//! the alpha ladder of layouts, and distilling the per-level encoders.
//!
//! ## Running a fit
//!
//! The entry point is [`projection::fit_projection`]: load a sample with
//! [`projection::Sample::load`], then fit and publish in one call.
//!
//! ```rust,no_run
//! use burn::backend::{Autodiff, Wgpu};
//! use hash_graph_atlas::projection::{ProjectionOptions, Sample, SampleOptions, fit_projection};
//!
//! # async fn example(client: &mut tokio_postgres::Client) -> Result<(), Box<dyn core::error::Error>> {
//! let out = camino::Utf8Path::new("/var/lib/atlas");
//! let sample = Sample::load(client, out, 42, SampleOptions::default()).await?;
//! let outcome = fit_projection::<Autodiff<Wgpu>>(
//!     sample,
//!     out,
//!     ProjectionOptions {
//!         // Warm-start from the previous generation when it exists.
//!         warm_start: Some(out.to_owned()),
//!         ..ProjectionOptions::default()
//!     },
//!     &Default::default(),
//! )
//! .await?;
//! println!("published {} encoders", outcome.metadata.encoders.len());
//! # Ok(())
//! # }
//! ```
//!
//! The fit publishes `layout-aXXX.f32`, `encoder-aXXX.mpk`, `hubs.json`, and
//! `projection-metadata.json` into the output directory; a serving process
//! restores them with [`projection::load_projection`].
//!
//! ## SALT command and HTTP API
//!
//! The `hash-graph-atlas` binary exposes two commands:
//!
//! - `fit --config <worker.json> --request <request.json>` runs the concrete
//!   [`salt_fit::ProductionAtlasTrainer`] over a bounded direct-PostgreSQL snapshot.
//! - `serve --config <json> --bind <address>` starts the Axum 0.8 [`api::router`] over the verified
//!   active generation.
//!
//! Applications can still inject another [`cli::AtlasTrainer`] through
//! [`cli::run_with`].
//!
//! Generate docs with `--document-private-items` to read the crate-internal
//! SALT theory and invariants.
//!
//! The HTTP surface provides `/healthz`, `/v1/atlas/current`,
//! `/v1/atlas/current/manifest`, immutable spatial tiles at
//! `/v1/atlas/tile/{generation}/{variant}/{z}/{x}/{y}`, reverse spatial
//! lookup at `/v1/atlas/lookup/{generation}/{variant}`, and live-store
//! subgraph hydration at `/v1/atlas/lookup/{generation}/{variant}/subgraph`.
//! The current envelope has no request authorization, so deployments should
//! bind it to a trusted network boundary.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    const_trait_impl,
    default_field_values,
    never_type,

    // Library Features
    const_closures,
    const_convert,
    const_iter,
    const_ops,
    const_index,
    const_cmp,
    future_join,
    pointer_is_aligned_to,
    portable_simd,
    allocator_api,
    array_try_from_fn,
    variant_count,
    const_array,
    const_option_ops
)]
#![expect(
    dead_code,
    unsafe_code,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::float_arithmetic,
    clippy::indexing_slicing
)]
extern crate alloc;

pub mod api;
pub mod cli;
// pub(crate) mod file2;
mod file;
pub mod float;
pub mod integrity;
pub(crate) mod macros;
pub mod math;
pub mod projection;
pub mod random;
pub(crate) mod salt;
mod salt2;
pub mod salt_fit;
#[cfg(feature = "salt-benchmarks")]
#[doc(hidden)]
pub use salt::benchmark as salt_benchmark;
