use hashql_core::id::Id as _;

use super::ScheduleError;
use crate::{
    math::Log2,
    morton::{Depth, Zoom},
    salt::lod::stage::LodConfig,
};

/// A generation's recorded schedule, proven within the Morton key width.
///
/// [`cut`](Self::cut) and [`deepest`](Self::deepest) wrap into [`Depth`] by construction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BucketSchedule(LodConfig);

impl BucketSchedule {
    /// Validates the recorded schedule against the Morton key width.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleError`] when `max_tile_depth + span` exceeds the key width.
    pub(crate) const fn new(config: LodConfig) -> Result<Self, ScheduleError> {
        if config.deepest().is_none() {
            return Err(ScheduleError {
                span: config.span,
                max_tile_depth: config.max_tile_depth,
            });
        }

        Ok(Self(config))
    }

    /// Returns the deepest tile zoom the schedule serves.
    pub(crate) const fn max_tile_depth(self) -> Zoom {
        self.0.max_tile_depth
    }

    /// Returns the cells per tile axis of the delivery cut.
    pub(crate) const fn span(self) -> Log2 {
        self.0.span
    }

    /// Returns the delivery cut of zoom `z`.
    ///
    /// # Panics
    ///
    /// When `z` exceeds [`max_tile_depth`](Self::max_tile_depth).
    pub(crate) const fn cut(self, z: Zoom) -> Depth {
        assert!(
            z.get() <= self.0.max_tile_depth.get(),
            "the schedule serves zooms 0..=max_tile_depth",
        );

        z.saturating_depth(self.0.span)
    }

    /// Returns the deepest served bucket, the catch-all.
    ///
    /// Every point's bucket lies at or above it: the cascade assigns depths up to it and gives
    /// it to the rows no pass claims ([`buckets`](crate::salt::lod::cascade::buckets)).
    pub(crate) const fn deepest(self) -> Depth {
        self.cut(self.0.max_tile_depth)
    }

    /// Iterates the cumulative schedule of zoom `z`.
    ///
    /// # Panics
    ///
    /// When `z` exceeds [`max_tile_depth`](Self::max_tile_depth).
    pub(crate) fn cut_buckets(self, z: Zoom) -> impl Iterator<Item = Depth> {
        let cut = self.cut(z);

        Depth::MIN..=cut
    }

    /// Returns the first zoom whose cumulative schedule delivers `bucket`.
    ///
    /// Bucket `b` enters the schedule at zoom `b - span`, clamped to the root for the buckets
    /// the root itself spans.
    pub(crate) const fn first_zoom(self, bucket: Depth) -> Zoom {
        bucket.first_zoom(self.span())
    }
}
