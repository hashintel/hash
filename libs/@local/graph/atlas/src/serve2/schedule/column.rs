//! Natural bucket columns with stable-row lookup.
//!
//! [`BucketColumn`] indexes both complete visible cascades and extension rows assigned against a
//! base key set. Delivery clamps natural buckets into the requested catch-all.

use core::{cmp::Ordering, slice};

use hashql_core::{
    heap::CollectIn as _,
    id::{Id as _, IdArray},
};

use crate::{
    allocator::{HeapMemoryUsage, MemoryUsage, MemoryUsageAllocator},
    identity::NodeRowId,
    math::{Log2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    salt::lod::{cascade, stage::WIRE_FRAME},
    serve2::{
        delta::epoch::Epoch,
        visibility::VisibilityMask,
        world::{Layout, node_importance::NodePriority},
    },
};

#[derive(Debug, Copy, Clone)]
pub(super) struct ScheduleNode {
    pub node: NodeRowId,
    pub key: MortonKey,
    pub priority: NodePriority,
}

impl ScheduleNode {
    pub(super) fn new(node: NodeRowId, position: Vec2, priority: NodePriority) -> Self {
        let [x, y] = WIRE_FRAME.quantize(position);

        Self {
            node,
            key: MortonKey::new(x, y),
            priority,
        }
    }

    pub(super) fn visible(
        layout: &Layout,
        epoch: &Epoch,
        mask: &VisibilityMask,
        node: NodeRowId,
    ) -> Option<Self> {
        mask.visible_node(node)?;

        let position = layout.position(epoch, node)?;
        let priority = layout
            .priority(epoch, node)
            .expect("a placed node should have an allocated priority");

        Some(Self::new(node, position, priority))
    }
}

#[derive(Debug, Copy, Clone)]
pub(super) struct BucketedNode {
    pub bucket: Depth,
    pub row: ScheduleNode,
}

enum BucketRun<'schedule> {
    Slice(slice::Iter<'schedule, BucketedNode>),
    Gathered(alloc::vec::IntoIter<ScheduleNode>),
}

impl Iterator for BucketRun<'_> {
    type Item = ScheduleNode;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Slice(slots) => slots.next().map(|slot| slot.row),
            Self::Gathered(rows) => rows.next(),
        }
    }
}

#[derive(Debug)]
pub(super) struct BucketColumn {
    slots: Box<[BucketedNode], MemoryUsageAllocator>,
    buckets: IdArray<Depth, core::range::Range<usize>, { Depth::MAX.as_usize() + 1 }>,
    by_node: Box<[(NodeRowId, Depth)], MemoryUsageAllocator>,
    memory_usage: MemoryUsage,
}

impl BucketColumn {
    /// Assigns natural buckets against the rows and an optional better-ranked key set.
    ///
    /// `shared` returns the deepest prefix shared with any external predecessor. Every external
    /// predecessor must outrank every input row.
    pub(super) fn new(
        mut rows: Vec<ScheduleNode>,
        shared: impl Fn(MortonKey) -> Option<Depth>,
    ) -> Self {
        rows.sort_unstable_by_key(|row| (row.key, row.priority));
        let buckets = cascade::separation_buckets(&rows, |row| row.key, |row| row.priority);

        let alloc = MemoryUsageAllocator::global();
        let memory_usage = alloc.memory_usage();
        let mut slots: Vec<_, _> = rows
            .into_iter()
            .zip(buckets.iter().copied())
            .map(|(row, bucket)| {
                let predecessor =
                    shared(row.key).map_or(Depth::MIN, |depth| depth.saturating_add(Log2::ONE));
                BucketedNode {
                    bucket: bucket.max(predecessor),
                    row,
                }
            })
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

    pub(super) fn bucket_of(&self, node: NodeRowId) -> Option<Depth> {
        let index = self
            .by_node
            .binary_search_by_key(&node, |&(node, _)| node)
            .ok()?;

        Some(self.by_node[index].1)
    }

    fn bucket_slots(&self, bucket: Depth) -> &[BucketedNode] {
        &self.slots[self.buckets[bucket]]
    }

    fn cell_slots(&self, bucket: Depth, cell: MortonCell) -> &[BucketedNode] {
        let slots = self.bucket_slots(bucket);

        let start = slots.partition_point(|slot| slot.row.key < cell.min_key());
        let count = slots[start..].partition_point(|slot| slot.row.key <= cell.max_key());
        &slots[start..start + count]
    }

    pub(super) fn run(
        &self,
        bucket: Depth,
        cell: MortonCell,
        deepest: Depth,
    ) -> impl Iterator<Item = ScheduleNode> {
        match bucket.cmp(&deepest) {
            Ordering::Less => BucketRun::Slice(self.cell_slots(bucket, cell).iter()),
            Ordering::Equal => {
                let mut gathered = Vec::new();

                for natural in bucket..=Depth::MAX {
                    gathered.extend(self.cell_slots(natural, cell).iter().map(|slot| slot.row));
                }

                gathered.sort_unstable_by_key(|row| (row.key, row.priority));
                BucketRun::Gathered(gathered.into_iter())
            }
            Ordering::Greater => BucketRun::Slice([].iter()),
        }
    }

    pub(super) fn delivered_through(&self, bucket: Depth, deepest: Depth) -> usize {
        if bucket == deepest {
            self.slots.len()
        } else {
            self.buckets[bucket].end
        }
    }

    pub(super) fn deepest_occupied(&self) -> Option<Depth> {
        self.slots.last().map(|slot| slot.bucket)
    }

    pub(super) fn occupied_past(&self, cut: Depth, cell: MortonCell) -> bool {
        (cut.plus(1)..=Depth::MAX).any(|bucket| !self.cell_slots(bucket, cell).is_empty())
    }

    pub(super) fn shared_depth(&self, key: MortonKey) -> Option<Depth> {
        (Depth::MIN..=Depth::MAX)
            .filter_map(|bucket| {
                let slots = self.bucket_slots(bucket);
                let at = slots.partition_point(|slot| slot.row.key < key);

                [at.checked_sub(1), (at < slots.len()).then_some(at)]
                    .into_iter()
                    .flatten()
                    .map(|index| key.shared_depth(slots[index].row.key))
                    .max()
            })
            .max()
    }
}

impl HeapMemoryUsage for BucketColumn {
    fn heap_memory_usage(&self) -> u64 {
        self.memory_usage.get() as u64
    }
}
