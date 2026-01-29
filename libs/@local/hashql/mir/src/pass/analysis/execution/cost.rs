//! Cost tracking for execution planning.
//!
//! Provides data structures for recording the execution cost of statements on different targets.
//! The execution planner uses these costs to select optimal targets for each statement.

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    iter,
    ops::{Index, IndexMut},
};

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockSlice,
        basic_blocks::BasicBlocks,
        local::{Local, LocalVec},
        location::Location,
    },
    pass::transform::Traversals,
};

/// Execution cost for a statement on a particular target.
///
/// Lower values indicate cheaper execution. When multiple targets can execute a statement, the
/// execution planner selects the target with the lowest cost. A statement with no assigned cost
/// (`None`) indicates the target cannot execute that statement.
///
/// Typical cost values:
/// - `0`: Zero-cost operations (storage markers, nops)
/// - `4`: Standard Postgres/Embedding operations
/// - `8`: Interpreter operations (higher due to runtime overhead)
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Cost(core::num::niche_types::U32NotAllOnes);

impl Cost {
    /// Creates a cost from a `u32` value, returning `None` if the value is `u32::MAX`.
    ///
    /// The `u32::MAX` value is reserved as a niche for `Option<Cost>` optimization.
    #[must_use]
    pub const fn new(value: u32) -> Option<Self> {
        match core::num::niche_types::U32NotAllOnes::new(value) {
            Some(cost) => Some(Self(cost)),
            None => None,
        }
    }

    #[must_use]
    #[doc(hidden)]
    #[track_caller]
    pub const fn new_panic(value: u32) -> Self {
        match core::num::niche_types::U32NotAllOnes::new(value) {
            Some(cost) => Self(cost),
            None => panic!("invalid cost value"),
        }
    }

    /// Creates a cost without checking whether the value is valid.
    ///
    /// # Safety
    ///
    /// The caller must ensure `value` is not `u32::MAX`.
    #[must_use]
    #[expect(unsafe_code)]
    pub const unsafe fn new_unchecked(value: u32) -> Self {
        // SAFETY: The caller must ensure `value` is not `u32::MAX`.
        Self(unsafe { core::num::niche_types::U32NotAllOnes::new_unchecked(value) })
    }
}

/// Sparse cost map for traversal locals.
///
/// Traversals are locals that require data fetching from a backend (e.g., entity field access).
/// This map only stores costs for locals marked as traversals; insertions for non-traversal
/// locals are ignored. This allows the execution planner to focus on the operations that actually
/// require backend coordination.
pub struct TraversalCostVec<A: Allocator = Global> {
    traversals: DenseBitSet<Local>,
    costs: LocalVec<Option<Cost>, A>,
}

impl<A: Allocator> TraversalCostVec<A> {
    /// Creates an empty traversal cost map for the given body.
    ///
    /// Only locals that are enabled traversals (per [`Traversals::enabled`]) will accept cost
    /// insertions; other locals are silently ignored.
    pub fn new<'heap>(body: &Body<'heap>, traversals: &Traversals<'heap>, alloc: A) -> Self {
        Self {
            traversals: traversals.enabled(body),
            costs: LocalVec::new_in(alloc),
        }
    }

    /// Records a cost for a traversal local.
    ///
    /// If `local` is not a traversal, the insertion is silently ignored.
    pub fn insert(&mut self, local: Local, cost: Cost) {
        if self.traversals.contains(local) {
            self.costs.insert(local, cost);
        }
    }
}

/// Dense cost map for all statements in a body.
///
/// Stores the execution cost for every statement, indexed by [`Location`]. A `None` cost
/// indicates the target cannot execute that statement. The execution planner compares costs
/// across targets to determine the optimal execution strategy.
///
/// Internally uses a flattened representation with per-block offsets for efficient indexing.
pub struct StatementCostVec<A: Allocator = Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    costs: Vec<Option<Cost>, A>,
}

impl<A: Allocator> StatementCostVec<A> {
    /// Creates a cost map with space for all statements in the given blocks.
    ///
    /// All costs are initialized to `None` (unsupported). Use indexing to assign costs.
    #[expect(unsafe_code)]
    pub fn new(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut offsets = Box::new_uninit_slice_in(blocks.len() + 1, alloc.clone());

        let mut offset = 0_u32;
        let mut remaining = blocks.as_raw();

        offsets[0].write(0);

        #[expect(clippy::cast_possible_truncation)]
        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let (next, rest) = remaining.split_first()?;

            remaining = rest;

            let length = next.statements.len();
            offset += length as u32;

            Some(offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert!(remaining.is_empty());

        let costs = alloc::vec::from_elem_in(None, offset as usize, alloc);

        // SAFETY: We have initialized all elements of the slice.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        Self { offsets, costs }
    }

    /// Returns the cost at `location`, or `None` if out of bounds or unassigned.
    pub fn get(&self, location: Location) -> Option<Cost> {
        let range = (self.offsets[location.block] as usize)
            ..(self.offsets[location.block.plus(1)] as usize);

        // statement_index is 1-based
        self.costs[range]
            .get(location.statement_index - 1)
            .copied()
            .flatten()
    }
}

impl<A: Allocator> Index<Location> for StatementCostVec<A> {
    type Output = Option<Cost>;

    fn index(&self, index: Location) -> &Self::Output {
        let range =
            (self.offsets[index.block] as usize)..(self.offsets[index.block.plus(1)] as usize);

        // statement_index is 1-based
        &self.costs[range][index.statement_index - 1]
    }
}

impl<A: Allocator> IndexMut<Location> for StatementCostVec<A> {
    fn index_mut(&mut self, index: Location) -> &mut Self::Output {
        let range =
            (self.offsets[index.block] as usize)..(self.offsets[index.block.plus(1)] as usize);

        // statement_index is 1-based
        &mut self.costs[range][index.statement_index - 1]
    }
}
