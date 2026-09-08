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

use hashql_core::id::Id as _;

use crate::{
    math::Log2,
    morton::{Depth, Zoom},
    salt::lod::stage::LodConfig,
};

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

/// A generation's recorded schedule, proven within the Morton key width.
///
/// [`cut`](Self::cut) and [`deepest`](Self::deepest) wrap into [`Depth`] by construction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct BucketSchedule(LodConfig);

impl BucketSchedule {
    /// Validates the recorded schedule against the Morton key width.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleError`] when `max_tile_depth + span` exceeds the key width.
    pub(super) const fn new(config: LodConfig) -> Result<Self, ScheduleError> {
        if config.deepest().is_none() {
            return Err(ScheduleError {
                span: config.span,
                max_tile_depth: config.max_tile_depth,
            });
        }

        Ok(Self(config))
    }

    /// Returns the deepest tile zoom the schedule serves.
    pub(super) const fn max_tile_depth(self) -> Zoom {
        self.0.max_tile_depth
    }

    /// Returns the cells per tile axis of the delivery cut.
    pub(super) const fn span(self) -> Log2 {
        self.0.span
    }

    /// Returns the delivery cut of zoom `z`.
    ///
    /// # Panics
    ///
    /// When `z` exceeds [`max_tile_depth`](Self::max_tile_depth).
    pub(super) const fn cut(self, z: Zoom) -> Depth {
        assert!(
            z.get() <= self.0.max_tile_depth.get(),
            "the schedule serves zooms 0..=max_tile_depth",
        );

        z.saturating_depth(self.0.span)
    }

    /// Returns the deepest served bucket, the catch-all.
    ///
    /// Every point's bucket lies at or above it: the cascade assigns depths up to it and gives it
    /// to the rows no pass claims ([`buckets`](crate::salt::lod::cascade::buckets)).
    pub(super) const fn deepest(self) -> Depth {
        self.cut(self.0.max_tile_depth)
    }

    /// Iterates the cumulative schedule of zoom `z`.
    ///
    /// # Panics
    ///
    /// When `z` exceeds [`max_tile_depth`](Self::max_tile_depth).
    pub(super) fn cut_buckets(self, z: Zoom) -> impl Iterator<Item = Depth> {
        let cut = self.cut(z);

        Depth::MIN..=cut
    }

    /// Returns the first zoom whose cumulative schedule delivers `bucket`.
    ///
    /// Bucket `b` enters the schedule at zoom `b - span`, clamped to the root for the buckets the
    /// root itself spans.
    pub(super) const fn first_zoom(self, bucket: Depth) -> Zoom {
        bucket.first_zoom(self.span())
    }
}
