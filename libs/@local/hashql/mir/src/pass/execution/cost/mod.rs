//! Cost tracking for execution planning.
//!
//! Three levels of cost representation:
//!
//! - **Per-statement**: [`StatementCostVec`] records the [`Cost`] of each statement on a given
//!   target. Produced by the statement placement pass and consumed by [`BasicBlockCostAnalysis`].
//!
//! - **Per-terminator**: [`TerminatorCostVec`] records the [`Cost`] of each block's terminator on a
//!   given target. Produced alongside statement costs during placement analysis.
//!
//! - **Per-block**: [`BasicBlockCostVec`] aggregates statement and terminator costs and adds a path
//!   transfer premium for non-origin backends. This is what the placement solver operates on.

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    fmt,
    iter::Sum,
    ops::{Add, AddAssign, Index, IndexMut, Mul, MulAssign},
};
use std::f32;

use hashql_core::id::Id as _;

pub(crate) use self::analysis::{BasicBlockCostAnalysis, BasicBlockCostVec};
use super::block_partitioned_vec::BlockPartitionedVec;
use crate::{
    body::{
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        basic_blocks::BasicBlocks,
        location::Location,
    },
    macros::{forward_ref_binop, forward_ref_op_assign},
    pass::analysis::size_estimation::InformationUnit,
};

mod analysis;
#[cfg(test)]
mod tests;

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

    #[inline]
    #[must_use]
    pub const fn saturating_mul(self, other: u32) -> Self {
        let raw = self.0.as_inner();

        Self::new_saturating(raw.saturating_mul(other))
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

impl From<InformationUnit> for ApproxCost {
    fn from(value: InformationUnit) -> Self {
        #[expect(clippy::cast_precision_loss)]
        Self(value.as_u32() as f32)
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

/// Per-block cost of executing the terminator on a given target.
///
/// Each block has exactly one terminator. A `None` cost indicates the target cannot execute that
/// terminator (the terminator's operands are not supported on the target). One instance exists per
/// target inside `TargetArray<TerminatorCostVec>`.
#[derive(Debug)]
pub(crate) struct TerminatorCostVec<A: Allocator = Global>(BasicBlockVec<Option<Cost>, A>);

impl<A: Allocator + Clone> TerminatorCostVec<A> {
    /// Creates a cost vector with one slot per block, all initialized to `None` (unsupported).
    pub(crate) fn new_in(blocks: &BasicBlocks, alloc: A) -> Self {
        Self(BasicBlockVec::with_capacity_in(blocks.len(), alloc))
    }
}

impl<A: Allocator> TerminatorCostVec<A> {
    /// Returns `true` if no terminators have assigned costs.
    #[cfg(test)]
    pub(crate) fn all_unassigned(&self) -> bool {
        self.0.iter().all(Option::is_none)
    }

    /// Returns the cost for the terminator in `block`, or `None` if the target cannot execute it.
    pub(crate) fn of(&self, block: BasicBlockId) -> Option<Cost> {
        self.0.lookup(block).copied()
    }

    pub(crate) fn insert(&mut self, block: BasicBlockId, cost: Cost) {
        self.0.insert(block, cost);
    }

    /// Remaps terminator costs after block splitting.
    ///
    /// For each original block, the original terminator cost is placed on the last block
    /// of its region (which holds the original terminator after splitting). All preceding
    /// blocks in the region received synthesized `Goto` terminators and get zero cost.
    ///
    /// Operates in-place by extending the vec, then shuffling entries from back to front
    /// to avoid overwriting unprocessed entries.
    pub(crate) fn remap(&mut self, regions: &BasicBlockSlice<(core::num::NonZero<usize>, bool)>) {
        let mut new_length = BasicBlockId::START;
        for (_, (region_len, _)) in regions.iter_enumerated() {
            new_length.increment_by(region_len.get());
        }

        // Extend to the new size. New slots are initialized to `None`.
        self.0.fill_until(new_length.minus(1), || None);

        // Walk regions in reverse so we never overwrite an unprocessed original entry.
        let mut write = new_length;
        for (original, (region_len, _)) in regions.iter_enumerated().rev() {
            let original_cost = self.0[original];

            // The last block in the region holds the original terminator.
            write.decrement_by(1);
            self.0[write] = original_cost;

            // Preceding blocks have synthesized Goto terminators: zero cost.
            for _ in 1..region_len.get() {
                write.decrement_by(1);
                self.0[write] = Some(cost!(0));
            }
        }

        debug_assert_eq!(write, BasicBlockId::START);
    }

    /// Returns the approximate cost for the terminator in `block`, or zero if unassigned.
    pub(crate) fn approx(&self, block: BasicBlockId) -> ApproxCost {
        debug_assert!(self.0.contains(block));
        self.0
            .lookup(block)
            .copied()
            .map_or(ApproxCost::ZERO, ApproxCost::from)
    }
}

/// Dense cost map for all statements in a body.
///
/// Stores the execution cost for every statement, indexed by [`Location`]. A `None` cost
/// indicates the target cannot execute that statement. The execution planner compares costs
/// across targets to determine the optimal execution strategy.
#[derive(Debug)]
pub(crate) struct StatementCostVec<A: Allocator = Global>(BlockPartitionedVec<Option<Cost>, A>);

impl<A: Allocator + Clone> StatementCostVec<A> {
    #[cfg(test)]
    pub(crate) fn from_iter(iter: impl ExactSizeIterator<Item = u32>, alloc: A) -> Self {
        Self(BlockPartitionedVec::new_in(iter, None, alloc))
    }

    /// Creates a cost map with space for all statements in the given blocks.
    ///
    /// All costs are initialized to `None` (unsupported). Use indexing to assign costs.
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn new_in(blocks: &BasicBlocks, alloc: A) -> Self {
        Self(BlockPartitionedVec::new_in(
            blocks.iter().map(|block| block.statements.len() as u32),
            None,
            alloc,
        ))
    }
}

impl<A: Allocator> StatementCostVec<A> {
    /// Rebuilds the offset table for a new block layout.
    ///
    /// Call after transforms that change statement counts per block. Does not resize or clear
    /// the cost data; callers must ensure the total statement count remains unchanged.
    #[expect(clippy::cast_possible_truncation)]
    pub(crate) fn remap(&mut self, blocks: &BasicBlocks)
    where
        A: Clone,
    {
        self.0
            .remap(blocks.iter().map(|block| block.statements.len() as u32));
    }

    /// Returns `true` if no statements have assigned costs.
    #[cfg(test)]
    pub(crate) fn all_unassigned(&self) -> bool {
        self.0.iter().all(Option::is_none)
    }

    /// Returns the cost slice for all statements in `block`.
    ///
    /// The returned slice is indexed by statement position (0-based within the block).
    pub(crate) fn of(&self, block: BasicBlockId) -> &[Option<Cost>] {
        self.0.of(block)
    }

    pub(crate) fn sum_approx(&self, block: BasicBlockId) -> ApproxCost {
        self.of(block).iter().copied().flatten().sum()
    }

    /// Returns the cost at `location`, or `None` if out of bounds or unassigned.
    #[cfg(test)]
    pub(crate) fn get(&self, location: Location) -> Option<Cost> {
        self.0
            .of(location.block)
            .get(location.statement_index - 1)
            .copied()
            .flatten()
    }
}

impl<A: Allocator> Index<Location> for StatementCostVec<A> {
    type Output = Option<Cost>;

    fn index(&self, index: Location) -> &Self::Output {
        // statement_index is 1-based
        &self.0.of(index.block)[index.statement_index - 1]
    }
}

impl<A: Allocator> IndexMut<Location> for StatementCostVec<A> {
    fn index_mut(&mut self, index: Location) -> &mut Self::Output {
        // statement_index is 1-based
        &mut self.0.of_mut(index.block)[index.statement_index - 1]
    }
}
