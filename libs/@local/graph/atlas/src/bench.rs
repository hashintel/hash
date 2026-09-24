//! Input builders and stage-level measurements for Atlas benchmarks.
//!
//! The `bench` feature is off by default. Enable it to expose selected pipeline operations to
//! standalone benchmark targets. These interfaces separate input preparation from the operations
//! under measurement, without requiring a complete fit.
//!
//! The Morton types ([`Depth`], [`MortonKey`] and [`MortonCell`]) preserve key and cell invariants
//! when constructing benchmark requests. These interfaces serve crate development and follow the
//! internal pipeline.

pub use crate::{
    math::{bench as math, kernel::bench as kernel},
    morton::{Depth, MortonCell, MortonKey},
    salt::{lod::bench as lod, projector::bench as projector, relation::bench as relation},
};
