#[cfg(test)]
mod tests;

use core::alloc::Allocator;

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
}

impl<G: Allocator> IslandGraph<G> {
    /// Computes a topological schedule with level assignment for parallelism.
    ///
    /// Each island is assigned the lowest level such that all its predecessors are at
    /// strictly lower levels. Islands at the same level have no direct dependencies and
    /// can execute concurrently.
    #[expect(clippy::cast_possible_truncation)]
    pub fn schedule<S>(&self, scratch: S) -> IslandSchedule<S>
    where
        S: Allocator + Clone,
    {
        let node_count = self.node_count();

        let mut in_degree = IslandVec::from_elem_in(0_u32, node_count, scratch.clone());
        let mut levels = IslandVec::from_elem_in(0_u32, node_count, scratch.clone());

        for (island_id, _) in self.iter_nodes() {
            in_degree[island_id] = self.predecessors(island_id).count() as u32;
        }

        let mut queue: Vec<IslandId, _> = Vec::new_in(scratch.clone());
        for (island_id, _) in self.iter_nodes() {
            if in_degree[island_id] == 0 {
                queue.push(island_id);
            }
        }

        let mut entries = Vec::with_capacity_in(node_count, scratch);
        let mut head = 0;

        while head < queue.len() {
            let island_id = queue[head];
            head += 1;

            entries.push(ScheduledIsland {
                island: island_id,
                level: levels[island_id],
            });

            for successor in self.successors(island_id) {
                levels[successor] = levels[successor].max(levels[island_id] + 1);
                in_degree[successor] -= 1;
                if in_degree[successor] == 0 {
                    queue.push(successor);
                }
            }
        }

        IslandSchedule { entries }
    }
}
