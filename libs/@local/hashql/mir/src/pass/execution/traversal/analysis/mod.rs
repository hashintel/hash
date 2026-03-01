#[cfg(test)]
mod tests;

use core::{
    alloc::Allocator,
    ops::{Index, IndexMut},
};

use super::TraversalPathBitSet;
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlockId, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::Local,
        location::Location,
        place::{DefUse, Place, PlaceContext},
    },
    context::MirContext,
    pass::execution::{
        VertexType, block_partitioned_vec::BlockPartitionedVec, traversal::EntityPath,
    },
    visit::{self, Visitor},
};
/// Per-block aggregated traversal paths.
///
/// Stores a single [`TraversalPathBitSet`] per basic block, representing the union of all
/// vertex field accesses across every statement and terminator in that block.
pub(crate) struct BlockTraversals<A: Allocator = alloc::alloc::Global> {
    vertex: VertexType,
    inner: BasicBlockVec<TraversalPathBitSet, A>,
}

impl<A: Allocator> BlockTraversals<A> {
    pub(crate) fn new_in(len: usize, vertex: VertexType, alloc: A) -> Self {
        Self {
            vertex,
            inner: BasicBlockVec::from_elem_in(TraversalPathBitSet::empty(vertex), len, alloc),
        }
    }

    #[inline]
    pub(crate) fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<A: Allocator> Index<BasicBlockId> for BlockTraversals<A> {
    type Output = TraversalPathBitSet;

    #[inline]
    fn index(&self, index: BasicBlockId) -> &Self::Output {
        &self.inner[index]
    }
}

impl<A: Allocator> IndexMut<BasicBlockId> for BlockTraversals<A> {
    #[inline]
    fn index_mut(&mut self, index: BasicBlockId) -> &mut Self::Output {
        &mut self.inner[index]
    }
}

impl<A: Allocator> Index<Location> for BlockTraversals<A> {
    type Output = TraversalPathBitSet;

    #[inline]
    fn index(&self, index: Location) -> &Self::Output {
        &self.inner[index.block]
    }
}

impl<A: Allocator> IndexMut<Location> for BlockTraversals<A> {
    #[inline]
    fn index_mut(&mut self, index: Location) -> &mut Self::Output {
        &mut self.inner[index.block]
    }
}

/// Per-location resolved traversal paths for a graph read filter body.
///
/// Stores a [`TraversalPathBitSet`] for every statement and terminator position, recording
/// which vertex fields each location accesses. Indexed by [`Location`] (1-based statement
/// index, with the terminator at `statements.len() + 1`).
pub(crate) struct Traversals<A: Allocator> {
    vertex: VertexType,
    inner: BlockPartitionedVec<TraversalPathBitSet, A>,
}

impl<A: Allocator + Clone> Traversals<A> {
    /// Creates a traversal map with space for all statements and terminators in the given blocks.
    ///
    /// All positions are initialized to an empty bitset for the given vertex type.
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn new_in(blocks: &BasicBlocks, vertex: VertexType, alloc: A) -> Self {
        Self {
            vertex,
            inner: BlockPartitionedVec::new_in(
                blocks
                    .iter()
                    .map(|block| (block.statements.len() + 1) as u32),
                TraversalPathBitSet::empty(vertex),
                alloc,
            ),
        }
    }
}

impl<A: Allocator> Traversals<A> {
    /// Returns the traversal path sets for all statements in `block`.
    ///
    /// The returned slice is indexed by statement position (0-based within the block).
    #[inline]
    pub(crate) fn of(&self, block: BasicBlockId) -> &[TraversalPathBitSet] {
        self.inner.of(block)
    }

    /// Returns the vertex type of the traversal.
    #[inline]
    pub(crate) const fn vertex(&self) -> VertexType {
        self.vertex
    }

    /// Returns the number of vertex paths accessed by the statement at `location`.
    #[inline]
    #[must_use]
    pub(crate) fn path_count(&self, location: Location) -> usize {
        self[location].len()
    }
}

impl<A: Allocator> Index<Location> for Traversals<A> {
    type Output = TraversalPathBitSet;

    fn index(&self, index: Location) -> &Self::Output {
        &self.inner.of(index.block)[index.statement_index - 1]
    }
}

impl<A: Allocator> IndexMut<Location> for Traversals<A> {
    fn index_mut(&mut self, index: Location) -> &mut Self::Output {
        &mut self.inner.of_mut(index.block)[index.statement_index - 1]
    }
}

struct TraversalAnalysisVisitor<T> {
    vertex: VertexType,
    traversals: T,
}

impl<'heap, T> Visitor<'heap> for TraversalAnalysisVisitor<T>
where
    T: IndexMut<Location, Output = TraversalPathBitSet>,
{
    type Result = Result<(), !>;

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &Place<'heap>,
    ) -> Self::Result {
        if place.local != Local::VERTEX {
            // We do not target the vertex itself, so no traversals need to be recorded.
            return Ok(());
        }

        if context.into_def_use() != Some(DefUse::Use) {
            // We're only interested in `DefUse::Use`
            return Ok(());
        }

        match self.vertex {
            VertexType::Entity => {
                let current = self.traversals[location]
                    .as_entity_mut()
                    .unwrap_or_else(|| {
                        unreachable!("a graph body cannot traverse over multiple types")
                    });

                let path = EntityPath::resolve(&place.projections);

                if let Some((path, _)) = path {
                    current.insert(path);
                } else {
                    // The path leads to "nothing", indicating that we must hydrate the entire
                    // entity.
                    current.insert_all();
                }
            }
        }

        visit::r#ref::walk_place(self, location, context, place)
    }
}

pub(crate) struct TraversalAnalysis {
    vertex: VertexType,
}

impl TraversalAnalysis {
    pub(crate) fn new(vertex: VertexType) -> Self {
        Self { vertex }
    }

    pub(crate) fn traversal_analysis_in<'heap, A: Allocator + Clone>(
        &self,
        body: &Body<'heap>,
        alloc: A,
    ) -> Traversals<A> {
        let traversals = Traversals::new_in(&body.basic_blocks, self.vertex, alloc);

        let mut visitor = TraversalAnalysisVisitor {
            vertex: self.vertex,
            traversals,
        };
        Ok(()) = visitor.visit_body(body);

        visitor.traversals
    }

    pub(crate) fn coarse_traversal_analysis_in<'heap, A: Allocator + Clone>(
        &self,
        body: &Body<'heap>,
        alloc: A,
    ) -> BlockTraversals<A> {
        let traversals = BlockTraversals::new_in(body.basic_blocks.len(), self.vertex, alloc);

        let mut visitor = TraversalAnalysisVisitor {
            vertex: self.vertex,
            traversals,
        };

        Ok(()) = visitor.visit_body(body);

        visitor.traversals
    }
}
