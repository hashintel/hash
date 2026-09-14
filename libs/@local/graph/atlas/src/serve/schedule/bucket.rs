//! The recorded bucket cuts, proven against the Morton key width.

use super::{ScheduleError, ScheduleWidthError};
use crate::{
    math::Log2,
    morton::{Depth, Zoom},
    salt::lod::stage::LodConfig,
};

/// A generation's recorded schedule, proven within the Morton key width.
///
/// Validation at [`new`](Self::new) makes [`cut`](Self::cut) the exact sum `zoom + span` at every
/// served zoom, and [`deepest`](Self::deepest) is the cut at the deepest one.
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

    /// Deepens the delivery cut by `offset` zoom levels.
    ///
    /// The offset adds to the span exponent and deepens every served zoom's cut by `offset` without
    /// changing which zooms the schedule serves. For a fixed cell and bucket assignment, cumulative
    /// delivery includes the rows delivered without the offset. Zero offset leaves the schedule
    /// unchanged. Individual increments need not contain their unshifted counterparts.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when the deepened cut leaves the Morton key width.
    pub(super) fn offset(self, offset: Zoom) -> Result<Self, ScheduleWidthError> {
        self.deepest()
            .checked_add(offset.into())
            .ok_or(ScheduleWidthError {
                schedule: self,
                offset,
            })?;

        // `deepest + offset` fits the key width above, and `span` is at most `deepest`.
        let span = self
            .span()
            .checked_add(Log2::from(offset))
            .expect("the validated cut should fit within the key width");

        Ok(Self(LodConfig { span, ..self.0 }))
    }

    /// Returns the deepest tile zoom the schedule serves.
    pub(crate) const fn max_tile_depth(self) -> Zoom {
        self.0.max_tile_depth
    }

    /// Returns the base-2 exponent of the cells per tile axis of the delivery cut.
    ///
    /// A tile at zoom `z` cuts at depth `z + span`, sampling a `2^span` by `2^span` grid.
    pub(crate) const fn span(self) -> Log2 {
        self.0.span
    }

    /// Returns the delivery cut of zoom `z`.
    ///
    /// # Panics
    ///
    /// Panics when `z` exceeds [`max_tile_depth`](Self::max_tile_depth).
    pub(crate) const fn cut(self, z: Zoom) -> Depth {
        assert!(
            z.get() <= self.0.max_tile_depth.get(),
            "the schedule serves zooms 0..=max_tile_depth",
        );

        z.saturating_depth(self.0.span)
    }

    /// Returns the deepest served bucket, the catch-all.
    ///
    /// Every recorded bucket is at most this depth: the cascade assigns depths up to it and gives
    /// it to the rows no pass claims ([`buckets`](crate::salt::lod::cascade::buckets)).
    pub(crate) const fn deepest(self) -> Depth {
        self.cut(self.0.max_tile_depth)
    }

    /// Returns the first zoom whose cumulative schedule delivers `bucket`.
    ///
    /// Bucket `b` enters the schedule at zoom `b - span`, clamped to the root for the buckets
    /// the root itself spans.
    pub(crate) const fn first_zoom(self, bucket: Depth) -> Zoom {
        bucket.first_zoom(self.span())
    }
}
