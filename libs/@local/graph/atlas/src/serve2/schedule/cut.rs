//! Delivery queries at one resolved density offset.
//!
//! [`DeliverySchedule`] reads recorded or natural buckets through a [`BucketSchedule`]. Scoped
//! delivery combines every remaining natural bucket into the deepest cut, ordered by key and
//! priority.

use core::{cmp::Ordering, error::Error, fmt};

use hashql_core::id::Id as _;

use super::{BucketSchedule, scope::ScopeSchedule};
use crate::{
    identity::NodeRowId,
    morton::{Depth, MortonCell, Zoom},
    serve2::world::{Layout, World},
};

#[cfg(test)]
mod tests;

/// A density offset that puts the deepest cut beyond the Morton key width.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScheduleWidthError {
    pub schedule: BucketSchedule,
    pub offset: Zoom,
}

impl fmt::Display for ScheduleWidthError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "delivery-cut offset {} puts the deepest bucket {} + {} + {} beyond the {} \
             subdivisions a Morton key resolves",
            self.offset,
            self.schedule.max_tile_depth(),
            self.schedule.span(),
            self.offset,
            Depth::MAX
        )
    }
}

impl Error for ScheduleWidthError {}

/// Stable node rows and their per-bucket delivered counts.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct DeliveredNodes {
    pub rows: Vec<NodeRowId>,
    pub first_bucket: Depth,
    pub runs: Vec<usize>,
}

#[derive(Debug, Copy, Clone)]
enum ScheduleSource<'schedule> {
    Corpus(&'schedule Layout),
    Scope(&'schedule ScopeSchedule),
}

/// Recorded fitted buckets or a visible cascade at one validated delivery cut.
///
/// Corpus delivery preserves the fitted assignments. Scoped delivery clamps natural buckets into
/// its deepest cut.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DeliverySchedule<'schedule> {
    source: ScheduleSource<'schedule>,
    buckets: BucketSchedule,
}

impl<'schedule> DeliverySchedule<'schedule> {
    /// Reads the generation's recorded buckets without a density offset.
    ///
    /// Fitted withdrawals leave the recorded delivery and aggregates unchanged.
    pub(crate) const fn corpus(world: &'schedule World) -> Self {
        Self {
            source: ScheduleSource::Corpus(&world.layout),
            buckets: world.schedule(),
        }
    }

    pub(super) fn bind(
        schedule: &'schedule ScopeSchedule,
        buckets: BucketSchedule,
        offset: Zoom,
    ) -> Result<Self, ScheduleWidthError> {
        Ok(Self {
            source: ScheduleSource::Scope(schedule),
            buckets: buckets.offset(offset)?,
        })
    }

    pub(crate) const fn deepest(&self) -> Depth {
        self.buckets.deepest()
    }

    /// Returns the cumulative delivery cut at a served zoom.
    ///
    /// # Panics
    ///
    /// Panics beyond the generation's deepest served zoom.
    pub(crate) const fn cut_of(&self, zoom: Zoom) -> Depth {
        self.buckets.cut(zoom)
    }

    fn run(&self, bucket: Depth, cell: MortonCell, rows: &mut Vec<NodeRowId>) -> usize {
        let start = rows.len();
        let schedule = match self.source {
            ScheduleSource::Corpus(layout) => {
                rows.extend(layout.run(bucket, cell).map(|(_, node)| node));
                return rows.len() - start;
            }
            ScheduleSource::Scope(schedule) => schedule,
        };

        match bucket.cmp(&self.deepest()) {
            Ordering::Less => rows.extend(
                schedule
                    .cell_slots(bucket, cell)
                    .iter()
                    .map(|slot| slot.row.node),
            ),
            Ordering::Equal => {
                let mut gathered = Vec::new();
                for natural in bucket..=Depth::MAX {
                    gathered.extend(
                        schedule
                            .cell_slots(natural, cell)
                            .iter()
                            .map(|slot| slot.row),
                    );
                }
                gathered.sort_unstable_by_key(|row| (row.key, row.priority));
                rows.extend(gathered.into_iter().map(|row| row.node));
            }
            Ordering::Greater => {}
        }

        rows.len() - start
    }

    /// Counts rows delivered by the root's cumulative schedule.
    pub(crate) fn root_delivered(&self) -> usize {
        let cut = self.cut_of(Zoom::MIN);
        match self.source {
            ScheduleSource::Corpus(layout) => layout.count_through(cut),
            ScheduleSource::Scope(schedule) if cut == self.deepest() => schedule.len(),
            ScheduleSource::Scope(schedule) => schedule.delivered_through(cut),
        }
    }

    /// Returns the deepest occupied delivery bucket, zero for an empty view.
    pub(crate) fn min_resolution(&self) -> Depth {
        match self.source {
            ScheduleSource::Corpus(layout) => layout.deepest_occupied().unwrap_or(Depth::MIN),
            ScheduleSource::Scope(schedule) => schedule
                .deepest_occupied()
                .map_or(Depth::MIN, |bucket| bucket.min(self.deepest())),
        }
    }

    /// Returns the Morton-child mask for rows beyond this zoom's cumulative cut.
    ///
    /// Bit `i` names child `i` in Morton order. At the deepest served zoom the mask is zero.
    ///
    /// # Panics
    ///
    /// Panics beyond the generation's deepest served zoom.
    pub(crate) fn children(&self, zoom: Zoom, cell: MortonCell) -> u8 {
        let cut = self.cut_of(zoom);
        if cut == self.deepest() {
            return 0;
        }

        let Some(children) = cell.children() else {
            return 0;
        };

        let mut bits = 0;
        for (index, child) in children.into_iter().enumerate() {
            let occupied = match self.source {
                ScheduleSource::Corpus(layout) => {
                    (cut.plus(1)..=self.deepest()).any(|bucket| layout.occupied(bucket, child))
                }
                ScheduleSource::Scope(schedule) => (cut.plus(1)..=Depth::MAX)
                    .any(|bucket| !schedule.cell_slots(bucket, child).is_empty()),
            };

            if occupied {
                bits |= 1 << index;
            }
        }

        bits
    }

    /// Returns a row's delivery bucket, absent when the schedule does not contain it.
    pub(crate) fn bucket_of(&self, node: NodeRowId) -> Option<Depth> {
        match self.source {
            ScheduleSource::Corpus(layout) => layout.bucket_of(node),
            ScheduleSource::Scope(schedule) => schedule
                .bucket_of(node)
                .map(|bucket| bucket.min(self.deepest())),
        }
    }

    /// Returns the first served zoom delivering a visible row.
    pub(crate) fn first_zoom(&self, node: NodeRowId) -> Option<Zoom> {
        self.bucket_of(node)
            .map(|bucket| self.buckets.first_zoom(bucket))
    }

    /// Gathers only rows newly delivered at this zoom, in bucket-major order.
    ///
    /// The root includes its cumulative buckets. Deeper zooms include only their cut bucket. Runs
    /// retain empty buckets.
    ///
    /// # Panics
    ///
    /// Panics beyond the generation's deepest served zoom.
    pub(crate) fn delta(&self, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        let cut = self.cut_of(zoom);
        let first = if zoom == Zoom::MIN { Depth::MIN } else { cut };

        self.gather(first, cut, cell)
    }

    /// Gathers the cumulative buckets at this zoom, in bucket-major order.
    ///
    /// # Panics
    ///
    /// Panics beyond the generation's deepest served zoom.
    pub(crate) fn total(&self, zoom: Zoom, cell: MortonCell) -> DeliveredNodes {
        self.gather(Depth::MIN, self.cut_of(zoom), cell)
    }

    fn gather(&self, first: Depth, last: Depth, cell: MortonCell) -> DeliveredNodes {
        let mut rows = Vec::new();
        let runs = (first..=last)
            .map(|bucket| self.run(bucket, cell, &mut rows))
            .collect();

        DeliveredNodes {
            rows,
            first_bucket: first,
            runs,
        }
    }
}
