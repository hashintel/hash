//! Natural delivery buckets over a captured visible node set.
//!
//! [`ScopeSchedule`] applies the [first-occupant cascade](crate::salt::lod::cascade) to the visible
//! rows under their [`NodePriority`](crate::serve2::world::node_importance::NodePriority) order.
//! Hidden rows contribute to neither bucket assignment nor delivery counts. Natural buckets use the
//! complete key width, allowing every admissible density offset to share one schedule.

use hashql_core::id::Id as _;

use super::{
    BucketSchedule,
    column::{BucketColumn, ScheduleNode},
    cut::{DeliverySchedule, ScheduleWidthError},
};
use crate::{
    allocator::HeapMemoryUsage,
    identity::NodeRowId,
    math::Bounds2,
    morton::Zoom,
    serve2::{
        delta::epoch::Epoch,
        visibility::VisibilityMask,
        world::{Layout, layout::LayoutProvider, node_importance::ImportanceProvider as _},
    },
};

#[cfg(test)]
mod tests;

/// A first-occupant cascade over one visible node set.
///
/// Rows sort by natural bucket, then by Morton key and priority. Construction captures the keys and
/// priorities at one [`Epoch`]. Delivery addresses the same stable [`NodeRowId`] domain as the
/// layout and identity providers.
#[derive(Debug)]
pub(crate) struct ScopeSchedule {
    column: BucketColumn,
}

impl ScopeSchedule {
    /// Builds the captured visible cascade and its tight wire-frame extent.
    ///
    /// # Panics
    ///
    /// Panics if `layout` does not belong to the epoch's world or a visible placement is
    /// non-finite.
    pub(crate) fn of(
        layout: &Layout,
        epoch: &Epoch,
        mask: &VisibilityMask,
    ) -> (Self, Option<Bounds2>) {
        let (rows, bounds) = ScheduleNode::collect(
            layout,
            epoch,
            mask,
            (0..layout.node_count(epoch)).map(NodeRowId::from_usize),
        );

        (Self::over(rows), bounds)
    }

    /// Builds the complete base cascade for sharing across saturated scopes.
    pub(crate) fn from_base(layout: &Layout) -> Self {
        let rows = (0..LayoutProvider::provide_node_count(layout))
            .map(|index| {
                let node = NodeRowId::from_usize(index);
                let position = layout
                    .provide_position(node)
                    .expect("should resolve the base node's position");
                let priority = layout
                    .provide_priority(node)
                    .expect("should resolve the base node's priority");

                ScheduleNode::new(node, position, priority)
            })
            .collect();

        Self::over(rows)
    }

    pub(super) const fn column(&self) -> &BucketColumn {
        &self.column
    }

    fn over(rows: Vec<ScheduleNode>) -> Self {
        Self {
            column: BucketColumn::new(rows, |_| None),
        }
    }

    /// Binds a density offset while preserving the generation's served zoom range.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when the offset puts the deepest cut beyond the key width.
    pub(crate) fn cut(
        &self,
        buckets: BucketSchedule,
        offset: Zoom,
    ) -> Result<DeliverySchedule<'_>, ScheduleWidthError> {
        DeliverySchedule::bind(self, buckets, offset)
    }
}

impl HeapMemoryUsage for ScopeSchedule {
    fn heap_memory_usage(&self) -> u64 {
        self.column.heap_memory_usage()
    }
}
