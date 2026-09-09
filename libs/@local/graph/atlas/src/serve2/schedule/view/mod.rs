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
    serve2::{
        delta::epoch::Epoch,
        density::ViewOccupancy,
        visibility::{VisibilityKind, VisibilityMask},
        world::World,
    },
};

#[cfg(test)]
mod tests;

#[derive(Debug)]
enum ScheduleData {
    Corpus {
        extension: BucketColumn,
    },
    Saturated {
        base: Arc<ScopeSchedule>,
        extension: BucketColumn,
    },
    Scoped(ScopeSchedule),
}

/// A captured node schedule associated with its base generation.
///
/// Corpus schedules preserve recorded base assignments through withdrawals. Scoped schedules
/// include only the mask's admitted placements at construction. Extension rows use captured keys
/// and priorities in both modes.
#[derive(Debug)]
pub(crate) struct ViewSchedule {
    world: Arc<World>,
    data: ScheduleData,
    bounds: Option<Bounds2>,
}

impl ViewSchedule {
    /// Resolves the visibility declaration against one captured publication.
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

    /// Returns the scheduled rows' tight wire-frame extent, or `None` for an empty schedule.
    ///
    /// Corpus bounds retain the recorded base extent through withdrawals.
    pub(crate) const fn bounds(&self) -> Option<Bounds2> {
        self.bounds
    }

    /// Builds the occupied-cell profile of the captured scope.
    ///
    /// Corpus schedules return `None`. Every scoped schedule returns `Some`, including an empty
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
    fn heap_memory_usage(&self) -> u64 {
        match &self.data {
            ScheduleData::Corpus { extension } => extension.heap_memory_usage(),
            // base is not accounted for because it's shared
            ScheduleData::Saturated { base: _, extension } => extension.heap_memory_usage(),
            ScheduleData::Scoped(scoped) => scoped.heap_memory_usage(),
        }
    }
}
