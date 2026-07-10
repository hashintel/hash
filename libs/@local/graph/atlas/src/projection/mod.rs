//! The Atlas projection pipeline: from sampled embeddings to fitted 2D maps
//! and distilled encoders.
//!
//! A projection fit runs through six stages, each in its own module:
//!
//! 1. [`sample`] draws (or restores from cache) a large entity sample: an mmap-backed embedding
//!    matrix plus a PostgreSQL-side identity mapping inside a short-lived repeatable-read snapshot.
//! 2. [`relation`] extracts the sampled relations through that snapshot and builds the
//!    degree-normalized, diffusion-augmented relation graph.
//! 3. [`graph`] builds the semantic fuzzy graph from HNSW cosine k-NN and fuses it with the
//!    relation graph at each alpha level.
//! 4. [`initialization`] provides PCA coordinates for cold starts, and [`umap`] optimizes each
//!    fused graph into a 2D layout.
//! 5. [`layout`] walks the descending alpha ladder with warm starts and publishes every level as a
//!    `layout-aXXX.f32` file.
//! 6. [`features`] widens embeddings with relational context, and [`mlp`] distills each layout
//!    level into a [`Projector`] that places new entities on the fitted map without refitting;
//!    [`TrainingConfig`] holds the training hyperparameters.
//!
//! [`pipeline`] orchestrates the stages end to end and owns the resource
//! rule that the database snapshot ends before numerical work begins. The
//! numerical stages are checked against a pinned Python oracle; see the
//! conformance tests in each module.

mod features;
mod graph;
mod initialization;
mod layout;
mod mlp;
mod pipeline;
mod relation;
mod sample;
mod umap;

pub(crate) use self::mlp::{Projector, TrainingConfig};
