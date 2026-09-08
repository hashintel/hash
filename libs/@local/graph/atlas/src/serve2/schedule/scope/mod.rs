//! Natural delivery buckets over a captured visible node set.
//!
//! [`ScopeSchedule`] applies the [first-occupant cascade](crate::salt::lod::cascade) to the visible
//! rows under their [`NodePriority`] order. Hidden rows contribute to neither bucket assignment nor
//! delivery counts. Natural buckets use the complete key width, allowing every admissible density
//! offset to share one schedule.

use hashql_core::{
    heap::CollectIn as _,
    id::{Id as _, IdArray},
};

use super::{
    BucketSchedule,
    cut::{DeliverySchedule, ScheduleWidthError},
};
use crate::{
    allocator::{HeapMemoryUsage, MemoryUsage, MemoryUsageAllocator},
    identity::NodeRowId,
    morton::{Depth, MortonCell, MortonKey, Zoom},
    salt::lod::{cascade, stage::WIRE_FRAME},
    serve2::{
        delta::epoch::Epoch,
        visibility::VisibilityMask,
        world::{Layout, node_importance::NodePriority},
    },
};

#[cfg(test)]
mod tests;

#[derive(Debug, Copy, Clone)]
pub(super) struct ScheduleNode {
    pub node: NodeRowId,
    pub key: MortonKey,
    pub priority: NodePriority,
}

#[derive(Debug, Copy, Clone)]
pub(super) struct BucketedNode {
    pub bucket: Depth,
    pub row: ScheduleNode,
}

/// A first-occupant cascade over one visible node set.
///
/// Rows sort by natural bucket, then by Morton key and priority. Construction captures the keys and
/// priorities at one [`Epoch`]. Delivery addresses the same stable [`NodeRowId`] domain as the
/// layout and identity providers.
#[derive(Debug)]
pub(crate) struct ScopeSchedule {
    slots: Box<[BucketedNode], MemoryUsageAllocator>,
    buckets: IdArray<Depth, core::range::Range<usize>, { Depth::MAX.as_usize() + 1 }>,
    by_node: Box<[(NodeRowId, Depth)], MemoryUsageAllocator>,
    memory_usage: MemoryUsage,
}

impl ScopeSchedule {
    /// Builds the cascade over the mask's visible placements at the captured revision.
    ///
    /// # Panics
    ///
    /// Panics if `layout` does not belong to the epoch's world.
    pub(crate) fn of(layout: &Layout, epoch: &Epoch, mask: &VisibilityMask) -> Self {
        let rows = (0..layout.node_count(epoch))
            .filter_map(|index| {
                let node = NodeRowId::from_usize(index);

                mask.visible_node(node)?;

                let position = layout.position(epoch, node)?;
                let priority = layout
                    .priority(epoch, node)
                    .expect("a placed node should have an allocated priority");

                let [x, y] = WIRE_FRAME.quantize(position);
                Some(ScheduleNode {
                    node,
                    key: MortonKey::new(x, y),
                    priority,
                })
            })
            .collect();

        Self::over(rows)
    }

    fn over(mut rows: Vec<ScheduleNode>) -> Self {
        rows.sort_unstable_by_key(|row| (row.key, row.priority));
        let buckets = cascade::separation_buckets(&rows, |row| row.key, |row| row.priority);

        let alloc = MemoryUsageAllocator::global();
        let memory_usage = alloc.memory_usage();
        let mut slots: Vec<_, _> = rows
            .into_iter()
            .zip(buckets.iter().copied())
            .map(|(row, bucket)| BucketedNode { bucket, row })
            .collect_in(alloc.clone());
        slots.sort_unstable_by_key(|slot| (slot.bucket, slot.row.key, slot.row.priority));

        let mut counts = IdArray::<Depth, usize, { Depth::MAX.as_usize() + 1 }>::from_elem(0);
        for slot in &slots {
            counts[slot.bucket] += 1;
        }

        let mut start = 0;
        let buckets = counts.map(|count| {
            let range = start..start + count;
            start = range.end;

            core::range::Range::from(range)
        });

        let mut by_node: Vec<_, _> = slots
            .iter()
            .map(|slot| (slot.row.node, slot.bucket))
            .collect_in(alloc);
        by_node.sort_unstable_by_key(|&(node, _)| node);

        Self {
            slots: slots.into_boxed_slice(),
            buckets,
            by_node: by_node.into_boxed_slice(),
            memory_usage,
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

    pub(super) fn bucket_of(&self, node: NodeRowId) -> Option<Depth> {
        let index = self
            .by_node
            .binary_search_by_key(&node, |&(node, _)| node)
            .ok()?;

        Some(self.by_node[index].1)
    }

    pub(super) fn bucket_slots(&self, bucket: Depth) -> &[BucketedNode] {
        &self.slots[self.buckets[bucket]]
    }

    pub(super) fn cell_slots(&self, bucket: Depth, cell: MortonCell) -> &[BucketedNode] {
        let slots = self.bucket_slots(bucket);
        let start = slots.partition_point(|slot| slot.row.key < cell.min_key());
        let count = slots[start..].partition_point(|slot| slot.row.key <= cell.max_key());
        &slots[start..start + count]
    }

    pub(super) fn delivered_through(&self, bucket: Depth) -> usize {
        self.buckets[bucket].end
    }

    pub(super) const fn len(&self) -> usize {
        self.slots.len()
    }

    pub(super) fn deepest_occupied(&self) -> Option<Depth> {
        self.slots.last().map(|slot| slot.bucket)
    }
}

impl HeapMemoryUsage for ScopeSchedule {
    fn heap_memory_usage(&self) -> u64 {
        self.memory_usage.get() as u64
    }
}
