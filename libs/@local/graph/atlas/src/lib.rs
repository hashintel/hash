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
//! - `fit --request <json>` passes a bounded JSON request to the configured [`cli::AtlasTrainer`].
//! - `serve --config <json> --bind <address>` starts the Axum 0.8 [`api::router`] over the verified
//!   active generation.
//!
//! The standalone binary provides serving immediately. Its fitting adapter is
//! intentionally unconfigured; an embedding application supplies an
//! [`cli::AtlasTrainer`] through [`cli::run_with`].
//!
//! The HTTP surface provides `/healthz`, `/v1/atlas/current`,
//! `/v1/atlas/current/manifest`, and ranged artifact reads beneath
//! `/v1/atlas/current/artifacts/{*relative_path}`. The current envelope has no
//! request authorization, so deployments should bind it to a trusted network
//! boundary.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    default_field_values,

    // Library Features
    future_join,
    pointer_is_aligned_to,
    portable_simd
)]
#![expect(
    dead_code,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::float_arithmetic,
    clippy::indexing_slicing
)]
extern crate alloc;

pub mod api;
pub mod cli;
pub mod float;
pub(crate) mod macros;
pub mod projection;
pub(crate) mod salt;
#[cfg(feature = "salt-benchmarks")]
#[doc(hidden)]
pub use salt::benchmark as salt_benchmark;
