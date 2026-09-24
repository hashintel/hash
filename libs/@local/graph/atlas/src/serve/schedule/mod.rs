//! Delivery schedules for recorded generations and visible node sets.
//!
//! [`BucketSchedule`] validates the served zoom range and bucket cuts against the Morton key width.
//! [`ScopeSchedule`] assigns natural [first-occupant buckets](crate::salt::lod::cascade) over
//! visible rows. [`ViewSchedule`] chooses, from the visibility declaration, between the recorded
//! base assignment, the shared base cascade and a scope's own cascade. [`DeliverySchedule`] reads
//! either source at one density offset, and scoped delivery combines every natural bucket past the
//! deepest cut into that catch-all.

use core::{error::Error, fmt};

use crate::{math::Log2, morton::Zoom};

mod bucket;
mod column;
mod cut;
mod scope;
mod view;

pub(crate) use self::{
    bucket::BucketSchedule,
    cut::{DeliveredNodes, DeliverySchedule, ScheduleWidthError},
    scope::ScopeSchedule,
    view::ViewSchedule,
};

/// The bit width of one Morton key axis.
const AXIS_BITS: u8 = 32;

/// The recorded schedule exceeds the Morton key width.
///
/// `max_tile_depth + span` lies beyond the 32 subdivisions a Morton key axis resolves, the
/// inequality [`LodConfig::deepest`](crate::salt::lod::stage::LodConfig::deepest) checks.
#[derive(Debug)]
pub(crate) struct ScheduleError {
    /// The base-2 exponent of the cells per tile axis of the delivery cut.
    span: Log2,
    /// The deepest tile zoom the schedule names.
    max_tile_depth: Zoom,
}

impl fmt::Display for ScheduleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the recorded schedule needs {} + {} subdivisions where a Morton key axis resolves \
             {AXIS_BITS}",
            self.max_tile_depth.get(),
            self.span.get(),
        )
    }
}

impl Error for ScheduleError {}
