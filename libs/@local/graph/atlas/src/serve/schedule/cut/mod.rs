//! Delivery queries at one resolved density offset.
//!
//! [`DeliverySchedule`] reads recorded or natural buckets through a [`BucketSchedule`]. Scoped
//! delivery combines every remaining natural bucket into the deepest cut, ordered by key and
//! priority.

use core::{error::Error, fmt};

use hashql_core::id::Id as _;

use super::{
    BucketSchedule,
    column::{BucketColumn, ScheduleNode},
    scope::ScopeSchedule,
};
use crate::{
    identity::NodeRowId,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    serve::world::{Layout, World},
};

#[cfg(test)]
mod tests;

/// A density offset that puts the deepest cut beyond the Morton key width.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScheduleWidthError {
    /// The recorded schedule the offset was applied to.
    pub schedule: BucketSchedule,
    /// The requested density offset.
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
    /// The delivered rows, bucket-major and key-ordered within each bucket.
    pub rows: Vec<NodeRowId>,
    /// The bucket the first run belongs to.
    pub first_bucket: Depth,
    /// How many rows each consecutive bucket from [`first_bucket`](Self::first_bucket) delivered.
    ///
    /// The counts partition [`rows`](Self::rows). An empty bucket keeps its zero. A run index is
    /// therefore also a bucket offset.
    pub runs: Vec<usize>,
}

/// The origin of a schedule's buckets: the generation's record or a scope's own cascade.
#[derive(Debug, Copy, Clone)]
enum ScheduleSource<'schedule> {
    /// The generation's recorded base assignments, shared by every corpus reader.
    Corpus(&'schedule Layout),
    /// A cascade assigned over one actor's visible rows.
    Scope(&'schedule ScopeSchedule),
}

/// Recorded base buckets or a visible cascade at one validated delivery cut.
///
/// Corpus delivery preserves the base assignments. Scoped delivery clamps natural buckets into
/// its deepest cut.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DeliverySchedule<'schedule> {
    /// The origin of the scheduled buckets.
    source: ScheduleSource<'schedule>,
    /// Rows assigned against the source's keys, every one ranking below every scheduled row.
    extension: Option<&'schedule BucketColumn>,
    /// The bucket cuts after the density offset.
    buckets: BucketSchedule,
    /// The applied density offset, zero for corpus delivery.
    offset: Zoom,
}

impl<'schedule> DeliverySchedule<'schedule> {
    /// Reads the generation's recorded buckets without a density offset.
    ///
    /// Base withdrawals leave the recorded delivery and aggregates unchanged.
    pub(crate) const fn corpus(world: &'schedule World) -> Self {
        Self {
            source: ScheduleSource::Corpus(&world.layout),
            extension: None,
            buckets: world.schedule(),
            offset: Zoom::MIN,
        }
    }

    /// Reads a visible cascade at the cut `offset` deepens.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when the deepened cut leaves the Morton key width.
    pub(super) fn bind(
        schedule: &'schedule ScopeSchedule,
        buckets: BucketSchedule,
        offset: Zoom,
    ) -> Result<Self, ScheduleWidthError> {
        Ok(Self {
            source: ScheduleSource::Scope(schedule),
            extension: None,
            buckets: buckets.offset(offset)?,
            offset,
        })
    }

    /// Adds rows assigned against this schedule's keys, delivered in the same key order.
    ///
    /// The extension holds rows the recorded assignment does not cover, and every extension row
    /// ranks below every scheduled row, which is what lets delivery merge the two by key alone.
    pub(super) const fn with_extension(mut self, extension: &'schedule BucketColumn) -> Self {
        self.extension = Some(extension);
        self
    }

    /// Returns the bucket cuts after applying the density offset.
    pub(crate) const fn buckets(&self) -> BucketSchedule {
        self.buckets
    }

    /// Returns the applied density offset, zero for corpus delivery.
    pub(crate) const fn offset(&self) -> Zoom {
        self.offset
    }

    /// Returns the catch-all bucket, the deepest this schedule delivers into.
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

    /// Appends one bucket's rows within `cell` to `rows`, returning how many it added.
    fn run(&self, bucket: Depth, cell: MortonCell, rows: &mut Vec<NodeRowId>) -> usize {
        let start = rows.len();
        let extension = self
            .extension
            .into_iter()
            .flat_map(|column| column.run(bucket, cell, self.deepest()));

        match self.source {
            ScheduleSource::Corpus(layout) => {
                Self::merge(layout.base_run(bucket, cell), extension, rows);
            }
            ScheduleSource::Scope(schedule) => Self::merge(
                schedule
                    .column()
                    .run(bucket, cell, self.deepest())
                    .map(|row| (row.key, row.node)),
                extension,
                rows,
            ),
        }

        rows.len() - start
    }

    /// Merges an extension run into a scheduled run, preserving key order.
    ///
    /// Interleaves the key-ordered inputs in one pass.
    fn merge(
        scheduled: impl IntoIterator<Item = (MortonKey, NodeRowId)>,
        extension: impl IntoIterator<Item = ScheduleNode>,
        rows: &mut Vec<NodeRowId>,
    ) {
        let mut extension = extension.into_iter().peekable();

        for (key, node) in scheduled {
            // An equal key delivers the scheduled row first: every extension row ranks below every
            // scheduled row.
            while let Some(row) = extension.next_if(|row| row.key < key) {
                rows.push(row.node);
            }

            rows.push(node);
        }

        rows.extend(extension.map(|row| row.node));
    }

    /// Counts rows delivered by the root's cumulative schedule.
    pub(crate) fn root_delivered(&self) -> usize {
        let cut = self.cut_of(Zoom::MIN);
        let count = match self.source {
            ScheduleSource::Corpus(layout) => layout.base_count_through(cut),
            ScheduleSource::Scope(schedule) => {
                schedule.column().delivered_through(cut, self.deepest())
            }
        };

        count
            + self
                .extension
                .map_or(0, |column| column.delivered_through(cut, self.deepest()))
    }

    /// Returns the deepest occupied delivery bucket, zero for an empty view.
    pub(crate) fn min_resolution(&self) -> Depth {
        let depth = match self.source {
            ScheduleSource::Corpus(layout) => layout.base_deepest_occupied().unwrap_or(Depth::MIN),
            ScheduleSource::Scope(schedule) => schedule
                .column()
                .deepest_occupied()
                .map_or(Depth::MIN, |bucket| bucket.min(self.deepest())),
        };

        let extension = self
            .extension
            .and_then(BucketColumn::deepest_occupied)
            .map_or(Depth::MIN, |bucket| bucket.min(self.deepest()));
        depth.max(extension)
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
                    (cut.plus(1)..=self.deepest()).any(|bucket| layout.base_occupied(bucket, child))
                }
                ScheduleSource::Scope(schedule) => schedule.column().occupied_past(cut, child),
            } || self
                .extension
                .is_some_and(|column| column.occupied_past(cut, child));

            if occupied {
                bits |= 1 << index;
            }
        }

        bits
    }

    /// Returns a row's delivery bucket, absent when the schedule does not contain it.
    ///
    /// # Panics
    ///
    /// A corpus schedule panics when a base row's recorded position lies beyond the Morton order's
    /// count, the condition [`Layout::base_bucket_of`] states.
    pub(crate) fn bucket_of(&self, node: NodeRowId) -> Option<Depth> {
        match self.source {
            ScheduleSource::Corpus(layout) => layout.base_bucket_of(node),
            ScheduleSource::Scope(schedule) => schedule
                .column()
                .bucket_of(node)
                .map(|bucket| bucket.min(self.deepest())),
        }
        .or_else(|| {
            self.extension
                .and_then(|column| column.bucket_of(node))
                .map(|bucket| bucket.min(self.deepest()))
        })
    }

    /// Returns the first served zoom whose cumulative schedule delivers `node`.
    ///
    /// Absent when the schedule does not contain the row.
    ///
    /// # Panics
    ///
    /// A corpus schedule panics under the condition [`bucket_of`](Self::bucket_of) states.
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

    /// Collects buckets `first..=last` within `cell` into one bucket-major delivery.
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
