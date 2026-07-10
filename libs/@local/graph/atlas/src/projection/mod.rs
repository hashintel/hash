//! Distilled per-level encoders that place entity embeddings on fitted 2D
//! maps without refitting the layout.

mod mlp;

pub(crate) use self::mlp::{Projector, TrainingConfig};
