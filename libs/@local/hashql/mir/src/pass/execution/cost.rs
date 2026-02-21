//! Cost tracking for execution planning.
//!
//! Provides data structures for recording the execution cost of statements on different targets.
//! The execution planner uses these costs to select optimal targets for each statement.

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    fmt,
    iter::{self, Sum},
    ops::{Add, AddAssign, Index, IndexMut, Mul, MulAssign},
};
use std::f32;

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
        basic_blocks::BasicBlocks,
        local::{Local, LocalVec},
        location::Location,
    },
    macros::{forward_ref_binop, forward_ref_op_assign},
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
    /// The maximum representable cost value (`u32::MAX - 1`).
    ///
    /// Used as a sentinel for "effectively infinite" cost when exact values overflow.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::Cost;
    /// assert_eq!(Cost::MAX, Cost::new(u32::MAX - 1).unwrap());
    /// ```
    pub const MAX: Self = match core::num::niche_types::U32NotAllOnes::new(0xFFFF_FFFE) {
        Some(cost) => Self(cost),
        None => unreachable!(),
    };
    pub const MIN: Self = match core::num::niche_types::U32NotAllOnes::new(0) {
        Some(cost) => Self(cost),
        None => unreachable!(),
    };

    /// Creates a cost from a `u32` value, returning `None` if the value is `u32::MAX`.
    ///
    /// The `u32::MAX` value is reserved as a niche for [`Option<Cost>`] optimization.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::Cost;
    /// assert!(Cost::new(0).is_some());
    /// assert!(Cost::new(100).is_some());
    /// assert!(Cost::new(u32::MAX).is_none()); // Reserved for niche
    /// ```
    #[inline]
    #[must_use]
    pub const fn new(value: u32) -> Option<Self> {
        match core::num::niche_types::U32NotAllOnes::new(value) {
            Some(cost) => Some(Self(cost)),
            None => None,
        }
    }

    #[inline]
    #[must_use]
    pub const fn new_saturating(value: u32) -> Self {
        match Self::new(value) {
            Some(cost) => cost,
            None => Self::MAX,
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

    /// Adds `other` to this cost, saturating at [`Cost::MAX`] on overflow.
    #[inline]
    #[must_use]
    pub const fn saturating_add(self, other: Self) -> Self {
        let raw = self.0.as_inner();

        Self::new_saturating(raw.saturating_add(other.0.as_inner()))
    }

    #[expect(clippy::cast_precision_loss)]
    #[inline]
    #[must_use]
    pub const fn as_approx(self) -> ApproxCost {
        ApproxCost(self.0.as_inner() as f32)
    }
}

impl fmt::Display for Cost {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0.as_inner(), fmt)
    }
}

/// Approximate execution cost as a floating-point value.
///
/// Guarantees the inner value is never NaN, which makes the type totally ordered ([`Eq`] +
/// [`Ord`]). Used when exact integer costs are unnecessary or when operations like averaging,
/// weighting, or normalization produce fractional results. Supports accumulation via [`Add`],
/// [`AddAssign`], and [`Sum`].
///
/// Created from a [`Cost`] via [`From`]:
///
/// ```
/// # use hashql_mir::pass::execution::{Cost, ApproxCost};
/// let cost = Cost::new(42).unwrap();
/// let approx = ApproxCost::from(cost);
/// ```
#[derive(Debug, Clone, Copy)]
#[repr(transparent)]
pub struct ApproxCost(f32);

impl ApproxCost {
    pub const INF: Self = Self(f32::INFINITY);
    /// An approximate cost of zero.
    pub const ZERO: Self = Self(0.0);

    /// Creates an approximate cost from an `f32`, returning `None` if the value is NaN.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::ApproxCost;
    /// assert!(ApproxCost::new(1.5).is_some());
    /// assert!(ApproxCost::new(f32::NAN).is_none());
    /// ```
    #[inline]
    #[must_use]
    pub const fn new(value: f32) -> Option<Self> {
        if value.is_nan() {
            None
        } else {
            Some(Self(value))
        }
    }

    /// Returns the inner `f32` value.
    #[inline]
    #[must_use]
    pub const fn as_f32(self) -> f32 {
        self.0
    }

    /// Returns `true` if the cost is infinite.
    #[inline]
    #[must_use]
    pub const fn is_infinite(self) -> bool {
        self.0.is_infinite()
    }

    /// Returns `true` if the cost is finite.
    #[inline]
    #[must_use]
    pub const fn is_finite(self) -> bool {
        self.0.is_finite()
    }

    /// Compute the absolute difference between this cost and another.
    #[inline]
    #[must_use]
    #[expect(clippy::float_arithmetic)]
    pub const fn abs_diff(self, other: Self) -> f32 {
        (self.0 - other.0).abs()
    }
}

impl Eq for ApproxCost {}

impl PartialEq for ApproxCost {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Ord for ApproxCost {
    #[inline]
    fn cmp(&self, other: &Self) -> core::cmp::Ordering {
        self.0.total_cmp(&other.0)
    }
}

impl PartialOrd for ApproxCost {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<core::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl From<Cost> for ApproxCost {
    #[inline]
    fn from(cost: Cost) -> Self {
        #[expect(clippy::cast_precision_loss)]
        Self(cost.0.as_inner() as f32)
    }
}

impl fmt::Display for ApproxCost {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Add<Self> for ApproxCost {
    type Output = Self;

    #[inline]
    #[expect(clippy::float_arithmetic)]
    fn add(self, rhs: Self) -> Self {
        Self::new(self.0 + rhs.0).expect("Operation on two NotNan resulted in NaN")
    }
}

impl Mul<f32> for ApproxCost {
    type Output = Self;

    #[inline]
    #[expect(clippy::float_arithmetic)]
    fn mul(self, rhs: f32) -> Self {
        Self::new(self.0 * rhs).expect("Operation resulted in NaN")
    }
}

impl Add<Cost> for ApproxCost {
    type Output = Self;

    #[inline]
    #[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
    fn add(self, rhs: Cost) -> Self {
        Self(self.0 + rhs.0.as_inner() as f32)
    }
}

impl AddAssign<Self> for ApproxCost {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

impl AddAssign<Cost> for ApproxCost {
    #[inline]
    #[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
    fn add_assign(&mut self, rhs: Cost) {
        self.0 += rhs.0.as_inner() as f32;
    }
}

impl MulAssign<f32> for ApproxCost {
    #[inline]
    fn mul_assign(&mut self, rhs: f32) {
        *self = *self * rhs;
    }
}

forward_ref_binop!(impl Add<Self>::add for ApproxCost);
forward_ref_binop!(impl Add<Cost>::add for ApproxCost);
forward_ref_binop!(impl Mul<f32>::mul for ApproxCost);
forward_ref_op_assign!(impl AddAssign<Self>::add_assign for ApproxCost);
forward_ref_op_assign!(impl AddAssign<Cost>::add_assign for ApproxCost);
forward_ref_op_assign!(impl MulAssign<f32>::mul_assign for ApproxCost);

impl Sum for ApproxCost {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, Add::add)
    }
}

impl Sum<Cost> for ApproxCost {
    fn sum<I: Iterator<Item = Cost>>(iter: I) -> Self {
        iter.fold(Self::ZERO, Add::add)
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
    pub fn new_in<'heap>(body: &Body<'heap>, traversals: &Traversals<'heap>, alloc: A) -> Self {
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

    /// Iterates over all (local, cost) pairs that have assigned costs.
    pub fn iter(&self) -> impl Iterator<Item = (Local, Cost)> {
        self.costs
            .iter_enumerated()
            .filter_map(|(local, cost)| cost.map(|cost| (local, cost)))
    }
}

impl<A: Allocator> IntoIterator for &TraversalCostVec<A> {
    type Item = (Local, Cost);

    type IntoIter = impl Iterator<Item = (Local, Cost)>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Dense cost map for all statements in a body.
///
/// Stores the execution cost for every statement, indexed by [`Location`]. A `None` cost
/// indicates the target cannot execute that statement. The execution planner compares costs
/// across targets to determine the optimal execution strategy.
#[derive(Debug)]
pub struct StatementCostVec<A: Allocator = Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    costs: Vec<Option<Cost>, A>,
}

impl<A: Allocator> StatementCostVec<A> {
    #[expect(unsafe_code)]
    fn offsets(
        mut iter: impl ExactSizeIterator<Item = u32>,
        alloc: A,
    ) -> (Box<BasicBlockSlice<u32>, A>, usize) {
        let mut offsets = Box::new_uninit_slice_in(iter.len() + 1, alloc);

        let mut offset = 0_u32;

        offsets[0].write(0);

        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let next = iter.next()?;

            offset += next;

            Some(offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert_eq!(iter.len(), 0);

        // SAFETY: We have initialized all elements of the slice.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        (offsets, offset as usize)
    }

    fn from_iter(iter: impl ExactSizeIterator<Item = u32>, alloc: A) -> Self
    where
        A: Clone,
    {
        let (offsets, length) = Self::offsets(iter, alloc.clone());
        let costs = alloc::vec::from_elem_in(None, length, alloc);

        Self { offsets, costs }
    }

    /// Creates a cost map with space for all statements in the given blocks.
    ///
    /// All costs are initialized to `None` (unsupported). Use indexing to assign costs.
    #[expect(clippy::cast_possible_truncation)]
    pub fn new_in(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        Self::from_iter(
            blocks.iter().map(|block| block.statements.len() as u32),
            alloc,
        )
    }

    /// Rebuilds the offset table for a new block layout.
    ///
    /// Call after transforms that change statement counts per block. Does not resize or clear
    /// the cost data — callers must ensure the total statement count remains unchanged.
    #[expect(clippy::cast_possible_truncation)]
    pub fn remap(&mut self, blocks: &BasicBlocks)
    where
        A: Clone,
    {
        let alloc = Box::allocator(&self.offsets).clone();

        let (offsets, _) = Self::offsets(
            blocks.iter().map(|block| block.statements.len() as u32),
            alloc,
        );
        self.offsets = offsets;
    }

    /// Returns `true` if no statements have assigned costs.
    pub fn all_unassigned(&self) -> bool {
        self.costs.iter().all(Option::is_none)
    }

    /// Returns the cost slice for all statements in `block`.
    ///
    /// The returned slice is indexed by statement position (0-based within the block).
    pub fn of(&self, block: BasicBlockId) -> &[Option<Cost>] {
        let range = (self.offsets[block] as usize)..(self.offsets[block.plus(1)] as usize);

        &self.costs[range]
    }

    pub fn sum_approx(&self, block: BasicBlockId) -> ApproxCost {
        self.of(block).iter().copied().flatten().sum()
    }

    /// Returns a reference to the allocator used by this cost vector.
    pub fn allocator(&self) -> &A {
        Box::allocator(&self.offsets)
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

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use super::{Cost, StatementCostVec};
    use crate::body::{basic_block::BasicBlockId, location::Location};

    /// `Cost::new` succeeds for valid values (0 and 100).
    #[test]
    fn cost_new_valid_values() {
        let zero = Cost::new(0);
        assert!(zero.is_some());

        let hundred = Cost::new(100);
        assert!(hundred.is_some());
    }

    /// `Cost::new(u32::MAX)` returns `None` (reserved as niche for `Option<Cost>`).
    #[test]
    fn cost_new_max_returns_none() {
        let max = Cost::new(u32::MAX);
        assert!(max.is_none());
    }

    /// `Cost::new(u32::MAX - 1)` succeeds (largest valid cost value).
    #[test]
    fn cost_new_max_minus_one_valid() {
        let max_valid = Cost::new(u32::MAX - 1);
        assert!(max_valid.is_some());
    }

    /// `Cost::new_unchecked` with valid values works correctly.
    ///
    /// This test exercises unsafe code and should be run under Miri.
    #[test]
    #[expect(unsafe_code)]
    fn cost_new_unchecked_valid() {
        // SAFETY: 0 is not u32::MAX
        let zero = unsafe { Cost::new_unchecked(0) };
        assert_eq!(Cost::new(0), Some(zero));

        // SAFETY: 100 is not u32::MAX
        let hundred = unsafe { Cost::new_unchecked(100) };
        assert_eq!(Cost::new(100), Some(hundred));
    }

    /// `StatementCostVec` correctly indexes by `Location` across multiple blocks.
    #[test]
    fn statement_cost_vec_indexing() {
        // bb0: 2 statements, bb1: 3 statements, bb2: 1 statement
        let mut costs = StatementCostVec::from_iter([2, 3, 1].into_iter(), Global);

        // Assign costs at various locations
        let loc_0_1 = Location {
            block: BasicBlockId::new(0),
            statement_index: 1,
        };
        let loc_0_2 = Location {
            block: BasicBlockId::new(0),
            statement_index: 2,
        };
        let loc_1_2 = Location {
            block: BasicBlockId::new(1),
            statement_index: 2,
        };
        let loc_2_1 = Location {
            block: BasicBlockId::new(2),
            statement_index: 1,
        };

        costs[loc_0_1] = Some(cost!(10));
        costs[loc_0_2] = Some(cost!(20));
        costs[loc_1_2] = Some(cost!(30));
        costs[loc_2_1] = Some(cost!(40));

        // Verify retrieval
        assert_eq!(costs.get(loc_0_1), Some(cost!(10)));
        assert_eq!(costs.get(loc_0_2), Some(cost!(20)));
        assert_eq!(costs.get(loc_1_2), Some(cost!(30)));
        assert_eq!(costs.get(loc_2_1), Some(cost!(40)));

        // Unassigned locations return None
        let loc_1_1 = Location {
            block: BasicBlockId::new(1),
            statement_index: 1,
        };
        assert_eq!(costs.get(loc_1_1), None);
    }

    /// `StatementCostVec` initialization with a single block.
    ///
    /// This test exercises unsafe code and should be run under Miri.
    #[test]
    fn statement_cost_vec_init_single_block() {
        // Single block with 5 statements
        let mut costs = StatementCostVec::from_iter([5].into_iter(), Global);

        // All 5 statements should be accessible
        for index in 1..=5_u32 {
            let location = Location {
                block: BasicBlockId::new(0),
                statement_index: index as usize,
            };

            costs[location] = Some(Cost::new(index).expect("should be non-zero"));
        }

        for index in 1..=5 {
            let location = Location {
                block: BasicBlockId::new(0),
                statement_index: index as usize,
            };

            assert_eq!(costs.get(location), Cost::new(index));
        }
    }

    /// `StatementCostVec` initialization with multiple blocks of varying sizes.
    ///
    /// This test exercises unsafe code and should be run under Miri.
    #[test]
    fn statement_cost_vec_init_multiple_blocks() {
        // 0 statements, 1 statement, 5 statements
        let mut costs = StatementCostVec::from_iter([0, 1, 5].into_iter(), Global);

        // bb1 has 1 statement
        let loc_1_1 = Location {
            block: BasicBlockId::new(1),
            statement_index: 1,
        };
        costs[loc_1_1] = Some(cost!(100));
        assert_eq!(costs.get(loc_1_1), Some(cost!(100)));

        // bb2 has 5 statements
        for index in 1..=5 {
            let location = Location {
                block: BasicBlockId::new(2),
                statement_index: index as usize,
            };

            costs[location] = Some(Cost::new(index).expect("non-zero"));
        }
        for index in 1..=5 {
            let location = Location {
                block: BasicBlockId::new(2),
                statement_index: index as usize,
            };
            assert_eq!(costs.get(location), Cost::new(index));
        }
    }

    /// `StatementCostVec` initialization with zero blocks.
    ///
    /// This test exercises unsafe code and should be run under Miri.
    #[test]
    fn statement_cost_vec_init_empty() {
        // Should not panic
        let _costs = StatementCostVec::from_iter(core::iter::empty::<u32>(), Global);
    }
}
