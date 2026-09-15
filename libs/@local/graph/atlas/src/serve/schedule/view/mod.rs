//! Captured view scheduling under corpus or scoped visibility.
//!
//! [`ViewSchedule`] preserves the visibility declaration. Saturated scopes share the generation's
//! complete base cascade and retain their extension rows separately. Narrow scopes recompute the
//! cascade over every admitted placement.

use alloc::sync::Arc;

use hashql_core::id::Id as _;

use super::{
    column::{BucketColumn, ScheduleNode},
    cut::{DeliverySchedule, ScheduleWidthError},
    scope::ScopeSchedule,
};
use crate::{
    allocator::HeapMemoryUsage,
    identity::NodeRowId,
    math::Bounds2,
    morton::Zoom,
    serve::{
        delta::epoch::Epoch,
        density::ViewOccupancy,
        visibility::{VisibilityKind, VisibilityMask},
        world::World,
    },
};

#[cfg(test)]
mod tests;

/// The cascade a view delivers from, and what it shares with the generation.
///
/// These cases differ in what they recompute. Corpus and saturated views reuse an assignment
/// the generation already holds and keep only their extension rows, while a narrow scope pays for
/// its own cascade over the rows it admits.
#[derive(Debug)]
enum ScheduleData {
    /// The generation's recorded base assignment, plus rows added since it was recorded.
    Corpus {
        /// Rows assigned against the recorded base keys.
        extension: BucketColumn,
    },
    /// A scope that admits every base row, each of which the epoch places.
    ///
    /// Both conditions hold for every base row, the conjunction [`ViewSchedule::of`] tests. It
    /// shares the generation's complete base cascade.
    Saturated {
        /// The generation's shared base cascade.
        base: Arc<ScopeSchedule>,
        /// Rows assigned against that cascade's keys.
        extension: BucketColumn,
    },
    /// A scope that withholds or lacks a placement for some base row.
    ///
    /// Its cascade is assigned over exactly the placements it admits, base and added alike.
    Scoped(ScopeSchedule),
}

/// A captured node schedule associated with its base generation.
///
/// Corpus schedules preserve recorded base assignments through withdrawals. Scoped schedules
/// include only the mask's admitted placements at construction. Extension rows use captured keys
/// and priorities in both modes.
#[derive(Debug)]
pub(crate) struct ViewSchedule {
    /// The generation the schedule captures.
    world: Arc<World>,
    /// The cascade the view delivers from.
    data: ScheduleData,
    /// The wire-frame bounds captured according to the view kind.
    ///
    /// Corpus and saturated views join the recorded base bounds with the measured extent of their
    /// added rows. A narrow scope measures the extent of exactly the rows it admits.
    bounds: Option<Bounds2>,
}

impl ViewSchedule {
    /// Resolves the visibility declaration against one captured publication.
    ///
    /// Under a corpus declaration, the view reads the generation's recorded base assignment and
    /// assigns only the rows added since. A scope saturates when the mask admits every base row
    /// and the epoch places each. Its admitted base rows are then the fitted rows at their fitted
    /// positions and ranks, which makes its cascade over them the generation's base cascade. A
    /// saturated scope therefore shares that cascade and assigns only its added rows. A scope
    /// withholding or missing a base row is narrow and assigns its own cascade over exactly the
    /// rows it admits.
    ///
    /// # Panics
    ///
    /// Panics if `world` does not belong to `epoch` or a gathered placement is non-finite.
    pub(crate) fn of(world: Arc<World>, epoch: &Epoch, mask: &VisibilityMask) -> Self {
        let count = world.layout.node_count(epoch);

        let saturated = || {
            (NodeRowId::MIN..world.layout.index.base_node_bound()).all(|node| {
                mask.visible_node(node).is_some() && world.layout.position(epoch, node).is_some()
            })
        };

        let (data, bounds) = match mask.kind() {
            VisibilityKind::Scope if !saturated() => {
                let (schedule, bounds) = ScopeSchedule::of(&world.layout, epoch, mask);
                (ScheduleData::Scoped(schedule), bounds)
            }
            kind @ (VisibilityKind::Corpus | VisibilityKind::Scope) => {
                let (rows, bounds) = ScheduleNode::collect(
                    &world.layout,
                    epoch,
                    mask,
                    world.layout.index.base_node_bound()..NodeRowId::from_usize(count),
                );
                let bounds = world
                    .layout
                    .base_bounds()
                    .into_iter()
                    .chain(bounds)
                    .reduce(Bounds2::union);

                let data = match kind {
                    VisibilityKind::Corpus => ScheduleData::Corpus {
                        extension: BucketColumn::new(rows, |key| {
                            world.layout.base_shared_depth(key)
                        }),
                    },
                    VisibilityKind::Scope => {
                        let base = Arc::clone(world.base_scope_schedule());
                        let extension =
                            BucketColumn::new(rows, |key| base.column().shared_depth(key));
                        ScheduleData::Saturated { base, extension }
                    }
                };
                (data, bounds)
            }
        };

        Self {
            world,
            data,
            bounds,
        }
    }

    /// Returns the wire-frame bounds captured for this view, or [`None`] for an empty schedule.
    ///
    /// For a corpus or saturated view this is the recorded base bounds
    /// ([`Layout::base_bounds`](crate::serve::world::Layout::base_bounds)) joined with the measured
    /// extent of the rows added since the base. The base part comes from the record rather than
    /// from the rows, and withdrawals leave it in place. For a narrow scope it is the tight extent
    /// of the admitted rows' placements, measured at construction.
    pub(crate) const fn bounds(&self) -> Option<Bounds2> {
        self.bounds
    }

    /// Builds the occupied-cell profile of the captured scope.
    ///
    /// Corpus schedules return [`None`]. Every scoped schedule returns [`Some`], including an empty
    /// scope's zero profile. All captured keys contribute, independently of delivery cut.
    ///
    /// # Complexity
    ///
    /// O(n log n) time and O(n) temporary storage for n scheduled rows.
    #[must_use]
    #[tracing::instrument(skip_all, fields(generation = %self.world.generation().id()))]
    pub(crate) fn occupancy(&self) -> Option<ViewOccupancy> {
        let (base, extension) = match &self.data {
            ScheduleData::Corpus { .. } => return None,
            ScheduleData::Saturated { base, extension } => (base.column(), Some(extension)),
            ScheduleData::Scoped(schedule) => (schedule.column(), None),
        };
        let mut keys: Vec<_> = base
            .keys()
            .chain(extension.into_iter().flat_map(BucketColumn::keys))
            .collect();
        Some(ViewOccupancy::of(&mut keys))
    }

    /// Binds the scoped density offset or reads the corpus's recorded cuts.
    ///
    /// Corpus delivery keeps its recorded cuts for every `offset`.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when a scoped offset exceeds the Morton key width.
    pub(crate) fn cut(&self, offset: Zoom) -> Result<DeliverySchedule<'_>, ScheduleWidthError> {
        match &self.data {
            ScheduleData::Corpus { extension } => {
                Ok(DeliverySchedule::corpus(&self.world).with_extension(extension))
            }
            ScheduleData::Saturated { base, extension } => base
                .cut(self.world.schedule(), offset)
                .map(|cut| cut.with_extension(extension)),
            ScheduleData::Scoped(schedule) => schedule.cut(self.world.schedule(), offset),
        }
    }
}

impl HeapMemoryUsage for ViewSchedule {
    /// Returns the heap bytes this view alone holds.
    ///
    /// Every view over the generation shares a saturated view's base cascade, and charging it to
    /// one view would count it once per request. The extension, and a narrow scope's own
    /// schedule, are this view's alone and count.
    fn heap_memory_usage(&self) -> u64 {
        match &self.data {
            ScheduleData::Corpus { extension } | ScheduleData::Saturated { base: _, extension } => {
                extension.heap_memory_usage()
            }
            ScheduleData::Scoped(scoped) => scoped.heap_memory_usage(),
        }
    }
}
