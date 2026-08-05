//! Measurement seams for the crate's benchmark targets.
//!
//! Benchmark targets are external crates, so pipeline stages that are private implementation detail
//! everywhere else surface here behind the `bench` cargo feature. A target can synthesize realistic
//! inputs and run one stage at a time. Every result it reads is a plain number, and no internal
//! type escapes. Nothing here is API for consumers of the crate. The feature exists for the
//! `[[bench]]` targets and is off by default.

pub use crate::{
    math::{bench as math, kernel::bench as kernel},
    salt::{lod::bench as lod, projector::bench as projector, relation::bench as relation},
};
