use core::ops::ControlFlow;

use pretty::RcDoc;

use super::{
    Type, TypeId, environment::Environment, kind::TypeKind, pretty_print::PrettyPrint as _,
};
use crate::collection::FastHashSet;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct RecursionDepthBoundary {
    pub depth: usize,
    pub limit: usize,
}

impl RecursionDepthBoundary {
    pub fn pretty<'this>(
        self,
        env: &'this Environment,
        id: TypeId,
    ) -> RcDoc<'this, anstyle::Style> {
        if self.depth >= self.limit {
            RcDoc::text("...")
        } else {
            env.r#type(id).pretty(env, self.enter())
        }
    }

    const fn enter(self) -> Self {
        Self {
            depth: self.depth + 1,
            limit: self.limit,
        }
    }
}

/// Recursive Cycle
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
pub(crate) struct RecursionBoundary<'heap> {
    inner: FastHashSet<(*const TypeKind<'heap>, *const TypeKind<'heap>)>,
}

impl<'heap> RecursionBoundary<'heap> {
    pub(crate) fn new() -> Self {
        Self {
            inner: FastHashSet::default(),
        }
    }

    pub(crate) fn enter(&mut self, lhs: Type<'heap>, rhs: Type<'heap>) -> ControlFlow<()> {
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

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
        let lhs_kind = core::ptr::from_ref(lhs.kind);
        let rhs_kind = core::ptr::from_ref(rhs.kind);

        self.inner.remove(&(lhs_kind, rhs_kind))
    }
}
