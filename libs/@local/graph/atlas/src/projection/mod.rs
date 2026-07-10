//! Distilled per-level encoders that place entity embeddings on fitted 2D
//! maps without refitting the layout.
#![expect(
    dead_code,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::float_arithmetic
)]

mod mlp;

pub(crate) use self::mlp::{Projector, TrainingConfig};
