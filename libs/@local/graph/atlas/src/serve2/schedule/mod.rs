//! The bucket schedule of a served generation.
//!
//! One [`Generation`](crate::file::generation::Generation) serves a quadtree of tiles whose
//! delivery follows the recorded bucket schedule. A tile at zoom `z` delivers the buckets at or
//! below the cut `z + span`, and those buckets are the zoom's cumulative schedule. The deepest
//! zoom's cut is the catch-all bucket ([`buckets`](crate::salt::lod::cascade::buckets)) holding
//! every remaining point. [`BucketSchedule`] is that schedule proven within the key width,
//! `max_tile_depth + span ≤ 32` ([`LodConfig::deepest`]). Every depth the serve paths derive from
//! it then exists by construction.

use core::{error::Error, fmt};

use crate::{math::Log2, morton::Zoom};

mod bucket;

pub(crate) use self::bucket::BucketSchedule;

/// The bit width of one Morton key axis.
const AXIS_BITS: u8 = 32;

/// The recorded schedule exceeds the Morton key width.
///
/// `max_tile_depth + span` lies beyond the 32 subdivisions a Morton key axis resolves, the
/// inequality [`LodConfig::deepest`] checks, and the serving open refuses the generation.
#[derive(Debug)]
pub(crate) struct ScheduleError {
    /// Cells per tile axis of the delivery cut.
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
