use core::{
    alloc::Allocator,
    ops::{Index, IndexMut},
};

use super::TraversalPathBitSet;
use crate::{
    body::{
        Body, Source,
        basic_block::BasicBlockId,
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
/// Per-statement resolved traversal paths for a graph read filter body.
///
/// Stores a [`TraversalPathBitSet`] for every statement position, recording which vertex
/// fields each statement accesses. Indexed by [`Location`] (1-based statement index).
pub(crate) struct Traversals<A: Allocator> {
    inner: BlockPartitionedVec<TraversalPathBitSet, A>,
}

impl<A: Allocator + Clone> Traversals<A> {
    /// Creates a traversal map with space for all statements in the given blocks.
    ///
    /// All positions are initialized to an empty bitset for the given vertex type.
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn new_in(blocks: &BasicBlocks, vertex: VertexType, alloc: A) -> Self {
        Self {
            inner: BlockPartitionedVec::new(
                blocks.iter().map(|block| block.statements.len() as u32),
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
    pub(crate) fn of(&self, block: BasicBlockId) -> &[TraversalPathBitSet] {
        self.inner.of(block)
    }

    /// Returns a mutable slice of traversal path sets for all statements in `block`.
    pub(crate) fn of_mut(&mut self, block: BasicBlockId) -> &mut [TraversalPathBitSet] {
        self.inner.of_mut(block)
    }

    /// Returns the number of vertex paths accessed by the statement at `location`.
    #[inline]
    #[must_use]
    pub(crate) fn path_count(&self, location: Location) -> usize {
        self[location].len()
    }

    /// Rebuilds the offset table for a new block layout.
    ///
    /// Call after transforms that change statement counts per block. Does not resize or clear
    /// the data; callers must ensure the total statement count remains unchanged.
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn remap(&mut self, blocks: &BasicBlocks)
    where
        A: Clone,
    {
        self.inner
            .remap(blocks.iter().map(|block| block.statements.len() as u32));
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

struct TraversalAnalysisVisitor<A: Allocator> {
    vertex: VertexType,
    traversals: Traversals<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for TraversalAnalysisVisitor<A> {
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

pub(crate) struct TraversalAnalysis;

impl TraversalAnalysis {
    pub(crate) fn traversal_analysis_in<'heap, A: Allocator + Clone>(
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        alloc: A,
    ) -> Traversals<A> {
        match body.source {
            Source::GraphReadFilter(_) => {}
            Source::Ctor(_) | Source::Closure(..) | Source::Thunk(..) | Source::Intrinsic(_) => {
                panic!("traversal analysis may only be called on graph related operations")
            }
        }

        let Some(vertex) = VertexType::from_local(context.env, &body.local_decls[Local::VERTEX])
        else {
            unimplemented!("lookup for declared type")
        };

        let traversals = Traversals::new_in(&body.basic_blocks, vertex, alloc);

        let mut visitor = TraversalAnalysisVisitor { vertex, traversals };
        Ok(()) = visitor.visit_body(body);

        visitor.traversals
    }
}
