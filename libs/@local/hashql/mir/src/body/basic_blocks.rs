//! Control-flow graph representation for HashQL MIR.
use alloc::{alloc::Global, rc::Rc};
use core::{ops::Deref, ptr};
use std::sync::OnceLock;

use hashql_core::{
    collections::TinyVec,
    graph::{
        self, DirectedGraph, Successors, Traverse,
        algorithms::{Dominators, dominators},
    },
    heap::Heap,
    id::IdVec,
};

use super::basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec};

/// Adapter that adds [`ExactSizeIterator`] semantics to an iterator with known length.
struct ExactSizeAdapter<I> {
    iter: I,
    len: usize,
}

impl<I> Iterator for ExactSizeAdapter<I>
where
    I: Iterator,
{
    type Item = I::Item;

    fn next(&mut self) -> Option<Self::Item> {
        let item = self.iter.next()?;
        self.len -= 1;

        Some(item)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.len, Some(self.len))
    }
}

impl<I> DoubleEndedIterator for ExactSizeAdapter<I>
where
    I: DoubleEndedIterator,
{
    fn next_back(&mut self) -> Option<Self::Item> {
        let item = self.iter.next_back()?;
        self.len -= 1;

        Some(item)
    }
}

impl<I> ExactSizeIterator for ExactSizeAdapter<I>
where
    I: Iterator,
{
    fn len(&self) -> usize {
        self.len
    }
}

/// Internal transparent wrapper that provides graph trait implementations for basic block slices.
///
/// This type exists solely to implement graph traversal traits in a way that it can be used during
/// caching.
#[derive(Debug)]
#[repr(transparent)]
struct BasicBlocksGraph<'heap>(BasicBlockSlice<BasicBlock<'heap>>);

impl<'heap> BasicBlocksGraph<'heap> {
    /// Creates a graph view of a basic block slice without copying or allocation.
    const fn new<'slice>(blocks: &'slice BasicBlockSlice<BasicBlock<'heap>>) -> &'slice Self {
        // SAFETY: `BasicBlocksGraph` is repr(transparent) and has the same layout as
        // `BasicBlockSlice`.
        #[expect(unsafe_code)]
        unsafe {
            &*(ptr::from_ref(blocks) as *const Self)
        }
    }
}
impl<'heap> DirectedGraph for BasicBlocksGraph<'heap> {
    type Edge<'this>
        = (BasicBlockId, BasicBlockId)
    where
        Self: 'this;
    type EdgeId = (BasicBlockId, BasicBlockId);
    type Node<'this>
        = (BasicBlockId, &'this BasicBlock<'heap>)
    where
        Self: 'this;
    type NodeId = BasicBlockId;

    fn node_count(&self) -> usize {
        self.0.len()
    }

    fn edge_count(&self) -> usize {
        self.0
            .iter()
            .map(|block| block.terminator.kind.successor_blocks().len())
            .sum()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        self.0.iter_enumerated()
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        ExactSizeAdapter {
            iter: self.0.iter_enumerated().flat_map(|(id, block)| {
                block
                    .terminator
                    .kind
                    .successor_blocks()
                    .map(move |succ| (id, succ))
            }),
            len: self.edge_count(),
        }
    }
}

impl Successors for BasicBlocksGraph<'_> {
    type SuccIter<'this>
        = impl Iterator<Item = Self::NodeId> + 'this
    where
        Self: 'this;

    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.0[node].terminator.kind.successor_blocks()
    }
}

impl Traverse for BasicBlocksGraph<'_> {}

/// Type alias for the predecessor mapping structure.
///
/// Maps each [`BasicBlockId`] to a small vector containing all blocks that directly
/// jump to it. [`TinyVec`] is used because most basic blocks have 4 or fewer predecessors,
/// avoiding heap allocations in the common case.
type Predecessors = BasicBlockVec<TinyVec<BasicBlockId>>;

/// Lazily-computed cache for expensive control-flow graph queries.
///
/// This cache stores the results of CFG analysis that are expensive to compute
/// but frequently needed during optimization passes. All cached data is computed
/// on first access and invalidated whenever the CFG structure changes.
#[derive(Debug, Default)]
struct Cache {
    /// Cached predecessor mapping for all basic blocks.
    ///
    /// Most basic blocks have 4 or fewer predecessors, so [`TinyVec`] avoids
    /// heap allocations in the common case while gracefully handling blocks
    /// with many predecessors (e.g., loop headers, exception handlers).
    predecessors: OnceLock<Predecessors>,

    /// Cached reverse postorder traversal of the control-flow graph.
    ///
    /// Reverse postorder is a natural linearization of a CFG that ensures all
    /// predecessors of a block (except back edges) appear before the block itself.
    /// This ordering is optimal for forward dataflow analysis algorithms.
    reverse_postorder: OnceLock<Vec<BasicBlockId>>,

    dominators: OnceLock<Dominators<BasicBlockId>>,
}

/// A control-flow graph consisting of basic blocks with cached analysis results.
///
/// [`BasicBlocks`] wraps a collection of [`BasicBlock`]s and maintains lazily-computed
/// cached data for expensive CFG queries like predecessor relationships and traversal
/// orderings.
///
/// The cache is invalidated on mutable access to the underlying basic blocks.
#[derive(Debug, Clone)]
pub struct BasicBlocks<'heap> {
    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    cache: Rc<Cache>,
}

impl<'heap> BasicBlocks<'heap> {
    /// Creates a new control-flow graph from a collection of basic blocks.
    #[must_use]
    pub fn new(blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>) -> Self {
        Self {
            blocks,
            cache: Rc::new(Cache::default()),
        }
    }

    /// Returns the predecessor mapping for all basic blocks in the CFG.
    ///
    /// The result maps each [`BasicBlockId`] to a collection of all blocks that
    /// directly jump to it via their terminators.
    #[must_use]
    pub fn all_predecessors(&self) -> &Predecessors {
        self.cache.predecessors.get_or_init(|| {
            let mut predecessors = IdVec::from_domain_in(TinyVec::new(), &self.blocks, Global);

            for (id, bb) in self.blocks.iter_enumerated() {
                for successor in bb.terminator.kind.successor_blocks() {
                    predecessors[successor].push(id);
                }
            }

            predecessors
        })
    }

    /// Returns the reverse postorder traversal sequence for this CFG.
    ///
    /// Reverse postorder is a linearization of the CFG where each block appears
    /// after all its predecessors (except back edges from loops). This ordering
    /// is optimal for forward dataflow analysis because information naturally
    /// flows in iteration order.
    ///
    /// The traversal starts from [`BasicBlockId::START`] and follows all reachable
    /// paths. Unreachable blocks will not appear in the result.
    #[must_use]
    pub fn reverse_postorder(&self) -> &[BasicBlockId] {
        self.cache.reverse_postorder.get_or_init(|| {
            let view = BasicBlocksGraph::new(&self.blocks);

            let mut postorder: Vec<_> = view
                .depth_first_traversal_post_order([BasicBlockId::START])
                .collect();

            postorder.reverse();

            postorder
        })
    }

    #[must_use]
    pub fn dominators(&self) -> &Dominators<BasicBlockId> {
        self.cache
            .dominators
            .get_or_init(|| dominators(self, BasicBlockId::START))
    }

    /// Invalidates all cached CFG analysis results.
    ///
    /// This shouldn't need to be called manually, any access via [`AsMut`] automatically
    /// invalidates the cache, as we're unable to prove that a terminator *wasn't* modified.
    ///
    /// To access the basic blocks without invalidating cached data, use
    /// [`BasicBlocks::as_mut_preserving_cfg`].
    pub fn invalidate_cache(&mut self) {
        if let Some(cache) = Rc::get_mut(&mut self.cache) {
            *cache = Cache::default();
        } else {
            self.cache = Rc::new(Cache::default());
        }
    }

    /// Returns mutable access to the basic blocks without invalidating cached data.
    ///
    /// # Contract
    ///
    /// The caller must ensure that no modifications change the control-flow graph
    /// structure. Specifically:
    /// - Do not modify any terminator's successor blocks
    /// - Do not add or remove basic blocks
    /// - Do not change which blocks are reachable
    ///
    /// It is safe to modify:
    /// - Statement sequences within blocks
    /// - Block parameters
    /// - Local variables referenced by statements
    /// - Any data that doesn't affect CFG edges
    ///
    /// Violating this contract results in stale cached data for [`all_predecessors`]
    /// and [`reverse_postorder`], leading to incorrect analysis results.
    ///
    /// Use [`as_mut`] if you need to modify terminators or are unsure whether
    /// the CFG will change.
    ///
    /// [`all_predecessors`]: BasicBlocks::all_predecessors
    /// [`reverse_postorder`]: BasicBlocks::reverse_postorder
    /// [`as_mut`]: AsMut::as_mut
    pub const fn as_mut_preserving_cfg(
        &mut self,
    ) -> &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap> {
        &mut self.blocks
    }
}

impl<'heap> AsMut<BasicBlockVec<BasicBlock<'heap>, &'heap Heap>> for BasicBlocks<'heap> {
    fn as_mut(&mut self) -> &mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap> {
        self.invalidate_cache();

        &mut self.blocks
    }
}

impl<'heap> AsRef<BasicBlockSlice<BasicBlock<'heap>>> for BasicBlocks<'heap> {
    fn as_ref(&self) -> &BasicBlockSlice<BasicBlock<'heap>> {
        &self.blocks
    }
}

impl<'heap> Deref for BasicBlocks<'heap> {
    type Target = BasicBlockSlice<BasicBlock<'heap>>;

    fn deref(&self) -> &Self::Target {
        &self.blocks
    }
}

impl<'heap> graph::DirectedGraph for BasicBlocks<'heap> {
    type Edge<'this>
        = (BasicBlockId, BasicBlockId)
    where
        Self: 'this;
    type EdgeId = (BasicBlockId, BasicBlockId);
    type Node<'this>
        = (BasicBlockId, &'this BasicBlock<'heap>)
    where
        Self: 'this;
    type NodeId = BasicBlockId;

    fn node_count(&self) -> usize {
        BasicBlocksGraph::new(&self.blocks).node_count()
    }

    fn edge_count(&self) -> usize {
        BasicBlocksGraph::new(&self.blocks).edge_count()
    }

    fn iter_nodes(&self) -> impl ExactSizeIterator<Item = Self::Node<'_>> + DoubleEndedIterator {
        BasicBlocksGraph::new(&self.blocks).iter_nodes()
    }

    fn iter_edges(&self) -> impl ExactSizeIterator<Item = Self::Edge<'_>> + DoubleEndedIterator {
        BasicBlocksGraph::new(&self.blocks).iter_edges()
    }
}

impl graph::Successors for BasicBlocks<'_> {
    type SuccIter<'this>
        = impl ExactSizeIterator<Item = BasicBlockId> + DoubleEndedIterator
    where
        Self: 'this;

    #[inline]
    fn successors(&self, node: Self::NodeId) -> Self::SuccIter<'_> {
        self.blocks[node].terminator.kind.successor_blocks()
    }
}

impl graph::Predecessors for BasicBlocks<'_> {
    type PredIter<'this>
        = impl ExactSizeIterator<Item = BasicBlockId> + DoubleEndedIterator + Clone
    where
        Self: 'this;

    fn predecessors(&self, node: Self::NodeId) -> Self::PredIter<'_> {
        self.all_predecessors()[node].iter().copied()
    }
}

impl graph::Traverse for BasicBlocks<'_> {}
