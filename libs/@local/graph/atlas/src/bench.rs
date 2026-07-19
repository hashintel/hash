//! Measurement seams for the crate's benchmark targets.
//!
//! Benchmark targets are external crates, so pipeline stages that are
//! private implementation detail everywhere else surface here behind
//! the `bench` cargo feature: enough to synthesize realistic inputs,
//! run one stage at a time, and read plain-number results, without any
//! internal type escaping. Nothing here is API for consumers of the
//! crate; the feature exists for the `[[bench]]` targets and is off by
//! default.

pub use crate::salt::{projector::bench as projector, relation::bench as relation};
