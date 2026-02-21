use alloc::alloc::Global;
use core::{alloc::Allocator, ops::ControlFlow};

use super::{Type, kind::TypeKind};
use crate::{
    collections::{FastHashSet, fast_hash_set_in, fast_hash_set_with_capacity_in},
    intern::Interned,
};

/// Recursive cycle.
///
/// Represents whether both ends of a recursive subtype check have been seen in the current call
/// stack, allowing coinductive discharge when a cycle is detected.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecursionCycle {
    /// Was the left-hand type already on the stack.
    pub lhs: bool,
    /// Was the right-hand type already on the stack.
    pub rhs: bool,
}

impl RecursionCycle {
    /// Determine if we should discharge the cycle according to coinductive reasoning principles.
    ///
    /// In coinductive subtyping and equivalence checks for recursive types, this method determines
    /// whether we can accept the current relationship based on the detected cycle pattern.
    ///
    /// This method returns `true` when both types in the relationship have been observed in
    /// a recursive cycle (both `lhs` and `rhs` flags are true). This dual-recursion requirement
    /// ensures that:
    ///
    /// 1. We only discharge cycles when we have a genuine recursive relationship on both sides,
    ///    preventing unsound conclusions when only one type is recursive.
    ///
    /// 2. The coinductive hypothesis is correctly applied, following formal bisimulation principles
    ///    where we assume the relationship holds if the non-recursive parts are consistent.
    ///
    /// 3. The check maintains soundness in the type system by avoiding premature discharge in
    ///    complex type relationships where one side is non-recursive.
    ///
    /// This implementation aligns with formal coinductive definitions for recursive types as
    /// described in Pierce's "Types and Programming Languages" (Chapter 21) and Amadio &
    /// Cardelli's work on subtyping recursive types.
    pub(crate) const fn should_discharge(self) -> bool {
        self.lhs && self.rhs
    }
}

#[derive(Debug, Clone)]
pub(crate) struct RecursionBoundary<'heap, A: Allocator = Global> {
    inner: FastHashSet<
        (
            Interned<'heap, TypeKind<'heap>>,
            Interned<'heap, TypeKind<'heap>>,
        ),
        A,
    >,
}

impl RecursionBoundary<'_> {
    #[inline]
    pub(crate) fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<'heap, A: Allocator> RecursionBoundary<'heap, A> {
    #[inline]
    pub(crate) fn new_in(alloc: A) -> Self {
        Self {
            inner: fast_hash_set_in(alloc),
        }
    }

    #[inline]
    pub(crate) fn with_capacity_in(capacity: usize, alloc: A) -> Self {
        Self {
            inner: fast_hash_set_with_capacity_in(capacity, alloc),
        }
    }

    pub(crate) fn enter(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> ControlFlow<()> {
        // Using `new_unchecked` here is safe, due to the fact that the `TypeKind` comes directly
        // from interning. See the `Decompose` implementation for more details.
        let lhs_kind = Interned::new_unchecked(lhs.kind);
        let rhs_kind = Interned::new_unchecked(rhs.kind);

        // Insert returns true if the element was not already in the set
        let should_enter = self.inner.insert((lhs_kind, rhs_kind));

        // Only insert if the element was not already in the set, otherwise our coinductive
        // recursion detection will always discharge.
        if should_enter {
            ControlFlow::Continue(())
        } else {
            ControlFlow::Break(())
        }
    }

    pub(crate) fn exit(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> bool {
        // Using `new_unchecked` here is safe, due to the fact that the `TypeKind` comes directly
        // from interning. See the `Decompose` implementation for more details.
        let lhs_kind = Interned::new_unchecked(lhs.kind);
        let rhs_kind = Interned::new_unchecked(rhs.kind);

        self.inner.remove(&(lhs_kind, rhs_kind))
    }
}
