//! Distilled per-level encoders that place entity embeddings on fitted 2D
//! maps without refitting the layout.
//!
//! The primary type is [`Projector`]. For each level of the alpha ladder,
//! [`Projector::fit`] distills the fitted layout into a small encoder by
//! training it to reproduce the layout's coordinates from the entities'
//! embeddings; [`TrainingConfig`] holds the hyperparameters and defaults.
//! Once distilled, [`Projector::forward`] places entities on the existing
//! map, including entities the layout was never fitted on.

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
