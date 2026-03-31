#[cfg(test)]
mod tests;

use alloc::{alloc::Global, collections::VecDeque};
use core::{alloc::Allocator, cmp};

use hashql_core::graph::{DirectedGraph as _, Predecessors as _, Successors as _};

use super::{IslandId, IslandVec, graph::IslandGraph};

/// An island with its assigned parallelism level.
///
/// Islands at the same level have no dependencies between them and can execute concurrently.
/// Level 0 contains islands with no predecessors.
#[derive(Debug, Copy, Clone)]
pub struct ScheduledIsland {
    /// The island this entry refers to.
    pub island: IslandId,
    /// The parallelism level. All islands at the same level are independent.
    pub level: u32,
}

/// Topological ordering of islands with parallelism levels.
///
/// Produced by [`IslandGraph::schedule`]. Each island appears exactly once,
/// ordered so that all predecessors of an island appear before it.
#[derive(Debug)]
pub struct IslandSchedule<A: Allocator> {
    entries: Vec<ScheduledIsland, A>,
}

impl<A: Allocator> IslandSchedule<A> {
    /// Returns the scheduled entries in topological order.
    #[inline]
    #[must_use]
    pub fn entries(&self) -> &[ScheduledIsland] {
        &self.entries
    }

    /// Returns the number of scheduled islands.
    #[inline]
    #[must_use]
    pub const fn len(&self) -> usize {
        self.entries.len()
    }

    /// Returns `true` if the schedule contains no islands.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Iterates over the scheduled entries in topological order.
    #[inline]
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &ScheduledIsland> {
        self.entries.iter()
    }

    #[inline]
    pub fn level_count(&self) -> usize {
        self.entries
            .last()
            .map_or(0, |entry| entry.level as usize + 1)
    }

    #[inline]
    pub fn levels(&self) -> impl Iterator<Item = &[ScheduledIsland]> {
        self.entries.chunk_by(|lhs, rhs| lhs.level == rhs.level)
    }
}

impl IslandGraph<Global> {
    #[must_use]
    pub fn schedule(&self) -> IslandSchedule<Global> {
        self.schedule_in(Global, Global)
    }
}

impl<A: Allocator> IslandGraph<A> {
    /// Computes a topological schedule with level assignment for parallelism.
    ///
    /// Each island is assigned the lowest level such that all its predecessors are at
    /// strictly lower levels. Islands at the same level have no direct dependencies and
    /// can execute concurrently.
    #[expect(clippy::cast_possible_truncation)]
    pub fn schedule_in<S>(&self, scratch: S, alloc: A) -> IslandSchedule<A>
    where
        S: Allocator + Clone,
    {
        let node_count = self.node_count();

        let mut in_degree = IslandVec::from_elem_in(0_u32, node_count, scratch.clone());
        let mut levels = IslandVec::from_elem_in(0_u32, node_count, scratch.clone());

        for (island_id, _) in self.iter_nodes() {
            in_degree[island_id] = self.predecessors(island_id).count() as u32;
        }

        let mut queue: VecDeque<IslandId, _> = VecDeque::new_in(scratch);
        for (island_id, _) in self.iter_nodes() {
            if in_degree[island_id] == 0 {
                queue.push_back(island_id);
            }
        }

        let mut entries = Vec::with_capacity_in(node_count, alloc);

        while let Some(island_id) = queue.pop_front() {
            entries.push(ScheduledIsland {
                island: island_id,
                level: levels[island_id],
            });

            for successor in self.successors(island_id) {
                levels[successor] = cmp::max(levels[successor], levels[island_id] + 1);
                in_degree[successor] -= 1;

                if in_degree[successor] == 0 {
                    queue.push_back(successor);
                }
            }
        }

        assert_eq!(
            entries.len(),
            node_count,
            "island schedule requires acyclic control flow",
        );

        entries.sort_by_key(|entry| entry.level);
        IslandSchedule { entries }
    }
}
